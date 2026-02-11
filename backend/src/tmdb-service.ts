import axios from 'axios';
import NodeCache from 'node-cache';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

// Cache de metadados: 24 horas para evitar excesso de requisições
const cache = new NodeCache({ stdTTL: 86400 });

export interface TMDBMedia {
    id: number;
    title: string;
    original_title?: string;
    name?: string; // Para séries
    overview: string;
    poster_path: string;
    backdrop_path: string;
    release_date?: string;
    first_air_date?: string;
    media_type: 'movie' | 'tv';
    vote_average: number;
}

export class TMDBService {
    static async search(query: string): Promise<TMDBMedia[]> {
        if (!TMDB_API_KEY) {
            console.warn('⚠️ [TMDB] API Key não configurada.');
            return [];
        }

        const cacheKey = `search_${query.toLowerCase().trim()}`;
        const cached = cache.get<TMDBMedia[]>(cacheKey);
        if (cached) {
            console.log(`[TMDB] Cache Hit: ${query}`);
            return cached;
        }

        try {
            console.log(`[TMDB] API Search: ${query}`);
            const response = await axios.get(`${TMDB_BASE_URL}/search/multi`, {
                params: {
                    api_key: TMDB_API_KEY,
                    query: query,
                    language: 'pt-BR',
                    include_adult: false
                }
            });

            const results: TMDBMedia[] = response.data.results
                .filter((item: any) => item.media_type === 'movie' || item.media_type === 'tv')
                .map((item: any) => ({
                    id: item.id,
                    title: item.title || item.name,
                    original_title: item.original_title || item.original_name,
                    overview: item.overview,
                    poster_path: item.poster_path ? `${IMAGE_BASE_URL}${item.poster_path}` : null,
                    backdrop_path: item.backdrop_path ? `${IMAGE_BASE_URL}${item.backdrop_path}` : null,
                    release_date: item.release_date || item.first_air_date,
                    media_type: item.media_type,
                    vote_average: item.vote_average
                }));

            cache.set(cacheKey, results);
            return results;
        } catch (error: any) {
            console.error('❌ [TMDB] Erro ao buscar metadados:', error.message);
            return [];
        }
    }

    static async getDetails(id: number, type: 'movie' | 'tv') {
        if (!TMDB_API_KEY) return null;

        try {
            const response = await axios.get(`${TMDB_BASE_URL}/${type}/${id}`, {
                params: {
                    api_key: TMDB_API_KEY,
                    language: 'pt-BR'
                }
            });
            return response.data;
        } catch (error: any) {
            console.error(`❌ [TMDB] Erro ao buscar detalhes de ${type}:`, error.message);
            return null;
        }
    }

    /**
     * 🔥 V2.4: Busca filmes em alta no momento
     */
    static async getTrending(): Promise<TMDBMedia[]> {
        if (!TMDB_API_KEY) return [];

        try {
            console.log('[TMDB] Buscando tendências...');
            const response = await axios.get(`${TMDB_BASE_URL}/trending/movie/day`, {
                params: {
                    api_key: TMDB_API_KEY,
                    language: 'pt-BR'
                }
            });

            return response.data.results.map((item: any) => ({
                id: item.id,
                title: item.title,
                original_title: item.original_title,
                overview: item.overview,
                poster_path: item.poster_path ? `${IMAGE_BASE_URL}${item.poster_path}` : null,
                backdrop_path: item.backdrop_path ? `${IMAGE_BASE_URL}${item.backdrop_path}` : null,
                release_date: item.release_date,
                media_type: 'movie',
                vote_average: item.vote_average
            }));
        } catch (error: any) {
            console.error('❌ [TMDB] Erro ao buscar tendências:', error.message);
            return [];
        }
    }

    /**
     * 📺 V3: Busca séries em alta (TV Trending)
     */
    static async getTrendingSeries(): Promise<TMDBMedia[]> {
        if (!TMDB_API_KEY) return [];

        try {
            console.log('[TMDB] Buscando séries em alta...');
            const response = await axios.get(`${TMDB_BASE_URL}/trending/tv/week`, {
                params: {
                    api_key: TMDB_API_KEY,
                    language: 'pt-BR'
                }
            });

            return response.data.results.map((item: any) => ({
                id: item.id,
                title: item.name,
                original_title: item.original_name,
                overview: item.overview,
                poster_path: item.poster_path ? `${IMAGE_BASE_URL}${item.poster_path}` : null,
                backdrop_path: item.backdrop_path ? `${IMAGE_BASE_URL}${item.backdrop_path}` : null,
                release_date: item.first_air_date,
                media_type: 'tv' as const,
                vote_average: item.vote_average
            }));
        } catch (error: any) {
            console.error('❌ [TMDB] Erro ao buscar séries em alta:', error.message);
            return [];
        }
    }

    /**
     * 📺 V3: Busca detalhes de temporada de uma série (episódios)
     */
    static async getSeason(seriesId: number, seasonNumber: number): Promise<any> {
        if (!TMDB_API_KEY) return null;

        const cacheKey = `season_${seriesId}_${seasonNumber}`;
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        try {
            const response = await axios.get(`${TMDB_BASE_URL}/tv/${seriesId}/season/${seasonNumber}`, {
                params: {
                    api_key: TMDB_API_KEY,
                    language: 'pt-BR'
                }
            });

            const result = {
                id: response.data.id,
                name: response.data.name,
                overview: response.data.overview,
                season_number: response.data.season_number,
                episode_count: response.data.episodes?.length || 0,
                episodes: (response.data.episodes || []).map((ep: any) => ({
                    id: ep.id,
                    episode_number: ep.episode_number,
                    name: ep.name,
                    overview: ep.overview,
                    air_date: ep.air_date,
                    still_path: ep.still_path ? `${IMAGE_BASE_URL}${ep.still_path}` : null,
                    vote_average: ep.vote_average
                })),
                poster_path: response.data.poster_path ? `${IMAGE_BASE_URL}${response.data.poster_path}` : null
            };

            cache.set(cacheKey, result);
            return result;
        } catch (error: any) {
            console.error(`❌ [TMDB] Erro ao buscar temporada S${seasonNumber} do ID ${seriesId}:`, error.message);
            return null;
        }
    }

    /**
     * 📺 V3: Busca apenas séries (filtra TV de movie)
     */
    static async searchSeries(query: string): Promise<TMDBMedia[]> {
        if (!TMDB_API_KEY) return [];

        const cacheKey = `search_series_${query.toLowerCase().trim()}`;
        const cached = cache.get<TMDBMedia[]>(cacheKey);
        if (cached) return cached;

        try {
            const response = await axios.get(`${TMDB_BASE_URL}/search/tv`, {
                params: {
                    api_key: TMDB_API_KEY,
                    query: query,
                    language: 'pt-BR',
                    include_adult: false
                }
            });

            const results: TMDBMedia[] = response.data.results.map((item: any) => ({
                id: item.id,
                title: item.name,
                original_title: item.original_name,
                name: item.name,
                overview: item.overview,
                poster_path: item.poster_path ? `${IMAGE_BASE_URL}${item.poster_path}` : null,
                backdrop_path: item.backdrop_path ? `${IMAGE_BASE_URL}${item.backdrop_path}` : null,
                release_date: item.first_air_date,
                first_air_date: item.first_air_date,
                media_type: 'tv' as const,
                vote_average: item.vote_average
            }));

            cache.set(cacheKey, results);
            return results;
        } catch (error: any) {
            console.error('❌ [TMDB] Erro ao buscar séries:', error.message);
            return [];
        }
    }

    /**
     * 🤖 AI: Busca recomendações baseadas em um item
     */
    static async getRecommendations(id: number, type: 'movie' | 'tv'): Promise<TMDBMedia[]> {
        if (!TMDB_API_KEY) return [];

        try {
            const response = await axios.get(`${TMDB_BASE_URL}/${type}/${id}/recommendations`, {
                params: {
                    api_key: TMDB_API_KEY,
                    language: 'pt-BR'
                }
            });

            return response.data.results.map((item: any) => ({
                id: item.id,
                title: item.title || item.name,
                poster_path: item.poster_path ? `${IMAGE_BASE_URL}${item.poster_path}` : null,
                vote_average: item.vote_average,
                release_date: item.release_date || item.first_air_date
            }));
        } catch (error: any) {
            console.error(`❌ [TMDB] Erro ao buscar recomendações para ${id}:`, error.message);
            return [];
        }
    }
}
