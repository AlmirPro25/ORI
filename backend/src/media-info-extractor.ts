/**
 * EXTRATOR DE INFORMACOES DE MIDIA
 * Extrai audio/legendas e gera uma leitura mais confiavel de idioma.
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
    languageConfidence: number;
    detectionSource: 'tag-language' | 'tag-title' | 'filename' | 'fallback';
    evidence: string[];
}

export interface SubtitleTrack {
    index: number;
    language: string;
    codec: string;
    title?: string;
    languageConfidence: number;
    detectionSource: 'tag-language' | 'tag-title' | 'filename' | 'fallback';
    evidence: string[];
}

export interface MediaDetectionSummary {
    primaryAudioLanguage: string | null;
    primarySubtitleLanguage: string | null;
    portugueseAudioConfidence: number;
    portugueseSubtitleConfidence: number;
    dubbedConfidence: number;
    subtitleConfidence: number;
}

export interface MediaInfo {
    audioTracks: AudioTrack[];
    subtitleTracks: SubtitleTrack[];
    hasPortuguese: boolean;
    hasDubbed: boolean;
    detectionSummary: MediaDetectionSummary;
}

type LanguageDetection = {
    language: string;
    confidence: number;
    source: 'tag-language' | 'tag-title' | 'filename' | 'fallback';
    evidence: string[];
};

const PORTUGUESE_CODES = ['por', 'pt', 'pt-br', 'pt_pt', 'pt-pt', 'portuguese', 'portugues', 'brazilian portuguese'];
const PT_BR_HINTS = ['pt-br', 'ptbr', 'brasil', 'brasileiro', 'brazilian', 'dublado', 'dual audio', 'audio br', 'audio pt'];
const PT_PT_HINTS = ['pt-pt', 'portugal', 'lusitano', 'european portuguese'];
const SUBTITLE_EXTENSIONS = ['.srt', '.sub', '.ass', '.ssa', '.vtt', '.idx'];

function normalize(value?: string | null) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function toConfidence(value: number) {
    return Number(Math.max(0, Math.min(1, value)).toFixed(3));
}

export class MediaInfoExtractor {
    static async extractMediaInfo(videoPath: string): Promise<MediaInfo> {
        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(videoPath, (err, metadata) => {
                if (err) {
                    console.error('Erro ao extrair info:', err);
                    return reject(err);
                }

                const audioTracks: AudioTrack[] = [];
                const subtitleTracks: SubtitleTrack[] = [];

                metadata.streams?.forEach((stream: any) => {
                    if (stream.codec_type === 'audio') {
                        const detection = this.detectLanguage({
                            tagLanguage: stream.tags?.language,
                            title: stream.tags?.title,
                            fallbackText: `${stream.codec_name || ''} ${stream.tags?.handler_name || ''}`,
                        });

                        audioTracks.push({
                            index: stream.index,
                            language: detection.language,
                            codec: stream.codec_name,
                            channels: stream.channels || 2,
                            title: stream.tags?.title,
                            languageConfidence: detection.confidence,
                            detectionSource: detection.source,
                            evidence: detection.evidence,
                        });
                    }

                    if (stream.codec_type === 'subtitle') {
                        const detection = this.detectLanguage({
                            tagLanguage: stream.tags?.language,
                            title: stream.tags?.title,
                            fallbackText: `${stream.codec_name || ''} ${stream.tags?.handler_name || ''}`,
                        });

                        subtitleTracks.push({
                            index: stream.index,
                            language: detection.language,
                            codec: stream.codec_name,
                            title: stream.tags?.title,
                            languageConfidence: detection.confidence,
                            detectionSource: detection.source,
                            evidence: detection.evidence,
                        });
                    }
                });

                const externalSubs = this.findExternalSubtitles(videoPath);
                subtitleTracks.push(...externalSubs);

                const detectionSummary = this.buildDetectionSummary(audioTracks, subtitleTracks);

                resolve({
                    audioTracks,
                    subtitleTracks,
                    hasPortuguese: detectionSummary.portugueseAudioConfidence >= 0.55 || detectionSummary.portugueseSubtitleConfidence >= 0.55,
                    hasDubbed: detectionSummary.dubbedConfidence >= 0.6,
                    detectionSummary,
                });
            });
        });
    }

    private static detectLanguage(input: { tagLanguage?: string; title?: string; fallbackText?: string }): LanguageDetection {
        const tagLanguage = normalize(input.tagLanguage);
        const title = normalize(input.title);
        const fallbackText = normalize(input.fallbackText);
        const combined = [tagLanguage, title, fallbackText].filter(Boolean).join(' ');

        if (!combined) {
            return {
                language: 'unknown',
                confidence: 0.1,
                source: 'fallback',
                evidence: ['no-language-signals'],
            };
        }

        if (this.hasPtPtSignal(combined)) {
            return {
                language: 'pt-PT',
                confidence: toConfidence(tagLanguage ? 0.88 : 0.72),
                source: tagLanguage ? 'tag-language' : title ? 'tag-title' : 'fallback',
                evidence: this.collectEvidence(combined, PT_PT_HINTS),
            };
        }

        if (this.hasPtBrSignal(combined)) {
            return {
                language: 'pt-BR',
                confidence: toConfidence(tagLanguage ? 0.96 : title ? 0.84 : 0.68),
                source: tagLanguage ? 'tag-language' : title ? 'tag-title' : 'fallback',
                evidence: this.collectEvidence(combined, [...PT_BR_HINTS, ...PORTUGUESE_CODES]),
            };
        }

        if (PORTUGUESE_CODES.some((code) => combined.includes(code))) {
            return {
                language: 'pt-BR',
                confidence: toConfidence(tagLanguage ? 0.78 : 0.58),
                source: tagLanguage ? 'tag-language' : title ? 'tag-title' : 'fallback',
                evidence: this.collectEvidence(combined, PORTUGUESE_CODES),
            };
        }

        const langMap: Record<string, string> = {
            eng: 'en',
            english: 'en',
            spa: 'es',
            spanish: 'es',
            espanol: 'es',
            latino: 'es-419',
            latam: 'es-419',
            fre: 'fr',
            french: 'fr',
            ger: 'de',
            german: 'de',
            ita: 'it',
            italian: 'it',
            jpn: 'ja',
            japanese: 'ja',
            jap: 'ja',
            kor: 'ko',
            korean: 'ko',
            chi: 'zh',
            chinese: 'zh',
        };

        for (const [key, normalizedLanguage] of Object.entries(langMap)) {
            if (combined.includes(key)) {
                return {
                    language: normalizedLanguage,
                    confidence: toConfidence(tagLanguage ? 0.86 : 0.66),
                    source: tagLanguage ? 'tag-language' : title ? 'tag-title' : 'fallback',
                    evidence: [key],
                };
            }
        }

        return {
            language: tagLanguage || title || 'unknown',
            confidence: 0.28,
            source: tagLanguage ? 'tag-language' : title ? 'tag-title' : 'fallback',
            evidence: [combined.slice(0, 64)],
        };
    }

    private static hasPtBrSignal(text: string) {
        return PT_BR_HINTS.some((hint) => text.includes(hint));
    }

    private static hasPtPtSignal(text: string) {
        return PT_PT_HINTS.some((hint) => text.includes(hint));
    }

    private static collectEvidence(text: string, hints: string[]) {
        return hints.filter((hint) => text.includes(hint)).slice(0, 4);
    }

    private static buildDetectionSummary(audioTracks: AudioTrack[], subtitleTracks: SubtitleTrack[]): MediaDetectionSummary {
        const strongestAudio = [...audioTracks].sort((a, b) => b.languageConfidence - a.languageConfidence)[0] || null;
        const strongestSubtitle = [...subtitleTracks].sort((a, b) => b.languageConfidence - a.languageConfidence)[0] || null;

        const portugueseAudioConfidence = audioTracks
            .filter((track) => track.language === 'pt-BR')
            .reduce((best, track) => Math.max(best, track.languageConfidence), 0);
        const portugueseSubtitleConfidence = subtitleTracks
            .filter((track) => track.language === 'pt-BR')
            .reduce((best, track) => Math.max(best, track.languageConfidence), 0);

        return {
            primaryAudioLanguage: strongestAudio?.language || null,
            primarySubtitleLanguage: strongestSubtitle?.language || null,
            portugueseAudioConfidence: toConfidence(portugueseAudioConfidence),
            portugueseSubtitleConfidence: toConfidence(portugueseSubtitleConfidence),
            dubbedConfidence: toConfidence(portugueseAudioConfidence),
            subtitleConfidence: toConfidence(portugueseSubtitleConfidence),
        };
    }

    private static findExternalSubtitles(videoPath: string): SubtitleTrack[] {
        const dir = path.dirname(videoPath);
        const basename = path.basename(videoPath, path.extname(videoPath));
        const subtitles: SubtitleTrack[] = [];

        try {
            const files = fs.readdirSync(dir);
            files.forEach((file, index) => {
                const normalizedFile = normalize(file);
                const hasSubtitleExtension = SUBTITLE_EXTENSIONS.some((extension) => normalizedFile.endsWith(extension));
                if (!hasSubtitleExtension || !normalizedFile.startsWith(normalize(basename))) {
                    return;
                }

                const detection = this.detectLanguage({
                    title: file,
                    fallbackText: path.extname(file),
                });

                subtitles.push({
                    index: 1000 + index,
                    language: detection.language,
                    codec: path.extname(file).replace('.', '') || 'subtitle',
                    title: file,
                    languageConfidence: detection.confidence,
                    detectionSource: 'filename',
                    evidence: detection.evidence,
                });
            });
        } catch (err) {
            console.warn('Erro ao buscar legendas externas:', err);
        }

        return subtitles;
    }

    static formatMediaInfo(info: MediaInfo): string {
        const parts: string[] = [];

        if (info.hasDubbed) {
            parts.push('Dublado PT-BR');
        } else if (info.detectionSummary.portugueseSubtitleConfidence >= 0.55) {
            parts.push('Legenda PT-BR');
        }

        if (info.audioTracks.length > 0) {
            const audioLangs = [...new Set(info.audioTracks.map((track) => track.language))];
            parts.push(`Audio: ${audioLangs.join(', ')}`);
        }

        if (info.subtitleTracks.length > 0) {
            const subLangs = [...new Set(info.subtitleTracks.map((track) => track.language))];
            parts.push(`Legendas: ${subLangs.join(', ')}`);
        }

        return parts.join(' | ');
    }

    static generateBadges(info: MediaInfo): Array<{ label: string; type: string }> {
        const badges: Array<{ label: string; type: string }> = [];

        if (info.detectionSummary.dubbedConfidence >= 0.6) {
            badges.push({ label: 'Dublado PT-BR', type: 'success' });
        } else if (info.detectionSummary.subtitleConfidence >= 0.55) {
            badges.push({ label: 'Legendas PT-BR', type: 'info' });
        }

        const audioLangs = [...new Set(info.audioTracks.map((track) => track.language))];
        if (audioLangs.length > 1) {
            badges.push({ label: `${audioLangs.length} audios`, type: 'default' });
        }

        if (info.subtitleTracks.length > 0) {
            badges.push({ label: `${info.subtitleTracks.length} legendas`, type: 'default' });
        }

        return badges;
    }
}
