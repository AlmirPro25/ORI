import axios from 'axios';
import { TMDBService } from './tmdb-service';
import { aiService } from './ai-service';

/**
 * ARCONTE AUTO-CURATOR
 * Curadoria automática real de filmes e séries.
 */

const BACKEND_URL = 'http://localhost:3000/api/v1';
const NEXUS_MOVIES_URL = 'http://localhost:3005/api/search/ultra';
const NEXUS_SERIES_URL = 'http://localhost:3005/api/search/series';

type TrendingMovie = {
    tmdbId?: string | number;
    title: string;
    year?: string | number;
    summary?: string;
    large_cover_image?: string | null;
    medium_cover_image?: string | null;
    backdrop_path?: string | null;
    genres?: string[];
};

type CuratedSeries = {
    id: number;
    title: string;
    original_title?: string;
    overview?: string;
    poster_path?: string | null;
    backdrop_path?: string | null;
    release_date?: string;
    vote_average?: number;
};

export class ArconteAutoCurator {
    private isRunning = false;
    private predictiveLimit = 5;
    private minSeedsForPredictive = 50;
    private lastAccuracy = 100;

    constructor() { }

    start(intervalInHours: number = 6) {
        if (this.isRunning) return;
        this.isRunning = true;

        console.log(`🚀 Arconte Auto-Curator iniciado (Ciclo: ${intervalInHours}h)`);

        this.runCycle().catch((error) => {
            console.error('❌ [Arconte] Falha no ciclo inicial:', error?.message || error);
        });

        setInterval(() => {
            this.runCycle().catch((error) => {
                console.error('❌ [Arconte] Falha no ciclo agendado:', error?.message || error);
            });
        }, intervalInHours * 60 * 60 * 1000);
    }

    private async runCycle() {
        console.log('🔍 Arconte iniciando ciclo de busca de tendências...');
        await this.refreshFeedbackLoop();

        await this.runMovieCycle();
        await this.runSeriesCycle();

        console.log('✅ Ciclo de curadoria concluído.');
    }

    private async refreshFeedbackLoop() {
        try {
            const statsRes = await axios.get(`${BACKEND_URL}/downloads/stats/predictions`).catch(() => null);
            if (!statsRes) return;

            const { accuracy } = statsRes.data;
            this.lastAccuracy = accuracy;

            if (accuracy < 30) {
                this.predictiveLimit = 2;
                this.minSeedsForPredictive = 100;
                console.log(`📉 [Arconte] Baixa acurácia (${accuracy}%). Tornando-se conservador.`);
            } else if (accuracy > 70) {
                this.predictiveLimit = 10;
                this.minSeedsForPredictive = 30;
                console.log(`📈 [Arconte] Alta acurácia (${accuracy}%). Tornando-se agressivo.`);
            } else {
                this.predictiveLimit = 5;
                this.minSeedsForPredictive = 50;
            }
        } catch {
            console.warn('⚠️ [Arconte] Não foi possível obter stats para feedback loop.');
        }
    }

    private async runMovieCycle() {
        let movies: TrendingMovie[] = [];

        try {
            try {
                console.log('🔍 [Arconte] Tentando YTS...');
                const response = await axios.get('https://yts.mx/api/v2/list_movies.json?sort_by=trending_score&limit=20', { timeout: 10000 });
                movies = response.data.data.movies || [];
                console.log(`✅ [Arconte] ${movies.length} tendências encontradas no YTS.`);
            } catch {
                console.warn('⚠️ [Arconte] YTS falhou (DNS ou Timeout). Tentando fallback TMDB...');
                const tmdbMovies = await TMDBService.getTrending();
                movies = tmdbMovies.map((m) => ({
                    tmdbId: m.id,
                    title: m.title,
                    year: m.release_date?.split('-')[0],
                    summary: m.overview,
                    large_cover_image: m.poster_path,
                    medium_cover_image: m.poster_path,
                    backdrop_path: m.backdrop_path,
                    genres: [],
                }));
                console.log(`✅ [Arconte] ${movies.length} tendências encontradas no TMDB.`);
            }

            if (!movies.length) {
                console.warn('⚠️ [Arconte] Nenhuma tendência de filmes encontrada no momento.');
                return;
            }

            for (let i = 0; i < movies.length; i++) {
                const movie = movies[i];
                const isHighTrend = i < this.predictiveLimit;
                await this.processMovie(movie, isHighTrend);
                await this.sleep(1500);
            }
        } catch (error: any) {
            console.error('❌ Erro crítico no ciclo de filmes do Arconte:', error.message);
        }
    }

    private async runSeriesCycle() {
        try {
            const trendingSeries = await TMDBService.getTrendingSeries();

            if (!trendingSeries.length) {
                console.warn('⚠️ [Arconte] Séries em alta indisponíveis. Verifique TMDB_API_KEY válida.');
                return;
            }

            console.log(`📺 [Arconte] ${trendingSeries.length} séries candidatas recebidas do TMDB.`);

            for (const candidate of trendingSeries.slice(0, 8)) {
                await this.processSeries({
                    id: candidate.id,
                    title: candidate.title,
                    original_title: candidate.original_title,
                    overview: candidate.overview,
                    poster_path: candidate.poster_path,
                    backdrop_path: candidate.backdrop_path,
                    release_date: candidate.first_air_date || candidate.release_date,
                    vote_average: candidate.vote_average,
                });
                await this.sleep(1500);
            }
        } catch (error: any) {
            console.error('❌ Erro crítico no ciclo de séries do Arconte:', error.message);
        }
    }

    private async processMovie(movie: TrendingMovie, isHighTrend: boolean = false) {
        try {
            const year = movie.year ? String(movie.year) : '';
            console.log(`📦 Processando filme: ${movie.title} ${year ? `(${year})` : ''} ${isHighTrend ? '🔥 [Predictive Candidate]' : ''}`);

            const searchResponse = await axios.get(`${BACKEND_URL}/videos`);
            const existing = (searchResponse.data || []).find((v: any) =>
                this.normalizeTitle(v.title) === this.normalizeTitle(movie.title)
            );

            if (existing) {
                console.log(`⏩ ${movie.title} já existe no catálogo. Pulando.`);
                return;
            }

            await this.seedMovieCatalogEntry(movie);

            const movieQueries = await this.buildMovieQueries(movie);
            const movieCandidates = await this.searchMovieCandidates(movieQueries);
            const bestTorrent = movieCandidates[0];

            if (!bestTorrent) {
                console.log(`🗂️ [Catalog] ${movie.title} entrou no radar do Arconte mesmo sem fonte forte ainda.`);
                return;
            }

            const shouldPredictiveDownload = isHighTrend && (bestTorrent.seeds || 0) > this.minSeedsForPredictive;
            const quality = this.detectQuality(bestTorrent.title);
            const language = this.detectLanguage(bestTorrent.title);
            const tags = ['Autobot', 'Trending', 'Movie', 'Movies', 'Filme', quality, language, bestTorrent.sourceSite || 'Nexus']
                .filter(Boolean);
            const shouldCatalogOnly = !shouldPredictiveDownload && (bestTorrent.seeds || 0) < 10;

            await axios.post(`${BACKEND_URL}/videos/auto-ingest`, {
                title: movie.title,
                description: movie.summary || `Filme popular de ${year || 'ano desconhecido'}. Encontrado via curadoria automática.`,
                category: 'Movies',
                externalSource: bestTorrent.magnetLink,
                thumbnailUrl: bestTorrent.poster || movie.large_cover_image || movie.medium_cover_image,
                backdropUrl: movie.backdrop_path || bestTorrent.poster || movie.large_cover_image || movie.medium_cover_image,
                tags,
                predictive: shouldPredictiveDownload,
                tmdbId: movie.tmdbId ? String(movie.tmdbId) : undefined,
                quality,
                language,
                sourceSite: bestTorrent.sourceSite || bestTorrent.provider || 'Nexus',
                status: shouldCatalogOnly ? 'CATALOG' : 'NEXUS',
                originalTitle: bestTorrent.originalTitle || movie.title,
            });

            if (shouldPredictiveDownload) {
                console.log(`🧠 [Predictive] ${movie.title} marcado para download automático preventivo.`);
            } else if (shouldCatalogOnly) {
                console.log(`🗂️ [Catalog] ${movie.title} entrou como CATALOG aguardando melhor materialização.`);
            }

            console.log(`✨ ${movie.title} adicionado com sucesso ao catálogo!`);
        } catch (error: any) {
            console.error(`❌ Erro ao processar filme ${movie.title}:`, error.message);
        }
    }

    private async processSeries(seriesCandidate: CuratedSeries) {
        const titleForSearch = seriesCandidate.original_title || seriesCandidate.title;

        try {
            console.log(`📺 [Arconte] Processando série: ${seriesCandidate.title}`);

            const details = await TMDBService.getDetails(seriesCandidate.id, 'tv');
            if (!details) {
                console.warn(`⚠️ [Arconte] TMDB sem detalhes para ${seriesCandidate.title}.`);
                return;
            }

            const seriesResponse = await axios.post(`${BACKEND_URL}/series`, {
                title: details.name || seriesCandidate.title,
                overview: details.overview || seriesCandidate.overview,
                poster: details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : seriesCandidate.poster_path,
                backdrop: details.backdrop_path ? `https://image.tmdb.org/t/p/w500${details.backdrop_path}` : seriesCandidate.backdrop_path,
                tmdbId: details.id,
                imdbId: details.external_ids?.imdb_id || null,
                status: this.mapSeriesStatus(details.status),
                genres: (details.genres || []).map((genre: any) => genre.name),
                totalSeasons: details.number_of_seasons || 0,
                totalEpisodes: details.number_of_episodes || 0,
                firstAirDate: details.first_air_date,
                lastAirDate: details.last_air_date,
            });

            const series = seriesResponse.data;
            const seasonsToProcess = (details.seasons || [])
                .filter((season: any) => season && season.season_number > 0)
                .slice(0, 3);

            for (const seasonInfo of seasonsToProcess) {
                const seasonNumber = seasonInfo.season_number;
                const seasonDetails = await TMDBService.getSeason(details.id, seasonNumber);

                if (!seasonDetails || !seasonDetails.episodes?.length) {
                    continue;
                }

                await axios.post(`${BACKEND_URL}/series/${series.id}/seasons`, {
                    seasonNumber,
                    name: seasonDetails.name || `Temporada ${seasonNumber}`,
                    overview: seasonDetails.overview,
                    poster: seasonDetails.poster_path || null,
                    episodeCount: seasonDetails.episode_count || seasonDetails.episodes.length,
                    airDate: seasonInfo.air_date || null,
                });

                for (const ep of seasonDetails.episodes) {
                    await axios.post(`${BACKEND_URL}/series/${series.id}/episodes`, {
                        seasonNumber,
                        episodeNumber: ep.episode_number,
                        title: ep.name,
                        overview: ep.overview,
                        duration: ep.runtime || null,
                        airDate: ep.air_date,
                        stillPath: ep.still_path,
                        quality: null,
                        fileSize: null,
                    });
                }

                const bestPack = await this.findBestSeriesPack(titleForSearch, seasonNumber);
                if (!bestPack?.magnetLink) {
                    console.log(`⚠️ [Arconte] Nenhum pack viável encontrado para ${seriesCandidate.title} S${String(seasonNumber).padStart(2, '0')}.`);
                    continue;
                }

                const explored = await axios.get(`${BACKEND_URL}/series/torrent/explore`, {
                    params: { magnetLink: bestPack.magnetLink },
                });

                const suggestedEpisodes = explored.data?.suggestedEpisodes || [];
                if (!suggestedEpisodes.length) {
                    console.log(`⚠️ [Arconte] Torrent sem episódios mapeáveis para ${seriesCandidate.title} S${String(seasonNumber).padStart(2, '0')}.`);
                    continue;
                }

                const episodeMap = new Map<number, any>();
                for (const ep of seasonDetails.episodes) {
                    episodeMap.set(ep.episode_number, ep);
                }

                const episodesPayload = suggestedEpisodes
                    .filter((ep: any) => ep.season === seasonNumber && episodeMap.has(ep.episode))
                    .map((ep: any) => {
                        const tmdbEpisode = episodeMap.get(ep.episode);
                        return {
                            seasonNumber,
                            episodeNumber: ep.episode,
                            title: tmdbEpisode?.name || `Episódio ${ep.episode}`,
                            fileIndex: ep.index,
                            filePath: ep.path,
                            quality: ep.quality || this.detectQuality(bestPack.title),
                        };
                    });

                if (!episodesPayload.length) {
                    continue;
                }

                await axios.post(`${BACKEND_URL}/series/bulk-ingest`, {
                    magnetLink: bestPack.magnetLink,
                    seriesId: series.id,
                    episodes: episodesPayload,
                });

                for (const ep of seasonDetails.episodes) {
                    const parsedQuality = this.detectQuality(bestPack.title);
                    await axios.post(`${BACKEND_URL}/series/${series.id}/episodes`, {
                        seasonNumber,
                        episodeNumber: ep.episode_number,
                        title: ep.name,
                        overview: ep.overview,
                        duration: ep.runtime || null,
                        airDate: ep.air_date,
                        stillPath: ep.still_path,
                        quality: parsedQuality,
                        fileSize: null,
                    });
                }

                console.log(`✨ [Arconte] ${seriesCandidate.title} S${String(seasonNumber).padStart(2, '0')} catalogada com ${episodesPayload.length} episódios.`);
            }
        } catch (error: any) {
            console.error(`❌ Erro ao processar série ${seriesCandidate.title}:`, error.message);
        }
    }

    private async findBestSeriesPack(seriesName: string, seasonNumber: number) {
        const response = await axios.post(NEXUS_SERIES_URL, {
            query: seriesName,
            season: seasonNumber,
            limit: 8,
        });

        return (response.data.results || [])
            .filter((item: any) => item?.magnetLink)
            .sort((a: any, b: any) => {
                const aScore = (a.seeds || 0) + (a.isSeasonPack ? 50 : 0) + (a.isCompleteSeries ? 20 : 0);
                const bScore = (b.seeds || 0) + (b.isSeasonPack ? 50 : 0) + (b.isCompleteSeries ? 20 : 0);
                return bScore - aScore;
            })[0];
    }

    private mapSeriesStatus(tmdbStatus?: string): string {
        if (!tmdbStatus) return 'ONGOING';

        const normalized = tmdbStatus.toLowerCase();
        if (normalized.includes('ended')) return 'ENDED';
        if (normalized.includes('canceled')) return 'CANCELED';
        return 'ONGOING';
    }

    private detectQuality(title?: string): string {
        if (!title) return '1080p';
        const normalized = title.toLowerCase();
        if (normalized.includes('2160') || normalized.includes('4k') || normalized.includes('uhd')) return '2160p';
        if (normalized.includes('1080')) return '1080p';
        if (normalized.includes('720')) return '720p';
        if (normalized.includes('480')) return '480p';
        return '1080p';
    }

    private detectLanguage(title?: string): string {
        if (!title) return 'und';
        const normalized = title.toLowerCase();
        if (normalized.includes('dublado') || normalized.includes('pt-br') || normalized.includes('dual audio')) return 'pt-BR';
        if (normalized.includes('legendado')) return 'pt-BR-sub';
        return 'en';
    }

    private async seedMovieCatalogEntry(movie: TrendingMovie) {
        const year = movie.year ? String(movie.year) : '';
        await axios.post(`${BACKEND_URL}/videos/auto-ingest`, {
            title: movie.title,
            description: movie.summary || `Filme em observação editorial do Arconte ${year ? `(${year})` : ''}.`,
            category: 'Movies',
            thumbnailUrl: movie.large_cover_image || movie.medium_cover_image || null,
            backdropUrl: movie.backdrop_path || movie.large_cover_image || movie.medium_cover_image || null,
            tags: ['Arconte', 'Trending', 'Movie', 'Movies', 'Filme', 'TMDB Radar'],
            tmdbId: movie.tmdbId ? String(movie.tmdbId) : undefined,
            status: 'CATALOG',
            quality: '1080p',
            language: 'und',
            sourceSite: 'TMDB',
            originalTitle: movie.title,
        }).catch((error: any) => {
            console.warn(`⚠️ [Arconte] Falha ao semear catálogo para ${movie.title}: ${error?.message || error}`);
        });
    }

    private async buildMovieQueries(movie: TrendingMovie): Promise<string[]> {
        const year = movie.year ? String(movie.year) : '';
        const baseTerms = [
            [movie.title, year].filter(Boolean).join(' ').trim(),
            [movie.title, year, '1080p'].filter(Boolean).join(' ').trim(),
            [movie.title, year, 'dublado'].filter(Boolean).join(' ').trim(),
            [movie.title, year, 'dual audio'].filter(Boolean).join(' ').trim(),
            [movie.title, year, 'pt-br'].filter(Boolean).join(' ').trim(),
            [movie.title, year, 'WEB-DL'].filter(Boolean).join(' ').trim(),
        ].filter(Boolean);

        const aiTerms = await aiService.decomposeSearchQuery([movie.title, year].filter(Boolean).join(' ').trim());
        return [...new Set([...baseTerms, ...aiTerms])].slice(0, 10);
    }

    private async searchMovieCandidates(queries: string[]) {
        const seenMagnets = new Set<string>();
        const results: any[] = [];

        for (const query of queries) {
            try {
                const nexusResponse = await axios.post(NEXUS_MOVIES_URL, {
                    query,
                    category: 'Movies',
                    limit: 8,
                });

                for (const item of nexusResponse.data.results || []) {
                    if (!item?.magnetLink || seenMagnets.has(item.magnetLink)) {
                        continue;
                    }

                    seenMagnets.add(item.magnetLink);
                    results.push(item);
                }
            } catch (error: any) {
                console.warn(`⚠️ [Arconte] Busca de filme falhou para "${query}": ${error?.message || error}`);
            }
        }

        return results
            .sort((a: any, b: any) => {
                const aPtbr = this.detectLanguage(a.title) === 'pt-BR' ? 50 : this.detectLanguage(a.title) === 'pt-BR-sub' ? 20 : 0;
                const bPtbr = this.detectLanguage(b.title) === 'pt-BR' ? 50 : this.detectLanguage(b.title) === 'pt-BR-sub' ? 20 : 0;
                const aQuality = this.detectQuality(a.title) === '1080p' || this.detectQuality(a.title) === '2160p' ? 10 : 0;
                const bQuality = this.detectQuality(b.title) === '1080p' || this.detectQuality(b.title) === '2160p' ? 10 : 0;
                return ((b.seeds || 0) + bPtbr + bQuality) - ((a.seeds || 0) + aPtbr + aQuality);
            });
    }

    private normalizeTitle(value?: string): string {
        return (value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/gi, ' ')
            .trim()
            .toLowerCase();
    }

    private async sleep(ms: number) {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }
}
