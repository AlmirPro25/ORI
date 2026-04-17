import axios from 'axios';
import NodeCache from 'node-cache';
import dotenv from 'dotenv';
import {
    countPatternMatches,
    GENERIC_LOW_SIGNAL_CHANNEL_PATTERNS,
    normalizePortugueseText,
    PORTUGUESE_KEYWORD_PATTERNS,
    TRUSTED_PORTUGUESE_CHANNEL_PATTERNS,
} from './config/portuguese-content-sources';

dotenv.config();

// Cache TTL: 1 hora para buscas comuns. Preservacao de Quota e resposta rapida.
const cache = new NodeCache({ stdTTL: 3600 });
const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3';
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_REGION = 'BR';
const YOUTUBE_LANGUAGE = 'pt';

type SearchFlavor = 'default' | 'dubbed' | 'official';

interface YouTubeSearchCandidate {
    q: string;
    flavor: SearchFlavor;
}

interface YouTubeSearchItem {
    id?: {
        videoId?: string;
    };
    snippet?: {
        title?: string;
        description?: string;
        channelTitle?: string;
        publishedAt?: string;
        defaultAudioLanguage?: string;
        defaultLanguage?: string;
        thumbnails?: {
            default?: { url?: string };
            high?: { url?: string };
            maxres?: { url?: string };
        };
    };
}

interface YouTubeVideoItem {
    id: string;
    snippet?: YouTubeSearchItem['snippet'];
    contentDetails?: {
        duration?: string;
        caption?: string;
        definition?: string;
    };
}

interface YouTubeSearchResponse {
    items?: YouTubeSearchItem[];
}

interface YouTubeVideosResponse {
    items?: YouTubeVideoItem[];
}

export interface YouTubeVideoDTO {
    youtubeId: string;
    title: string;
    thumbnail: string;
    channelTitle: string;
    description: string;
    publishedAt: string;
    duration?: string;
    ptbrScore?: number;
    trustedSource?: boolean;
    sourceSignal?: string;
    defaultAudioLanguage?: string;
    caption?: string;
}

function buildSearchCandidates(query: string): YouTubeSearchCandidate[] {
    const cleanQuery = query.trim().replace(/\s+/g, ' ');
    if (!cleanQuery) return [];

    const candidates: YouTubeSearchCandidate[] = [{ q: cleanQuery, flavor: 'default' }];

    if (!/\b(dublado|legendado|pt-br|portugues|português|oficial)\b/i.test(cleanQuery)) {
        candidates.push({ q: `${cleanQuery} dublado`, flavor: 'dubbed' });
        candidates.push({ q: `${cleanQuery} oficial`, flavor: 'official' });
    }

    const seen = new Set<string>();
    return candidates.filter((candidate) => {
        const key = normalizePortugueseText(candidate.q);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function scoreVideo(item: any) {
    const title = String(item?.snippet?.title || '');
    const description = String(item?.snippet?.description || '');
    const channelTitle = String(item?.snippet?.channelTitle || '');
    const audioLanguage = String(item?.snippet?.defaultAudioLanguage || item?.snippet?.defaultLanguage || '');
    const normalizedText = normalizePortugueseText(`${title} ${description} ${channelTitle} ${audioLanguage}`);

    const trustedSource = TRUSTED_PORTUGUESE_CHANNEL_PATTERNS.some((pattern) => pattern.test(channelTitle));
    const portugueseHits = countPatternMatches(normalizedText, PORTUGUESE_KEYWORD_PATTERNS);
    const lowSignalHits = countPatternMatches(normalizedText, GENERIC_LOW_SIGNAL_CHANNEL_PATTERNS);
    const hasPortugueseAudio =
        audioLanguage.toLowerCase().startsWith('pt') ||
        /\bdublado\b|\bpt-br\b|\bportugues\b/.test(normalizedText);
    const hasCaptions = item?.contentDetails?.caption === 'true';
    const hdBonus = item?.contentDetails?.definition === 'hd' ? 10 : 0;

    return {
        score:
            (trustedSource ? 80 : 0) +
            (hasPortugueseAudio ? 45 : 0) +
            (hasCaptions ? 10 : 0) +
            (portugueseHits * 12) +
            hdBonus -
            (lowSignalHits * 8),
        trustedSource,
        hasPortugueseAudio,
        hasCaptions,
    };
}

function mapVideo(item: any): YouTubeVideoDTO | null {
    if (!item?.id || !item?.snippet) return null;

    const score = scoreVideo(item);

    return {
        youtubeId: item.id,
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails?.maxres?.url
            || item.snippet.thumbnails?.high?.url
            || item.snippet.thumbnails?.default?.url,
        channelTitle: item.snippet.channelTitle,
        description: item.snippet.description,
        publishedAt: item.snippet.publishedAt,
        duration: item.contentDetails?.duration,
        ptbrScore: score.score,
        trustedSource: score.trustedSource,
        sourceSignal: score.trustedSource
            ? 'trusted-ptbr-channel'
            : score.hasPortugueseAudio
                ? 'ptbr-audio-signal'
                : score.hasCaptions
                    ? 'caption-signal'
                    : 'generic-search',
        defaultAudioLanguage: item.snippet.defaultAudioLanguage || item.snippet.defaultLanguage,
        caption: item.contentDetails?.caption,
    };
}

export class YouTubeService {
    /**
     * Executa busca no YouTube com foco em conteudo PT-BR, ranking de fonte e cache-first.
     */
    static async searchVideos(query: string): Promise<YouTubeVideoDTO[]> {
        if (!YOUTUBE_API_KEY) {
            console.warn('⚠️ [ORION] YOUTUBE_API_KEY nao configurada. Buscas globais desabilitadas.');
            return [];
        }

        const cacheKey = `search_${query.toLowerCase().trim()}`;
        const cached = cache.get<YouTubeVideoDTO[]>(cacheKey);

        if (cached) {
            console.log(`[ORION] Cache Hit: ${query}`);
            return cached;
        }

        try {
            console.log(`[ORION] YouTube API Call: ${query}`);
            const candidates = buildSearchCandidates(query);

            const searchResponses = await Promise.all(
                candidates.map((candidate) =>
                    axios.get<YouTubeSearchResponse>(`${YOUTUBE_API_URL}/search`, {
                        params: {
                            part: 'snippet',
                            q: candidate.q,
                            type: 'video',
                            maxResults: candidate.flavor === 'default' ? 12 : 8,
                            order: candidate.flavor === 'official' ? 'relevance' : 'viewCount',
                            regionCode: YOUTUBE_REGION,
                            relevanceLanguage: YOUTUBE_LANGUAGE,
                            safeSearch: 'moderate',
                            videoEmbeddable: 'true',
                            key: YOUTUBE_API_KEY,
                        },
                    }).then((response) => ({
                        flavor: candidate.flavor,
                        items: response.data.items || [],
                    }))
                )
            );

            const byId = new Map<string, any>();
            for (const response of searchResponses) {
                for (const item of response.items) {
                    const videoId = item?.id?.videoId;
                    if (!videoId || byId.has(videoId)) continue;
                    byId.set(videoId, item);
                }
            }

            const ids = Array.from(byId.keys());
            const detailBatches: string[][] = [];
            for (let index = 0; index < ids.length; index += 50) {
                detailBatches.push(ids.slice(index, index + 50));
            }

            const detailResponses = await Promise.all(
                detailBatches.map((batch) =>
                    axios.get<YouTubeVideosResponse>(`${YOUTUBE_API_URL}/videos`, {
                        params: {
                            part: 'snippet,contentDetails',
                            id: batch.join(','),
                            key: YOUTUBE_API_KEY,
                        },
                    })
                )
            );

            const detailMap = new Map<string, any>();
            for (const response of detailResponses) {
                for (const item of response.data.items || []) {
                    detailMap.set(item.id, item);
                }
            }

            const videos = ids
                .map((videoId) => mapVideo(detailMap.get(videoId) || byId.get(videoId)))
                .filter((video): video is YouTubeVideoDTO => Boolean(video))
                .sort((a, b) => {
                    const scoreDiff = (b.ptbrScore || 0) - (a.ptbrScore || 0);
                    if (scoreDiff !== 0) return scoreDiff;
                    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
                })
                .slice(0, 24);

            cache.set(cacheKey, videos);
            return videos;
        } catch (error: any) {
            console.error(`[ORION] YouTube API Error: ${error.message}`);
            if (error.response?.status === 403) {
                throw new Error('Quota do YouTube Excedida');
            }
            throw new Error('Falha na API Externa de Busca');
        }
    }

    /**
     * Detalhes de um video especifico.
     */
    static async getVideoDetails(id: string): Promise<YouTubeVideoDTO | null> {
        if (!YOUTUBE_API_KEY) return null;

        const cacheKey = `video_${id}`;
        const cached = cache.get<YouTubeVideoDTO>(cacheKey);

        if (cached) return cached;

        try {
            const response = await axios.get<YouTubeVideosResponse>(`${YOUTUBE_API_URL}/videos`, {
                params: {
                    part: 'snippet,contentDetails',
                    id,
                    key: YOUTUBE_API_KEY,
                },
            });

            if (!response.data.items?.length) return null;

            const video = mapVideo(response.data.items[0]);
            if (!video) return null;

            cache.set(cacheKey, video);
            return video;
        } catch (error: any) {
            console.error(`[ORION] YouTube Details Error: ${error.message}`);
            throw error;
        }
    }
}
