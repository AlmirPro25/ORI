/**
 * OPENSUBTITLES SERVICE - Integração Real com API de Legendas
 * =============================================================
 * API: OpenSubtitles REST API v2
 * Suporta busca por título, IMDB ID, hash de arquivo
 * Prioriza PT-BR por padrão
 */

import axios from 'axios';
import winston from 'winston';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const logger = winston.createLogger({
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
    ),
    transports: [new winston.transports.Console()]
});

// API Configuration
const OPENSUBTITLES_API_URL = 'https://api.opensubtitles.com/api/v1';
const OPENSUBTITLES_API_KEY = process.env.OPENSUBTITLES_API_KEY || '';
const USER_AGENT = 'StreamForge/1.0.0';

// Fallback APIs
const SUBDL_API_URL = 'https://api.subdl.com/api/v1';
const YIFYSUBTITLES_URL = 'https://yifysubtitles.org';

interface SubtitleResult {
    id: string;
    language: string;
    languageCode: string;
    fileName: string;
    downloadUrl: string;
    rating: number;
    downloadCount: number;
    provider: string;
    format: 'srt' | 'vtt' | 'sub' | 'ass';
    hearingImpaired?: boolean;
    releaseInfo?: string;
}

interface SearchOptions {
    query: string;
    imdbId?: string;
    year?: number;
    season?: number;
    episode?: number;
    languages?: string[];
    prioritizePTBR?: boolean;
}

export class OpenSubtitlesService {
    private apiKey: string;
    private downloadDir: string;
    private isConfigured: boolean;

    constructor() {
        this.apiKey = OPENSUBTITLES_API_KEY;
        this.downloadDir = path.join(__dirname, '../uploads/subtitles');
        this.isConfigured = !!this.apiKey;

        if (!this.isConfigured) {
            logger.warn('[SUBTITLES] ⚠️ OPENSUBTITLES_API_KEY não configurada. Usando fontes alternativas.');
        }

        if (!fs.existsSync(this.downloadDir)) {
            fs.mkdirSync(this.downloadDir, { recursive: true });
        }
    }

    /**
     * Busca legendas com priorização para PT-BR
     */
    async search(options: SearchOptions): Promise<SubtitleResult[]> {
        const { query, imdbId, year, languages = ['pt-BR', 'pt', 'en'], prioritizePTBR = true } = options;

        logger.info(`[SUBTITLES] 🔍 Buscando legendas: "${query}" | Idiomas: ${languages.join(', ')}`);

        const results: SubtitleResult[] = [];

        // 1. Tentar OpenSubtitles API (se configurada)
        if (this.isConfigured) {
            try {
                const osResults = await this.searchOpenSubtitles(query, imdbId, year, languages);
                results.push(...osResults);
            } catch (e: any) {
                logger.warn(`[SUBTITLES] OpenSubtitles falhou: ${e.message}`);
            }
        }

        // 2. Tentar Subdl como fallback
        try {
            const subdlResults = await this.searchSubdl(query, languages);
            results.push(...subdlResults);
        } catch (e: any) {
            logger.warn(`[SUBTITLES] Subdl falhou: ${e.message}`);
        }

        // 3. Tentar YIFY Subtitles para filmes
        if (!options.season && !options.episode) {
            try {
                const yifyResults = await this.searchYIFY(query, languages);
                results.push(...yifyResults);
            } catch (e: any) {
                logger.warn(`[SUBTITLES] YIFY falhou: ${e.message}`);
            }
        }

        // 4. Ordenar resultados: PT-BR primeiro, depois por rating
        const sorted = this.sortResults(results, prioritizePTBR);

        logger.info(`[SUBTITLES] ✅ ${sorted.length} legendas encontradas`);

        return sorted;
    }

    /**
     * OpenSubtitles REST API v2
     */
    private async searchOpenSubtitles(
        query: string,
        imdbId?: string,
        year?: number,
        languages?: string[]
    ): Promise<SubtitleResult[]> {
        const params: Record<string, any> = {};

        if (imdbId) {
            params.imdb_id = imdbId.replace('tt', '');
        } else {
            params.query = query;
        }

        if (year) params.year = year;
        if (languages && languages.length > 0) {
            params.languages = languages.join(',').toLowerCase();
        }

        const response = await axios.get(`${OPENSUBTITLES_API_URL}/subtitles`, {
            params,
            headers: {
                'Api-Key': this.apiKey,
                'User-Agent': USER_AGENT,
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });

        if (!response.data?.data) return [];

        return response.data.data.map((sub: any) => ({
            id: sub.id,
            language: sub.attributes.language || 'Unknown',
            languageCode: sub.attributes.language || 'en',
            fileName: sub.attributes.release || sub.attributes.files?.[0]?.file_name || 'subtitle.srt',
            downloadUrl: sub.attributes.files?.[0]?.file_id ?
                `${OPENSUBTITLES_API_URL}/download/${sub.attributes.files[0].file_id}` : '',
            rating: sub.attributes.ratings || 0,
            downloadCount: sub.attributes.download_count || 0,
            provider: 'OpenSubtitles',
            format: 'srt',
            hearingImpaired: sub.attributes.hearing_impaired,
            releaseInfo: sub.attributes.release
        }));
    }

    /**
     * Subdl API (gratuita, sem autenticação)
     */
    private async searchSubdl(query: string, languages: string[]): Promise<SubtitleResult[]> {
        const results: SubtitleResult[] = [];

        // Subdl não tem paginação por idioma, busca geral
        const response = await axios.get(`${SUBDL_API_URL}/subtitles`, {
            params: {
                query: query,
                type: 'movie' // ou 'tv'
            },
            headers: {
                'User-Agent': USER_AGENT
            },
            timeout: 15000
        });

        if (!response.data?.subtitles) return [];

        for (const sub of response.data.subtitles) {
            // Filtrar por idiomas desejados
            const langCode = sub.language?.toLowerCase() || '';
            const wantedLangs = languages.map(l => l.toLowerCase().split('-')[0]);

            if (!wantedLangs.includes(langCode) && wantedLangs.length > 0) continue;

            results.push({
                id: sub.id || crypto.randomUUID(),
                language: sub.language || 'Unknown',
                languageCode: sub.language || 'en',
                fileName: sub.release_name || 'subtitle.srt',
                downloadUrl: sub.url || '',
                rating: sub.hi ? 8.0 : 7.5, // Estimativa
                downloadCount: 0,
                provider: 'Subdl',
                format: 'srt',
                releaseInfo: sub.release_name
            });
        }

        return results;
    }

    /**
     * YIFY Subtitles (scraping para filmes)
     */
    private async searchYIFY(query: string, languages: string[]): Promise<SubtitleResult[]> {
        try {
            // YIFY usa slug do filme na URL
            const slug = query.toLowerCase()
                .replace(/[^a-z0-9\s]/g, '')
                .replace(/\s+/g, '-');

            const searchUrl = `${YIFYSUBTITLES_URL}/search?q=${encodeURIComponent(query)}`;

            const response = await axios.get(searchUrl, {
                headers: { 'User-Agent': USER_AGENT },
                timeout: 15000
            });

            // Parse básico do HTML (YIFY tem estrutura simples)
            const results: SubtitleResult[] = [];

            // Regex simples para extrair links de legendas PT-BR
            const langPatterns: Record<string, RegExp> = {
                'pt-BR': /brazil|portuguese-br|brazillian/i,
                'pt': /portuguese/i,
                'en': /english/i,
                'es': /spanish/i
            };

            // Extrair links de download
            const downloadMatches = response.data.match(/href="(\/movie-subtitle\/[^"]+)"/g) || [];

            for (const match of downloadMatches.slice(0, 10)) {
                const path = match.replace('href="', '').replace('"', '');
                const fullUrl = `${YIFYSUBTITLES_URL}${path}`;

                // Tentar determinar idioma pelo path
                let detectedLang = 'en';
                for (const [lang, pattern] of Object.entries(langPatterns)) {
                    if (pattern.test(path)) {
                        detectedLang = lang;
                        break;
                    }
                }

                // Filtrar por idiomas desejados
                if (!languages.some(l => l.toLowerCase().startsWith(detectedLang))) continue;

                results.push({
                    id: crypto.randomUUID(),
                    language: detectedLang === 'pt-BR' ? 'Português (BR)' :
                        detectedLang === 'pt' ? 'Português' :
                            detectedLang === 'es' ? 'Español' : 'English',
                    languageCode: detectedLang,
                    fileName: `${query}.${detectedLang}.srt`,
                    downloadUrl: fullUrl,
                    rating: 7.0,
                    downloadCount: 0,
                    provider: 'YIFY Subtitles',
                    format: 'srt'
                });
            }

            return results;
        } catch (e) {
            return [];
        }
    }

    /**
     * Ordena resultados priorizando PT-BR
     */
    private sortResults(results: SubtitleResult[], prioritizePTBR: boolean): SubtitleResult[] {
        // Remover duplicatas por fileName
        const unique = new Map<string, SubtitleResult>();
        for (const sub of results) {
            const key = `${sub.languageCode}-${sub.fileName}`;
            if (!unique.has(key) || (unique.get(key)!.rating < sub.rating)) {
                unique.set(key, sub);
            }
        }

        const uniqueResults = Array.from(unique.values());

        // Ordenar
        return uniqueResults.sort((a, b) => {
            if (prioritizePTBR) {
                // PT-BR primeiro
                const aIsPTBR = a.languageCode === 'pt-BR' || a.languageCode === 'pt';
                const bIsPTBR = b.languageCode === 'pt-BR' || b.languageCode === 'pt';

                if (aIsPTBR && !bIsPTBR) return -1;
                if (!aIsPTBR && bIsPTBR) return 1;
            }

            // Depois por rating
            if (b.rating !== a.rating) return b.rating - a.rating;

            // Depois por downloads
            return b.downloadCount - a.downloadCount;
        });
    }

    /**
     * Download de legenda para arquivo local
     */
    async downloadSubtitle(
        downloadUrl: string,
        videoId: string,
        languageCode: string
    ): Promise<{ success: boolean, localPath?: string, error?: string }> {
        try {
            logger.info(`[SUBTITLES] 📥 Baixando legenda: ${downloadUrl}`);

            const headers: Record<string, string> = { 'User-Agent': USER_AGENT };

            // OpenSubtitles precisa de API key para download
            if (downloadUrl.includes('opensubtitles.com') && this.apiKey) {
                headers['Api-Key'] = this.apiKey;
            }

            const response = await axios.get(downloadUrl, {
                responseType: 'arraybuffer',
                headers,
                timeout: 30000
            });

            // Criar diretório do vídeo
            const videoSubDir = path.join(this.downloadDir, videoId);
            if (!fs.existsSync(videoSubDir)) {
                fs.mkdirSync(videoSubDir, { recursive: true });
            }

            // Salvar arquivo
            const filename = `subtitle.${languageCode}.srt`;
            const localPath = path.join(videoSubDir, filename);

            fs.writeFileSync(localPath, response.data);

            logger.info(`[SUBTITLES] ✅ Legenda salva: ${localPath}`);

            return { success: true, localPath };

        } catch (error: any) {
            logger.error(`[SUBTITLES] ❌ Erro no download: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Converte SRT para VTT (para uso no player HTML5)
     */
    convertSRTtoVTT(srtContent: string): string {
        let vtt = 'WEBVTT\n\n';

        // Substituir vírgula por ponto nos timestamps
        const lines = srtContent.split('\n');
        let buffer = '';

        for (const line of lines) {
            const trimmed = line.trim();

            // Linha de tempo
            if (trimmed.includes('-->')) {
                buffer += trimmed.replace(/,/g, '.') + '\n';
            }
            // Número da legenda (ignorar)
            else if (/^\d+$/.test(trimmed)) {
                // Adicionar separador se houver conteúdo anterior
                if (buffer.length > 0) {
                    vtt += buffer + '\n';
                    buffer = '';
                }
            }
            // Texto ou linha vazia
            else {
                buffer += trimmed + '\n';
            }
        }

        // Adicionar último bloco
        if (buffer.length > 0) {
            vtt += buffer;
        }

        return vtt;
    }

    /**
     * Lista idiomas suportados
     */
    getSupportedLanguages() {
        return [
            { code: 'pt-BR', name: 'Português (Brasil)', flag: '🇧🇷', priority: 1 },
            { code: 'pt', name: 'Português', flag: '🇵🇹', priority: 2 },
            { code: 'en', name: 'English', flag: '🇺🇸', priority: 3 },
            { code: 'es', name: 'Español', flag: '🇪🇸', priority: 4 },
            { code: 'fr', name: 'Français', flag: '🇫🇷', priority: 5 },
            { code: 'de', name: 'Deutsch', flag: '🇩🇪', priority: 6 },
            { code: 'it', name: 'Italiano', flag: '🇮🇹', priority: 7 },
            { code: 'ja', name: '日本語', flag: '🇯🇵', priority: 8 },
            { code: 'ko', name: '한국어', flag: '🇰🇷', priority: 9 },
            { code: 'zh', name: '中文', flag: '🇨🇳', priority: 10 },
            { code: 'ru', name: 'Русский', flag: '🇷🇺', priority: 11 },
            { code: 'ar', name: 'العربية', flag: '🇸🇦', priority: 12 }
        ];
    }
}

export const openSubtitlesService = new OpenSubtitlesService();
