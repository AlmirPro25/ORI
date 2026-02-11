
import { GoogleGenerativeAI } from "@google/generative-ai";
import winston from 'winston';
import { TMDBService } from './tmdb-service';

const logger = winston.createLogger({
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
    ),
    transports: [new winston.transports.Console()]
});

// API Key via variável de ambiente
const apiKey = process.env.GEMINI_API_KEY;

export class AIService {
    private model: any;
    private isConfigured: boolean;

    constructor() {
        if (!apiKey) {
            logger.warn('[GEMINI] ⚠️ GEMINI_API_KEY não configurada. Enriquecimento por IA desabilitado.');
            this.isConfigured = false;
            return;
        }
        const genAI = new GoogleGenerativeAI(apiKey);
        // UPGRADE: Modelo mais capaz para enriquecimento de metadados (Gemini 3.0 Pro)
        this.model = genAI.getGenerativeModel({ model: "gemini-3.0-pro" });
        this.isConfigured = true;
        logger.info('[GEMINI] ✅ Serviço de IA inicializado com sucesso.');
    }

    async enrichContent(title: string, rawDescription: string) {
        // Se IA não disponível, usa fallbacks
        if (!this.isConfigured) {
            return this.fallbackEnrichment(title, rawDescription);
        }

        logger.info(`[GEMINI] 🧠 Analisando conteúdo: "${title}" para enriquecimento...`);

        const prompt = `
        Você é um especialista em curadoria de cinema e streaming.
        
        Tarefa: Melhore os metadados para um filme/série extraído de um torrent.
        Título Original do Torrent: "${title}".
        Contexto original: "${rawDescription}".

        Gere um JSON estrito com os seguintes campos:
        1. "titulo_limpo": O nome real do filme/série (ex: de "Sintel.2010.1080p" para "Sintel").
        2. "sinopse": Um resumo atraente e profissional em Português do Brasil (máximo 3 linhas).
        3. "categoria": A melhor categoria para este conteúdo (ex: Ação, Sci-Fi, Drama, Documentário, Animação).
        4. "tags": Uma lista de 3 a 5 tags relevantes.

        Responda APENAS com o JSON válido, sem markdown ou explicações adicionais.
        `;

        try {
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const metadata = JSON.parse(cleanText);

            logger.info(`[GEMINI] ✨ Conteúdo enriquecido: ${metadata.titulo_limpo} (${metadata.categoria})`);

            // Buscar poster via TMDB como fallback
            let posterUrl = null;
            try {
                const tmdbResults = await TMDBService.search(metadata.titulo_limpo);
                if (tmdbResults.length > 0) {
                    posterUrl = tmdbResults[0].backdrop_path || tmdbResults[0].poster_path;
                    logger.info(`[GEMINI] 🖼️ Poster encontrado via TMDB: ${posterUrl}`);
                }
            } catch (e) {
                logger.warn('[GEMINI] Fallback TMDB para poster falhou.');
            }

            return {
                title: metadata.titulo_limpo,
                description: metadata.sinopse,
                category: metadata.categoria,
                tags: metadata.tags,
                poster: posterUrl
            };
        } catch (error: any) {
            logger.error(`[GEMINI] ❌ Falha ao enriquecer conteúdo: ${error.message}`);
            return this.fallbackEnrichment(title, rawDescription);
        }
    }

    async decomposeSearchQuery(query: string): Promise<string[]> {
        // Fallback inteligente sem IA: gerar variações PT-BR automaticamente
        const ptbrFallback = this.generatePTBRVariations(query);

        if (!this.isConfigured) {
            logger.info(`[SEARCH] 🇧🇷 Fallback PT-BR (sem IA): ${ptbrFallback.join(', ')}`);
            return ptbrFallback;
        }

        logger.info(`[GEMINI] 🔍 Decompondo termo de busca: "${query}"...`);

        const prompt = `
        Você é um motor de busca de torrents brasileiro. 
        O usuário quer encontrar: "${query}".

        REGRAS OBRIGATÓRIAS:
        1. SEMPRE inclua variações com "dublado" e "dual audio" para maximizar resultados PT-BR.
        2. Se for um filme/série estrangeiro, inclua o nome ORIGINAL em inglês.
        3. Se parecer ser uma SÉRIE DE TV:
           - Inclua o nome da série + "complete" ou "season pack"
           - Inclua variações como "S01E01", "temporada 1"
           - Inclua o nome em inglês + "season"
        4. Se for uma busca genérica (ex: "filmes de ação"), sugira 3-4 títulos populares que correspondam.
        5. Inclua variações com e sem ano de lançamento.
        6. NÃO inclua termos duplicados ou muito similares.

        PRIORIDADE: Resultados em PT-BR (dublado/legendado) > Qualidade (1080p/4K) > Seeds

        Retorne APENAS um array JSON de strings. Máximo 8 termos.
        Exemplo: ["Breaking Bad dublado", "Breaking Bad dual audio", "Breaking Bad S01 complete", "Breaking Bad season pack 1080p"]
        Responda SOMENTE o JSON, sem explicações.
        `;

        try {
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const terms = JSON.parse(cleanText);

            if (Array.isArray(terms) && terms.length > 0) {
                // Garantir que o termo original está na lista
                if (!terms.some((t: string) => t.toLowerCase() === query.toLowerCase())) {
                    terms.unshift(query);
                }
                // Mesclar com as variações PT-BR automáticas para garantir cobertura
                const merged = [...new Set([...terms, ...ptbrFallback])];
                logger.info(`[GEMINI] 🧠 Termos finais (${merged.length}): ${merged.join(' | ')}`);
                return merged.slice(0, 10);
            }
            return ptbrFallback;
        } catch (error: any) {
            logger.error(`[GEMINI] ❌ Falha ao decompor busca: ${error.message}`);
            return ptbrFallback;
        }
    }

    /**
     * Gera variações PT-BR de um termo de busca SEM depender de IA.
     * Funciona como fallback e como complemento à decomposição Gemini.
     */
    private generatePTBRVariations(query: string): string[] {
        const terms: string[] = [query];
        const q = query.toLowerCase().trim();

        // Detectar se já tem indicadores PT-BR
        const hasPTBR = /(dublado|dual|pt-br|ptbr|nacional|legendado)/i.test(q);

        if (!hasPTBR) {
            terms.push(`${query} dublado`);
            terms.push(`${query} dual audio`);
        }

        // Detectar padrões de série (S01, temporada, season, etc.)
        const seriesMatch = q.match(/(.+?)\s*(s\d{1,2}|season\s*\d|temporada\s*\d)/i);
        if (seriesMatch) {
            const seriesName = seriesMatch[1].trim();
            terms.push(`${seriesName} complete pack`);
            terms.push(`${seriesName} season pack dublado`);
        }

        // Se não parecer ser um S01E01, mas for potencialmente uma série (sem ano)
        // Adicionar variações de season pack
        if (!seriesMatch && !q.match(/\b(19|20)\d{2}\b/)) {
            terms.push(`${query} S01 complete`);
            terms.push(`${query} season pack`);
        }

        // Adicionar variação com qualidade
        if (!q.includes('1080p') && !q.includes('4k') && !q.includes('720p')) {
            terms.push(`${query} 1080p`);
        }

        return [...new Set(terms)]; // Remove duplicatas
    }

    private async fallbackEnrichment(title: string, rawDescription: string) {
        const cleanTitle = title
            .replace(/\./g, ' ')
            .replace(/\d{4}.*$/i, '')
            .replace(/\s+/g, ' ')
            .trim();

        // Tentar buscar poster via TMDB mesmo no fallback
        let posterUrl = null;
        try {
            const tmdbResults = await TMDBService.search(cleanTitle);
            if (tmdbResults.length > 0) {
                posterUrl = tmdbResults[0].backdrop_path || tmdbResults[0].poster_path;
            }
        } catch (e) { }

        return {
            title: cleanTitle || title,
            description: rawDescription || `Conteúdo processado automaticamente.`,
            category: "Geral",
            tags: ["NEXUS", "Auto"],
            poster: posterUrl
        };
    }
}

export const aiService = new AIService();
