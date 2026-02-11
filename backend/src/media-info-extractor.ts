/**
 * EXTRATOR DE INFORMAÇÕES DE MÍDIA
 * Extrai informações sobre áudio e legendas dos vídeos
 */

import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';

export interface AudioTrack {
    index: number;
    language: string;
    codec: string;
    channels: number;
    title?: string;
}

export interface SubtitleTrack {
    index: number;
    language: string;
    codec: string;
    title?: string;
}

export interface MediaInfo {
    audioTracks: AudioTrack[];
    subtitleTracks: SubtitleTrack[];
    hasPortuguese: boolean;
    hasDubbed: boolean;
}

const PORTUGUESE_CODES = ['por', 'pt', 'pt-br', 'pt-pt', 'portuguese', 'portugues'];

export class MediaInfoExtractor {
    
    /**
     * Extrai informações de áudio e legendas de um arquivo de vídeo
     */
    static async extractMediaInfo(videoPath: string): Promise<MediaInfo> {
        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(videoPath, (err, metadata) => {
                if (err) {
                    console.error('❌ Erro ao extrair info:', err);
                    return reject(err);
                }

                const audioTracks: AudioTrack[] = [];
                const subtitleTracks: SubtitleTrack[] = [];
                let hasPortuguese = false;
                let hasDubbed = false;

                // Processar streams
                metadata.streams?.forEach((stream: any) => {
                    if (stream.codec_type === 'audio') {
                        const lang = this.normalizeLanguage(stream.tags?.language || stream.tags?.title || 'unknown');
                        const track: AudioTrack = {
                            index: stream.index,
                            language: lang,
                            codec: stream.codec_name,
                            channels: stream.channels || 2,
                            title: stream.tags?.title
                        };
                        audioTracks.push(track);

                        // Verificar se tem português
                        if (this.isPortuguese(lang) || this.isPortuguese(stream.tags?.title || '')) {
                            hasPortuguese = true;
                            hasDubbed = true;
                        }
                    }

                    if (stream.codec_type === 'subtitle') {
                        const lang = this.normalizeLanguage(stream.tags?.language || stream.tags?.title || 'unknown');
                        const track: SubtitleTrack = {
                            index: stream.index,
                            language: lang,
                            codec: stream.codec_name,
                            title: stream.tags?.title
                        };
                        subtitleTracks.push(track);

                        // Verificar se tem legendas em português
                        if (this.isPortuguese(lang) || this.isPortuguese(stream.tags?.title || '')) {
                            hasPortuguese = true;
                        }
                    }
                });

                // Verificar arquivos .srt externos
                const externalSubs = this.findExternalSubtitles(videoPath);
                externalSubs.forEach(sub => {
                    subtitleTracks.push(sub);
                    if (this.isPortuguese(sub.language) || this.isPortuguese(sub.title || '')) {
                        hasPortuguese = true;
                    }
                });

                resolve({
                    audioTracks,
                    subtitleTracks,
                    hasPortuguese,
                    hasDubbed
                });
            });
        });
    }

    /**
     * Procura por arquivos de legenda externos (.srt)
     */
    private static findExternalSubtitles(videoPath: string): SubtitleTrack[] {
        const dir = path.dirname(videoPath);
        const basename = path.basename(videoPath, path.extname(videoPath));
        const subtitles: SubtitleTrack[] = [];

        try {
            const files = fs.readdirSync(dir);
            files.forEach((file, index) => {
                if (file.endsWith('.srt') && file.startsWith(basename)) {
                    const lang = this.extractLanguageFromFilename(file);
                    subtitles.push({
                        index: 1000 + index, // Índice alto para não conflitar
                        language: lang,
                        codec: 'srt',
                        title: file
                    });
                }
            });
        } catch (err) {
            console.warn('⚠️ Erro ao buscar legendas externas:', err);
        }

        return subtitles;
    }

    /**
     * Extrai idioma do nome do arquivo (ex: movie.pt-br.srt)
     */
    private static extractLanguageFromFilename(filename: string): string {
        const match = filename.match(/\.(pt-br|pt|en|es|fr|de|it|ja|ko|zh)\.srt$/i);
        if (match) {
            return this.normalizeLanguage(match[1]);
        }
        return 'unknown';
    }

    /**
     * Normaliza código de idioma
     */
    private static normalizeLanguage(lang: string): string {
        const normalized = lang.toLowerCase().trim();
        
        if (PORTUGUESE_CODES.some(code => normalized.includes(code))) {
            return 'pt-BR';
        }
        
        const langMap: { [key: string]: string } = {
            'eng': 'en',
            'english': 'en',
            'spa': 'es',
            'spanish': 'es',
            'fre': 'fr',
            'french': 'fr',
            'ger': 'de',
            'german': 'de',
            'ita': 'it',
            'italian': 'it',
            'jpn': 'ja',
            'japanese': 'ja',
            'kor': 'ko',
            'korean': 'ko',
            'chi': 'zh',
            'chinese': 'zh'
        };

        return langMap[normalized] || normalized;
    }

    /**
     * Verifica se é português
     */
    private static isPortuguese(text: string): boolean {
        const normalized = text.toLowerCase();
        return PORTUGUESE_CODES.some(code => normalized.includes(code));
    }

    /**
     * Formata informações para exibição
     */
    static formatMediaInfo(info: MediaInfo): string {
        const parts: string[] = [];

        if (info.hasDubbed) {
            parts.push('🎙️ Dublado PT-BR');
        }

        if (info.audioTracks.length > 0) {
            const audioLangs = [...new Set(info.audioTracks.map(t => t.language))];
            parts.push(`🔊 Áudio: ${audioLangs.join(', ')}`);
        }

        if (info.subtitleTracks.length > 0) {
            const subLangs = [...new Set(info.subtitleTracks.map(t => t.language))];
            parts.push(`📝 Legendas: ${subLangs.join(', ')}`);
        }

        return parts.join(' | ');
    }

    /**
     * Gera badges para UI
     */
    static generateBadges(info: MediaInfo): Array<{ label: string; type: string }> {
        const badges: Array<{ label: string; type: string }> = [];

        if (info.hasDubbed) {
            badges.push({ label: 'Dublado PT-BR', type: 'success' });
        } else if (info.hasPortuguese) {
            badges.push({ label: 'Legendas PT-BR', type: 'info' });
        }

        // Áudios disponíveis
        const audioLangs = [...new Set(info.audioTracks.map(t => t.language))];
        if (audioLangs.length > 1) {
            badges.push({ label: `${audioLangs.length} áudios`, type: 'default' });
        }

        // Legendas disponíveis
        if (info.subtitleTracks.length > 0) {
            badges.push({ label: `${info.subtitleTracks.length} legendas`, type: 'default' });
        }

        return badges;
    }
}
