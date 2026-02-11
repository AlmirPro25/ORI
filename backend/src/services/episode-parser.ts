/**
 * 📺 EPISODE PARSER SERVICE V2
 * 
 * Identifica automaticamente se um arquivo é parte de uma série
 * e extrai informações de temporada/episódio/qualidade.
 * 
 * Padrões suportados:
 * - S01E01, S1E1
 * - S01E01E02, S01E01-E03 (multi-episódio → retorna range)
 * - S00E01 (episódios especiais)
 * - 1x01, 01x01
 * - Season 1 Episode 1
 * - Temporada 1 Episodio 1 (PT-BR)
 * - S01 - E01
 * - Ep01, Episode 01
 * 
 * Edge cases tratados:
 * - Arquivos duplicados (diferentes qualidades)
 * - Episódios especiais (S00)
 * - Multi-episódio no mesmo arquivo (E01E02, E01-E03)
 * - Arquivos sample/extras
 * - Filtragem de não-vídeo
 */

export interface ParsedEpisode {
    seriesName: string;
    seasonNumber: number;
    episodeNumber: number;
    episodeEndNumber?: number; // Para ranges (E01-E03 → episodeEndNumber = 3)
    quality?: string;
    releaseGroup?: string;
    year?: number;
    isSpecial: boolean;       // S00 = episódio especial
    isSample: boolean;        // Arquivo sample/preview
    isMultiEpisode: boolean;  // E01E02 = multi-episódio
    codec?: string;           // x264, x265, HEVC
    audioCodec?: string;      // AAC, DTS, AC3
    sizeBytes?: number;       // Tamanho para deduplicação
}

interface PatternMatch {
    pattern: RegExp;
    seasonGroup: number;
    episodeGroup: number;
    episodeEndGroup?: number; // Grupo do episódio final (para ranges)
}

// Extensões de vídeo aceitas
const VIDEO_EXTENSIONS = /\.(mkv|mp4|avi|wmv|flv|mov|webm|ts|m4v|mpg|mpeg|m2ts)$/i;

// Extensões de legendas
const SUBTITLE_EXTENSIONS = /\.(srt|sub|ass|ssa|vtt|idx)$/i;

// Padrões que indicam arquivo sample/extra
const SAMPLE_PATTERNS = /\b(sample|trailer|preview|extra|bonus|featurette|behind.the.scenes|deleted.scenes?|gag.reel|interview|promo)\b/i;

export class EpisodeParser {
    // ========================================
    // PADRÕES DE DETECÇÃO (ordenados por especificidade)
    // ========================================
    private patterns: PatternMatch[] = [
        // S01E01E02 ou S01E01-E02 (multi-episódio) — DEVE vir antes do S01E01 simples
        {
            pattern: /S(\d{1,2})E(\d{1,3})[-–]?E(\d{1,3})/i,
            seasonGroup: 1, episodeGroup: 2, episodeEndGroup: 3
        },
        // S01E01 (mais comum)
        { pattern: /S(\d{1,2})E(\d{1,3})/i, seasonGroup: 1, episodeGroup: 2 },
        // S01 - E01
        { pattern: /S(\d{1,2})\s*[-–]\s*E(\d{1,3})/i, seasonGroup: 1, episodeGroup: 2 },
        // 1x01
        { pattern: /(\d{1,2})x(\d{1,3})/i, seasonGroup: 1, episodeGroup: 2 },
        // Season 1 Episode 1
        { pattern: /Season\s*(\d+)\s*Episode\s*(\d+)/i, seasonGroup: 1, episodeGroup: 2 },
        // Temporada 1 Episodio 1 (PT-BR)
        { pattern: /Temporada\s*(\d+)\s*Epis[oó]dio\s*(\d+)/i, seasonGroup: 1, episodeGroup: 2 },
        // Cap. 01 ou Capitulo 01 (PT/ES)
        { pattern: /(?:Cap(?:itulo|ítulo)?\.?\s*)(\d+)/i, seasonGroup: -1, episodeGroup: 1 },
        // E01 ou Ep01 (assume season 1 se sem temporada)
        { pattern: /(?:^|[\.\s_\-])(?:E|Ep|Episode)\s*(\d{1,3})(?:[\.\s_\-]|$)/i, seasonGroup: -1, episodeGroup: 1 },
        // Episódio puro por número (3 dígitos, ex: 101 = S01E01) — último recurso (comum em anime)
        { pattern: /(?:^|[\.\s_\-])(\d)(\d{2})(?:[\.\s_\-]|$)/, seasonGroup: 1, episodeGroup: 2 },
    ];

    // Padrões para extrair qualidade
    private qualityPatterns = [
        /\b(2160p|4K|UHD)\b/i,
        /\b(1080p|FHD)\b/i,
        /\b(720p|HD)\b/i,
        /\b(480p|SD)\b/i,
        /\b(HDTV)\b/i,
        /\b(WEB-?DL|WEBRip)\b/i,
        /\b(BluRay|BDRip|BRRip)\b/i,
        /\b(DVDRip|DVDR)\b/i,
        /\b(REMUX)\b/i,
    ];

    // Padrões para codec de vídeo
    private codecPatterns = [
        /\b(x264|h\.?264|AVC)\b/i,
        /\b(x265|h\.?265|HEVC)\b/i,
        /\b(AV1)\b/i,
        /\b(VP9)\b/i,
        /\b(MPEG-?2)\b/i,
    ];

    // Padrões para codec de áudio
    private audioCodecPatterns = [
        /\b(AAC)\b/i,
        /\b(AC3|AC-3|DD|Dolby\s*Digital)\b/i,
        /\b(DTS(?:-HD)?(?:\s*MA)?)\b/i,
        /\b(FLAC)\b/i,
        /\b(TrueHD|Atmos)\b/i,
        /\b(EAC3|E-AC-3|DDP|DD\+)\b/i,
        /\b(Opus)\b/i,
    ];

    // Padrões para release group
    private releaseGroupPattern = /[-\[]([A-Za-z0-9]+)\]?$/;

    // Padrões para ano
    private yearPattern = /\b((?:19|20)\d{2})\b/;

    /**
     * Analisa um nome de arquivo e extrai informações do episódio
     */
    parse(filename: string): ParsedEpisode | null {
        // Remove extensão
        const cleanName = this.removeExtension(filename);

        // Detectar sample/extra ANTES do parse
        const isSample = this.isSampleFile(filename);

        for (const { pattern, seasonGroup, episodeGroup, episodeEndGroup } of this.patterns) {
            const match = cleanName.match(pattern);
            if (match) {
                const seasonNumber = seasonGroup === -1 ? 1 : parseInt(match[seasonGroup], 10);
                const episodeNumber = parseInt(match[episodeGroup], 10);
                const episodeEndNumber = episodeEndGroup && match[episodeEndGroup]
                    ? parseInt(match[episodeEndGroup], 10)
                    : undefined;

                // Validar números — agora aceita S00 (specials)
                if (seasonNumber < 0 || seasonNumber > 99) continue;
                if (episodeNumber < 0 || episodeNumber > 999) continue;
                if (episodeEndNumber !== undefined && (episodeEndNumber < episodeNumber || episodeEndNumber > 999)) continue;

                const isSpecial = seasonNumber === 0;
                const isMultiEpisode = episodeEndNumber !== undefined && episodeEndNumber > episodeNumber;

                return {
                    seriesName: this.extractSeriesName(cleanName, match.index || 0),
                    seasonNumber,
                    episodeNumber,
                    episodeEndNumber,
                    quality: this.extractQuality(cleanName),
                    releaseGroup: this.extractReleaseGroup(cleanName),
                    year: this.extractYear(cleanName),
                    isSpecial,
                    isSample,
                    isMultiEpisode,
                    codec: this.extractCodec(cleanName),
                    audioCodec: this.extractAudioCodec(cleanName),
                };
            }
        }

        return null;
    }

    /**
     * Parse com expansão de multi-episódio.
     * Retorna um ParsedEpisode por cada episódio no range.
     * Ex: S01E01E03 → [S01E01, S01E02, S01E03]
     */
    parseExpanded(filename: string): ParsedEpisode[] {
        const result = this.parse(filename);
        if (!result) return [];

        if (!result.isMultiEpisode || !result.episodeEndNumber) {
            return [result];
        }

        const expanded: ParsedEpisode[] = [];
        for (let ep = result.episodeNumber; ep <= result.episodeEndNumber; ep++) {
            expanded.push({
                ...result,
                episodeNumber: ep,
                episodeEndNumber: undefined,
                isMultiEpisode: false, // Cada entrada expandida é individual
            });
        }
        return expanded;
    }

    /**
     * Verifica se um arquivo é parte de uma série
     */
    isSeriesFile(filename: string): boolean {
        const cleanName = this.removeExtension(filename);
        return this.patterns.some(({ pattern }) => pattern.test(cleanName));
    }

    /**
     * Verifica se é um arquivo de vídeo válido
     */
    isVideoFile(filename: string): boolean {
        return VIDEO_EXTENSIONS.test(filename);
    }

    /**
     * Verifica se é um arquivo de legenda
     */
    isSubtitleFile(filename: string): boolean {
        return SUBTITLE_EXTENSIONS.test(filename);
    }

    /**
     * Verifica se é um arquivo sample/extra
     */
    isSampleFile(filename: string): boolean {
        return SAMPLE_PATTERNS.test(filename);
    }

    /**
     * Filtra uma lista de arquivos, retornando apenas vídeos válidos de séries.
     * Remove:
     * - Arquivos não-vídeo (NFO, SRT, RAR, etc.)
     * - Amostras (sample, trailer)
     * - Duplicatas (mantém a melhor qualidade)
     */
    filterAndDeduplicate(files: Array<{ name: string; path: string; length: number; index: number }>): Array<{
        name: string;
        path: string;
        length: number;
        index: number;
        parsed: ParsedEpisode;
    }> {
        // 1. Filtrar: apenas vídeos com padrão de série
        const candidates = files
            .filter(f => this.isVideoFile(f.name))
            .filter(f => !this.isSampleFile(f.name))
            .map(f => {
                const parsed = this.parse(f.name);
                if (!parsed) return null;
                parsed.sizeBytes = f.length;
                return { ...f, parsed };
            })
            .filter((f): f is NonNullable<typeof f> => f !== null);

        // 2. Deduplicar: por (season, episode), manter o de melhor qualidade
        const bestMap = new Map<string, typeof candidates[0]>();

        for (const candidate of candidates) {
            const key = `S${candidate.parsed.seasonNumber}E${candidate.parsed.episodeNumber}`;
            const existing = bestMap.get(key);

            if (!existing) {
                bestMap.set(key, candidate);
            } else {
                // Comparar qualidade
                const existingScore = this.qualityScore(existing.parsed.quality);
                const candidateScore = this.qualityScore(candidate.parsed.quality);

                if (candidateScore > existingScore) {
                    bestMap.set(key, candidate);
                } else if (candidateScore === existingScore && candidate.length > existing.length) {
                    // Mesma qualidade → preferir o maior (provavelmente melhor encode)
                    bestMap.set(key, candidate);
                }
            }
        }

        // 3. Ordenar por temporada e episódio
        return Array.from(bestMap.values()).sort((a, b) => {
            if (a.parsed.seasonNumber !== b.parsed.seasonNumber) {
                return a.parsed.seasonNumber - b.parsed.seasonNumber;
            }
            return a.parsed.episodeNumber - b.parsed.episodeNumber;
        });
    }

    /**
     * Extrai o nome da série do filename
     */
    extractSeriesName(filename: string, matchIndex?: number): string {
        const cleanName = this.removeExtension(filename);

        // Se temos o index do match, pegar tudo antes dele
        let rawName: string;
        if (matchIndex !== undefined && matchIndex > 0) {
            rawName = cleanName.substring(0, matchIndex);
        } else {
            // Fallback: remover o padrão do episódio e tudo depois
            rawName = cleanName;
            for (const { pattern } of this.patterns) {
                const match = rawName.match(pattern);
                if (match && match.index !== undefined) {
                    rawName = rawName.substring(0, match.index);
                    break;
                }
            }
        }

        // Normalizar: trocar pontos, underscores, hífens por espaços
        rawName = rawName
            .replace(/[._]/g, ' ')
            .replace(/-/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // Remover ano se estiver no final
        rawName = rawName.replace(/\s*\b(19|20)\d{2}\b\s*$/, '').trim();

        // Remover qualidade que pode ter ficado no nome
        rawName = rawName.replace(/\s*(1080p|720p|2160p|480p|WEB|BluRay|HDTV)\s*/gi, ' ').trim();

        // Capitalize each word
        return rawName
            .split(' ')
            .filter(w => w.length > 0)
            .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(' ');
    }

    /**
     * Extrai qualidade do filename
     */
    extractQuality(filename: string): string | undefined {
        for (const pattern of this.qualityPatterns) {
            const match = filename.match(pattern);
            if (match) {
                const q = match[1].toLowerCase();
                if (q === '4k' || q === 'uhd') return '2160p';
                if (q === 'fhd') return '1080p';
                if (q === 'hd' || q === 'hdtv') return '720p';
                if (q === 'sd') return '480p';
                if (q === 'remux') return 'REMUX';
                if (q.includes('web')) return 'WEB-DL';
                if (q.includes('blu') || q.includes('bd') || q.includes('br')) return 'BluRay';
                if (q.includes('dvd')) return '480p';
                return match[1];
            }
        }
        return undefined;
    }

    /**
     * Score numérico da qualidade (para comparação)
     */
    private qualityScore(quality?: string): number {
        if (!quality) return 0;
        const q = quality.toLowerCase();
        if (q.includes('remux')) return 100;
        if (q.includes('2160') || q.includes('4k')) return 90;
        if (q.includes('1080')) return 70;
        if (q.includes('blu')) return 65;
        if (q.includes('web')) return 60;
        if (q.includes('720')) return 50;
        if (q.includes('hdtv')) return 40;
        if (q.includes('480') || q.includes('dvd')) return 20;
        return 10;
    }

    /**
     * Extrai codec de vídeo
     */
    private extractCodec(filename: string): string | undefined {
        for (const pattern of this.codecPatterns) {
            const match = filename.match(pattern);
            if (match) {
                const c = match[1].toLowerCase();
                if (c.includes('265') || c === 'hevc') return 'HEVC';
                if (c.includes('264') || c === 'avc') return 'H.264';
                return match[1].toUpperCase();
            }
        }
        return undefined;
    }

    /**
     * Extrai codec de áudio
     */
    private extractAudioCodec(filename: string): string | undefined {
        for (const pattern of this.audioCodecPatterns) {
            const match = filename.match(pattern);
            if (match) return match[1].toUpperCase();
        }
        return undefined;
    }

    /**
     * Extrai release group
     */
    private extractReleaseGroup(filename: string): string | undefined {
        const match = filename.match(this.releaseGroupPattern);
        return match ? match[1] : undefined;
    }

    /**
     * Extrai ano
     */
    private extractYear(filename: string): number | undefined {
        const match = filename.match(this.yearPattern);
        if (match) {
            const year = parseInt(match[1], 10);
            if (year >= 1950 && year <= new Date().getFullYear() + 1) {
                return year;
            }
        }
        return undefined;
    }

    /**
     * Remove extensão do arquivo
     */
    private removeExtension(filename: string): string {
        return filename.replace(/\.(mkv|mp4|avi|wmv|flv|mov|webm|ts|m4v|mpg|mpeg|m2ts|srt|sub|ass|ssa|vtt|idx|nfo|txt|jpg|png)$/i, '');
    }
}

// Instância singleton
export const episodeParser = new EpisodeParser();
