import axios from 'axios';
import NodeCache from 'node-cache';
import dotenv from 'dotenv';

dotenv.config();

// Cache TTL: 1 hora para buscas comuns. Preservação de Quota é prioridade.
const cache = new NodeCache({ stdTTL: 3600 });
const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3';
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

export interface YouTubeVideoDTO {
    youtubeId: string;
    title: string;
    thumbnail: string;
    channelTitle: string;
    description: string;
    publishedAt: string;
    duration?: string;
}

export class YouTubeService {
    /**
     * Executa busca no YouTube com estratégia de Cache-First.
     */
    static async searchVideos(query: string): Promise<YouTubeVideoDTO[]> {
        if (!YOUTUBE_API_KEY) {
            console.warn("⚠️ [ORION] YOUTUBE_API_KEY não configurada. Buscas globais desabilitadas.");
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
            const response = await axios.get(`${YOUTUBE_API_URL}/search`, {
                params: {
                    part: 'snippet',
                    q: query,
                    type: 'video',
                    maxResults: 20,
                    key: YOUTUBE_API_KEY,
                },
            });

            const videos: YouTubeVideoDTO[] = response.data.items.map((item: any) => ({
                youtubeId: item.id.videoId,
                title: item.snippet.title,
                thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
                channelTitle: item.snippet.channelTitle,
                description: item.snippet.description,
                publishedAt: item.snippet.publishedAt,
            }));

            cache.set(cacheKey, videos);
            return videos;

        } catch (error: any) {
            console.error(`[ORION] YouTube API Error: ${error.message}`);
            if (error.response?.status === 403) {
                throw new Error("Quota do YouTube Excedida");
            }
            throw new Error("Falha na API Externa de Busca");
        }
    }

    /**
     * Detalhes de um vídeo específico.
     */
    static async getVideoDetails(id: string): Promise<YouTubeVideoDTO | null> {
        if (!YOUTUBE_API_KEY) return null;

        const cacheKey = `video_${id}`;
        const cached = cache.get<YouTubeVideoDTO>(cacheKey);

        if (cached) return cached;

        try {
            const response = await axios.get(`${YOUTUBE_API_URL}/videos`, {
                params: {
                    part: 'snippet,contentDetails',
                    id: id,
                    key: YOUTUBE_API_KEY,
                },
            });

            if (response.data.items.length === 0) return null;

            const item = response.data.items[0];
            const video: YouTubeVideoDTO = {
                youtubeId: item.id,
                title: item.snippet.title,
                thumbnail: item.snippet.thumbnails.maxres?.url || item.snippet.thumbnails.high?.url,
                channelTitle: item.snippet.channelTitle,
                description: item.snippet.description,
                publishedAt: item.snippet.publishedAt,
                duration: item.contentDetails.duration,
            };

            cache.set(cacheKey, video);
            return video;
        } catch (error: any) {
            console.error(`[ORION] YouTube Details Error: ${error.message}`);
            throw error;
        }
    }
}
