import { GoogleGenerativeAI } from "@google/generative-ai";
import winston from "winston";
import { TMDBService } from "./tmdb-service";

const logger = winston.createLogger({
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
    ),
    transports: [new winston.transports.Console()]
});

const apiKey = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

export class AIService {
    private model: any;
    private isConfigured: boolean;
    private quotaCooldownUntil = 0;

    constructor() {
        if (!apiKey) {
            logger.warn("[GEMINI] GEMINI_API_KEY nao configurada. Enriquecimento por IA desabilitado.");
            this.isConfigured = false;
            return;
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        this.model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
        this.isConfigured = true;
        logger.info("[GEMINI] Servico de IA inicializado com sucesso.");
    }

    async enrichContent(title: string, rawDescription: string) {
        if (!this.isConfigured || this.isQuotaCoolingDown()) {
            return this.fallbackEnrichment(title, rawDescription);
        }

        logger.info(`[GEMINI] Analisando conteudo: "${title}" para enriquecimento...`);

        const prompt = `
        Voce e um especialista em curadoria de cinema e streaming.

        Tarefa: melhore os metadados para um filme/serie extraido de um torrent.
        Titulo original do torrent: "${title}".
        Contexto original: "${rawDescription}".

        Gere um JSON estrito com os seguintes campos:
        1. "titulo_limpo": o nome real do filme/serie.
        2. "sinopse": um resumo atraente e profissional em Portugues do Brasil (maximo 3 linhas).
        3. "categoria": a melhor categoria para este conteudo.
        4. "tags": uma lista de 3 a 5 tags relevantes.

        Responda apenas com JSON valido.
        `;

        try {
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            const cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();
            const metadata = JSON.parse(cleanText);

            logger.info(`[GEMINI] Conteudo enriquecido: ${metadata.titulo_limpo} (${metadata.categoria})`);

            let posterUrl = null;
            try {
                const tmdbResults = await TMDBService.search(metadata.titulo_limpo);
                if (tmdbResults.length > 0) {
                    posterUrl = tmdbResults[0].backdrop_path || tmdbResults[0].poster_path;
                }
            } catch {
                logger.warn("[GEMINI] Fallback TMDB para poster falhou.");
            }

            return {
                title: metadata.titulo_limpo,
                description: metadata.sinopse,
                category: metadata.categoria,
                tags: metadata.tags,
                poster: posterUrl
            };
        } catch (error: any) {
            this.handleQuotaError(error);
            logger.error(`[GEMINI] Falha ao enriquecer conteudo: ${error?.message || error}`);
            return this.fallbackEnrichment(title, rawDescription);
        }
    }

    async decomposeSearchQuery(query: string): Promise<string[]> {
        const ptbrFallback = this.generatePTBRVariations(query);

        if (!this.isConfigured || this.isQuotaCoolingDown()) {
            logger.info(`[SEARCH] Fallback local ativo: ${ptbrFallback.join(" | ")}`);
            return ptbrFallback;
        }

        logger.info(`[GEMINI] Decompondo termo de busca: "${query}"...`);

        const prompt = `
        Voce e um motor de busca de torrents brasileiro.
        O usuario quer encontrar: "${query}".

        Regras obrigatorias:
        1. Sempre inclua variacoes com "dublado", "dual audio" e "legendado" quando fizer sentido.
        2. Se for um filme/serie estrangeiro, inclua o nome original em ingles.
        3. Se parecer ser uma serie de TV, inclua:
           - season pack / complete season
           - temporada 1 / season 1
           - S01E01 quando apropriado
        4. Inclua variacoes com e sem ano de lancamento.
        5. Nao inclua termos duplicados.

        Responda apenas com um array JSON de strings. Maximo 8 termos.
        `;

        try {
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            const cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();
            const terms = JSON.parse(cleanText);

            if (Array.isArray(terms) && terms.length > 0) {
                if (!terms.some((t: string) => t.toLowerCase() === query.toLowerCase())) {
                    terms.unshift(query);
                }
                const merged = [...new Set([...terms, ...ptbrFallback])];
                logger.info(`[GEMINI] Termos finais (${merged.length}): ${merged.join(" | ")}`);
                return merged.slice(0, 12);
            }

            return ptbrFallback;
        } catch (error: any) {
            this.handleQuotaError(error);
            logger.error(`[GEMINI] Falha ao decompor busca: ${error?.message || error}`);
            return ptbrFallback;
        }
    }

    private generatePTBRVariations(query: string): string[] {
        const terms: string[] = [];
        const raw = query.trim();
        const lower = raw.toLowerCase();
        const year = raw.match(/\b(19|20)\d{2}\b/)?.[0];
        const hasPTBR = /(dublado|dual audio|dual-audio|pt-br|ptbr|portugu[eê]s|nacional|legendado|legenda pt)/i.test(lower);
        const looksLikeSeries = /\b(temporada|season|epis[oó]dio|episode|s\d{1,2}(?:e\d{1,2})?)\b/i.test(lower);
        const hasEpisodePattern = /\bs\d{1,2}e\d{1,2}\b/i.test(lower);

        const add = (term?: string) => {
            if (!term) return;
            const normalized = term.replace(/\s+/g, " ").trim();
            if (!normalized) return;
            if (!terms.some(existing => existing.toLowerCase() === normalized.toLowerCase())) {
                terms.push(normalized);
            }
        };

        const cleanBase = raw
            .replace(/[._]+/g, " ")
            .replace(/\b(1080p|720p|2160p|4k|webrip|web-dl|bluray|brrip|x264|x265|hevc|10bit)\b/gi, " ")
            .replace(/\s+/g, " ")
            .trim();

        const withoutYear = cleanBase.replace(/\b(19|20)\d{2}\b/g, " ").replace(/\s+/g, " ").trim();
        const noSubtitle = withoutYear.replace(/\s*[:\-]\s.*$/g, "").trim();
        const noMovieSuffix = noSubtitle.replace(/\b(o filme|the movie|movie)\b/gi, "").replace(/\s+/g, " ").trim();
        const baseCandidates = [raw, cleanBase, withoutYear, noSubtitle, noMovieSuffix].filter(Boolean);
        const yearlessCandidates = baseCandidates.filter(candidate => !/\b(19|20)\d{2}\b/.test(candidate));

        baseCandidates.forEach(add);

        if (year) {
            yearlessCandidates.forEach(candidate => add(`${candidate} ${year}`));
        }

        if (!hasPTBR) {
            baseCandidates.forEach(candidate => {
                add(`${candidate} dublado`);
                add(`${candidate} dual audio`);
                add(`${candidate} portugues`);
                add(`${candidate} legendado`);
            });
        }

        baseCandidates.forEach(candidate => {
            add(`${candidate} 1080p`);
            add(`${candidate} web-dl`);
            add(`${candidate} webrip`);
        });

        if (looksLikeSeries) {
            const seriesBase = noMovieSuffix || noSubtitle || withoutYear || cleanBase || raw;
            add(`${seriesBase} season 1`);
            add(`${seriesBase} temporada 1`);
            add(`${seriesBase} S01 complete`);
            add(`${seriesBase} season pack`);
            add(`${seriesBase} complete season`);
            add(`${seriesBase} dublado`);
            add(`${seriesBase} dual audio`);
            if (!hasEpisodePattern) {
                add(`${seriesBase} S01E01`);
                add(`${seriesBase} episodio 1 dublado`);
            }
        }

        return terms.slice(0, 14);
    }

    private isQuotaCoolingDown(): boolean {
        return Date.now() < this.quotaCooldownUntil;
    }

    private handleQuotaError(error: any) {
        const message = String(error?.message || "");
        const status = Number(error?.status || error?.response?.status || 0);
        const isQuotaError =
            status === 429 ||
            /429|quota|resource_exhausted|too many requests/i.test(message);

        if (!isQuotaError) {
            return;
        }

        const cooldownMs = 15 * 60 * 1000;
        this.quotaCooldownUntil = Date.now() + cooldownMs;
        logger.warn(`[GEMINI] Cota atingida. Ativando heuristica local por ${Math.round(cooldownMs / 60000)} min.`);
    }

    private async fallbackEnrichment(title: string, rawDescription: string) {
        const cleanTitle = title
            .replace(/\./g, " ")
            .replace(/\[[^\]]*\]/g, " ")
            .replace(/\([^\)]*\)/g, " ")
            .replace(/\d{4}.*$/i, "")
            .replace(/\s+/g, " ")
            .trim();

        let posterUrl = null;
        try {
            const tmdbResults = await TMDBService.search(cleanTitle);
            if (tmdbResults.length > 0) {
                posterUrl = tmdbResults[0].backdrop_path || tmdbResults[0].poster_path;
            }
        } catch {
            // noop
        }

        return {
            title: cleanTitle || title,
            description: rawDescription || "Conteudo processado automaticamente.",
            category: "Geral",
            tags: ["NEXUS", "Auto"],
            poster: posterUrl
        };
    }
}

export const aiService = new AIService();
