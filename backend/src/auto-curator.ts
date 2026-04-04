import 'dotenv/config';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { TMDBService } from './tmdb-service';
import { aiService } from './ai-service';
import { AddonService } from './services/addon.service';

/**
 * ARCONTE AUTO-CURATOR
 * Curadoria automÃ¡tica real de filmes e sÃ©ries.
 */

const BACKEND_URL = 'http://localhost:3000/api/v1';
const NEXUS_MOVIES_URL = 'http://localhost:3005/api/search/ultra';
const NEXUS_SERIES_URL = 'http://localhost:3005/api/search/series';
const DEFAULT_TRACKERS = [
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://tracker.openbittorrent.com:6969/announce',
    'udp://tracker.torrent.eu.org:451/announce',
    'udp://open.stealth.si:80/announce',
    'wss://tracker.openwebtorrent.com',
    'wss://tracker.btorrent.xyz',
];
const prisma = new PrismaClient();

type TrendingMovie = {
    tmdbId?: string | number;
    title: string;
    originalTitle?: string;
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

type CatalogSnapshot = {
    movieIds: Set<string>;
    movieTitles: Set<string>;
    seriesIds: Set<string>;
    seriesTitles: Set<string>;
    videos: any[];
    series: any[];
};

type HeuristicScore = {
    wins: number;
    ptBrWins: number;
    totalAvailability: number;
    lastSource?: string;
    updatedAt?: string;
};

export class ArconteAutoCurator {
    private isRunning = false;
    private predictiveLimit = 5;
    private movieCatalogLimit = 28;
    private seriesCatalogLimit = 16;
    private minSeedsForPredictive = 50;
    private minAvailabilityForCatalog = 12;
    private minAvailabilityForClickReady = 24;
    private lastAccuracy = 100;
    private heuristicCache = new Map<string, HeuristicScore>();
    private nexusMovieSearchCooldownUntil = 0;

    constructor() { }

    start(intervalInHours: number = 6) {
        if (this.isRunning) return;
        this.isRunning = true;

        console.log(`ðŸš€ Arconte Auto-Curator iniciado (Ciclo: ${intervalInHours}h)`);

        this.runCycle().catch((error) => {
            console.error('âŒ [Arconte] Falha no ciclo inicial:', error?.message || error);
        });

        setInterval(() => {
            this.runCycle().catch((error) => {
                console.error('âŒ [Arconte] Falha no ciclo agendado:', error?.message || error);
            });
        }, intervalInHours * 60 * 60 * 1000);
    }

    private async runCycle() {
        await this.waitForBackendReady();
        console.log('ðŸ” Arconte iniciando ciclo de busca de tendÃªncias...');
        await this.refreshFeedbackLoop();

        await this.runMovieCycle();
        await this.runSeriesCycle();

        console.log('âœ… Ciclo de curadoria concluÃ­do.');
    }

    private async waitForBackendReady(retries: number = 8, delayMs: number = 2500) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                await axios.get(`${BACKEND_URL.replace('/api/v1', '')}/health`, { timeout: 4000 });
                return;
            } catch {
                if (attempt === retries) {
                    console.warn('âš ï¸ [Arconte] Backend local ainda nÃ£o ficou pronto a tempo. Continuando mesmo assim.');
                    return;
                }
                await this.sleep(delayMs);
            }
        }
    }


    private async refreshFeedbackLoop() {
        try {
            const statsRes = await axios.get(`${BACKEND_URL}/downloads/stats/predictions`).catch(() => null);
            if (!statsRes) return;

            const { accuracy } = statsRes.data;
            this.lastAccuracy = accuracy;

            if (accuracy < 30) {
                this.predictiveLimit = 2;
                this.movieCatalogLimit = 18;
                this.seriesCatalogLimit = 10;
                this.minSeedsForPredictive = 100;
                console.log(`ðŸ“‰ [Arconte] Baixa acurÃ¡cia (${accuracy}%). Tornando-se conservador.`);
            } else if (accuracy > 70) {
                this.predictiveLimit = 10;
                this.movieCatalogLimit = 40;
                this.seriesCatalogLimit = 24;
                this.minSeedsForPredictive = 30;
                console.log(`ðŸ“ˆ [Arconte] Alta acurÃ¡cia (${accuracy}%). Tornando-se agressivo.`);
            } else {
                this.predictiveLimit = 5;
                this.movieCatalogLimit = 28;
                this.seriesCatalogLimit = 16;
                this.minSeedsForPredictive = 50;
            }
        } catch {
            console.warn('âš ï¸ [Arconte] NÃ£o foi possÃ­vel obter stats para feedback loop.');
        }
    }

    private async runMovieCycle() {
        let movies: TrendingMovie[] = [];

        try {
            try {
                console.log('ðŸ” [Arconte] Tentando YTS...');
                const response = await axios.get('https://yts.mx/api/v2/list_movies.json?sort_by=trending_score&limit=20', { timeout: 10000 });
                movies = response.data.data.movies || [];
                console.log(`âœ… [Arconte] ${movies.length} tendÃªncias encontradas no YTS.`);
            } catch {
                console.warn('âš ï¸ [Arconte] YTS falhou (DNS ou Timeout). Tentando fallback TMDB...');
                const tmdbMovies = await TMDBService.getTrending();
                movies = tmdbMovies.map((m) => ({
                    tmdbId: m.id,
                    title: m.title,
                    originalTitle: m.original_title,
                    year: m.release_date?.split('-')[0],
                    summary: m.overview,
                    large_cover_image: m.poster_path,
                    medium_cover_image: m.poster_path,
                    backdrop_path: m.backdrop_path,
                    genres: [],
                }));
                console.log(`âœ… [Arconte] ${movies.length} tendÃªncias encontradas no TMDB.`);
            }

            const [tmdbTrending, tmdbPopular, tmdbUpcoming, tmdbTopRated, recommendedMovies] = await Promise.all([
                TMDBService.getTrending(),
                TMDBService.getPopularMovies(),
                TMDBService.getUpcomingMovies(),
                TMDBService.getTopRatedMovies(),
                this.getRecommendedMoviesFromCatalog(),
            ]);

            const tmdbCatalogMovies = [...tmdbTrending, ...tmdbPopular, ...tmdbUpcoming, ...tmdbTopRated, ...recommendedMovies].map((m) => ({
                tmdbId: m.id,
                title: m.title,
                originalTitle: m.original_title,
                year: m.release_date?.split('-')[0],
                summary: m.overview,
                large_cover_image: m.poster_path,
                medium_cover_image: m.poster_path,
                backdrop_path: m.backdrop_path,
                genres: [],
            }));

            const movieSnapshot = await this.getCatalogSnapshot();
            movies = this.prioritizeFreshMovieCandidates(this.dedupeMovies([...movies, ...tmdbCatalogMovies]), movieSnapshot);
            if (!movies.length) {
                movies = await this.getFreshMovieFallbackCandidates(movieSnapshot);
            }
            console.log(`ðŸŽ¬ [Arconte] Radar expandido para ${movies.length} filmes candidatos neste ciclo.`);

            if (!movies.length) {
                console.warn('âš ï¸ [Arconte] Nenhuma tendÃªncia de filmes encontrada no momento.');
                return;
            }

            for (let i = 0; i < Math.min(movies.length, this.movieCatalogLimit); i++) {
                const movie = movies[i];
                const isHighTrend = i < this.predictiveLimit;
                await this.processMovie(movie, isHighTrend);
                await this.sleep(900);
            }
        } catch (error: any) {
            console.error('âŒ Erro crÃ­tico no ciclo de filmes do Arconte:', error.message);
        }
    }

    private async runSeriesCycle() {
        try {
            const [trendingSeries, popularSeries, topRatedSeries, recommendedSeries] = await Promise.all([
                TMDBService.getTrendingSeries(),
                TMDBService.getPopularSeries(),
                TMDBService.getTopRatedSeries(),
                this.getRecommendedSeriesFromCatalog(),
            ]);

            const mergedSeries = this.dedupeSeries([
                ...trendingSeries,
                ...popularSeries,
                ...topRatedSeries,
                ...recommendedSeries,
            ]);
            const seriesSnapshot = await this.getCatalogSnapshot();
            const prioritizedSeries = this.prioritizeFreshSeriesCandidates(mergedSeries, seriesSnapshot);
            const seriesCandidates = prioritizedSeries.length ? prioritizedSeries : await this.getFreshSeriesFallbackCandidates(seriesSnapshot);

            if (!seriesCandidates.length) {
                console.warn('âš ï¸ [Arconte] SÃ©ries em alta indisponÃ­veis. Verifique TMDB_API_KEY vÃ¡lida.');
                return;
            }

            console.log(`ðŸ“º [Arconte] ${seriesCandidates.length} sÃ©ries candidatas recebidas do radar expandido do TMDB.`);

            for (const candidate of seriesCandidates.slice(0, this.seriesCatalogLimit)) {
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
                await this.sleep(900);
            }
        } catch (error: any) {
            console.error('âŒ Erro crÃ­tico no ciclo de sÃ©ries do Arconte:', error.message);
        }
    }

    private async processMovie(movie: TrendingMovie, isHighTrend: boolean = false) {
        try {
            const year = movie.year ? String(movie.year) : '';
            console.log(`ðŸ“¦ Processando filme: ${movie.title} ${year ? `(${year})` : ''} ${isHighTrend ? 'ðŸ”¥ [Predictive Candidate]' : ''}`);

            const searchResponse = await axios.get(`${BACKEND_URL}/videos`);
            const existing = (searchResponse.data || []).find((v: any) =>
                this.normalizeTitle(v.title) === this.normalizeTitle(movie.title)
            );

            if (existing) {
                console.log(`â© ${movie.title} jÃ¡ existe no catÃ¡logo. Pulando.`);
                return;
            }

            await this.seedMovieCatalogEntry(movie);
            await this.enrichMovieCatalogFromAddons(movie);

            const movieQueries = await this.buildMovieQueries(movie);
            const movieCandidates = await this.searchMovieCandidates(movie, movieQueries);
            const bestTorrent = movieCandidates[0];

            if (!bestTorrent) {
                console.log(`ðŸ—‚ï¸ [Catalog] ${movie.title} entrou no radar do Arconte mesmo sem fonte forte ainda.`);
                return;
            }

            const bestAvailability = this.estimateAvailability(bestTorrent.title, bestTorrent.seeds);
            if (bestAvailability < this.minAvailabilityForCatalog) {
                console.log(`Ã°Å¸â€”â€šÃ¯Â¸Â [Catalog] ${movie.title} ficou em CATALOG puro porque a melhor fonte ainda estÃƒÂ¡ fraca (${bestAvailability}).`);
                return;
            }
            const shouldExposeDirectSource = bestAvailability >= this.minAvailabilityForClickReady;
            const shouldPredictiveDownload = isHighTrend && shouldExposeDirectSource && bestAvailability > this.minSeedsForPredictive;
            const quality = this.detectQuality(bestTorrent.title);
            const language = this.detectLanguage(bestTorrent.title);
            const tags = [
                'Autobot',
                'Trending',
                'Movie',
                'Movies',
                'Filme',
                quality,
                language,
                bestTorrent.sourceSite || 'Nexus',
                shouldExposeDirectSource ? 'ResolvedSource' : 'Addon Radar',
            ]
                .filter(Boolean);
            const shouldCatalogOnly = !shouldPredictiveDownload;

            await this.recordHeuristicOutcome('movie', {
                title: movie.title,
                query: movieQueries.find((query) => this.normalizeTitle(bestTorrent.title).includes(this.normalizeTitle(query.split(/\b(19|20)\d{2}\b/)[0] || query))) || movieQueries[0],
                addonName: bestTorrent.sourceSite || bestTorrent.provider || 'Nexus',
                availability: bestAvailability,
                isPortuguese: language === 'pt-BR' || language === 'pt-BR-sub',
                sourceKind: bestTorrent.sourceSite || bestTorrent.provider || 'Nexus',
            });

            await axios.post(`${BACKEND_URL}/videos/auto-ingest`, {
                title: movie.title,
                description: movie.summary || `Filme popular de ${year || 'ano desconhecido'}. Encontrado via curadoria automÃ¡tica.`,
                category: 'Movies',
                externalSource: shouldExposeDirectSource ? bestTorrent.magnetLink : undefined,
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
                console.log(`ðŸ§  [Predictive] ${movie.title} marcado para download automÃ¡tico preventivo.`);
            } else if (shouldCatalogOnly) {
                console.log(`ðŸ—‚ï¸ [Catalog] ${movie.title} entrou como CATALOG ${shouldExposeDirectSource ? 'com fonte clicavel' : 'aguardando melhor materializaÃ§Ã£o'}.`);
            }

            console.log(`âœ¨ ${movie.title} adicionado com sucesso ao catÃ¡logo!`);
        } catch (error: any) {
            console.error(`Erro ao processar filme ${movie.title}:`, this.explainError(error));
        }
    }

    private async processSeries(seriesCandidate: CuratedSeries) {
        const titleForSearch = seriesCandidate.original_title || seriesCandidate.title;

        try {
            console.log(`ðŸ“º [Arconte] Processando sÃ©rie: ${seriesCandidate.title}`);

            const details = await TMDBService.getDetails(seriesCandidate.id, 'tv');
            if (!details) {
                console.warn(`âš ï¸ [Arconte] TMDB sem detalhes para ${seriesCandidate.title}.`);
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

            await this.enrichSeriesCatalogFromAddons(series.id, details, seasonsToProcess);

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
                    console.log(`âš ï¸ [Arconte] Nenhum pack viÃ¡vel encontrado para ${seriesCandidate.title} S${String(seasonNumber).padStart(2, '0')}.`);
                    continue;
                }

                await this.recordHeuristicOutcome('series', {
                    title: seriesCandidate.title,
                    query: `${titleForSearch} S${String(seasonNumber).padStart(2, '0')}`,
                    addonName: bestPack.sourceSite || bestPack.provider || 'Nexus Series',
                    availability: this.estimateAvailability(bestPack.title, bestPack.seeds),
                    isPortuguese: this.detectLanguage(bestPack.title) !== 'en',
                    sourceKind: bestPack.sourceSite || bestPack.provider || 'Nexus Series',
                });

                const explored = await axios.get(`${BACKEND_URL}/series/torrent/explore`, {
                    params: { magnetLink: bestPack.magnetLink },
                });

                const suggestedEpisodes = explored.data?.suggestedEpisodes || [];
                if (!suggestedEpisodes.length) {
                    console.log(`âš ï¸ [Arconte] Torrent sem episÃ³dios mapeÃ¡veis para ${seriesCandidate.title} S${String(seasonNumber).padStart(2, '0')}.`);
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
                            title: tmdbEpisode?.name || `EpisÃ³dio ${ep.episode}`,
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

                console.log(`âœ¨ [Arconte] ${seriesCandidate.title} S${String(seasonNumber).padStart(2, '0')} catalogada com ${episodesPayload.length} episÃ³dios.`);
            }
        } catch (error: any) {
            console.error(`Erro ao processar serie ${seriesCandidate.title}:`, this.explainError(error));
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

    private estimateAvailability(title?: string, seeds?: number): number {
        const normalized = String(title || '').toLowerCase();
        const baseSeeds = seeds || 0;
        const qualityBonus = normalized.includes('1080') || normalized.includes('2160') || normalized.includes('4k') ? 6 : 0;
        const portugueseBonus = normalized.includes('dublado') || normalized.includes('pt-br') ? 10 : normalized.includes('legendado') ? 4 : 0;
        const sourcePenalty = normalized.includes('cam') || normalized.includes('ts') ? -15 : 0;
        return baseSeeds + qualityBonus + portugueseBonus + sourcePenalty;
    }

    private async seedMovieCatalogEntry(movie: TrendingMovie) {
        const year = movie.year ? String(movie.year) : '';
        await axios.post(`${BACKEND_URL}/videos/auto-ingest`, {
            title: movie.title,
            description: movie.summary || `Filme em observaÃ§Ã£o editorial do Arconte ${year ? `(${year})` : ''}.`,
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
            console.warn(`âš ï¸ [Arconte] Falha ao semear catÃ¡logo para ${movie.title}: ${error?.message || error}`);
        });
    }

    private async enrichMovieCatalogFromAddons(movie: TrendingMovie) {
        if (!movie.tmdbId) return;

        try {
            const streams = await AddonService.getStreamsFromAllAddons('movie', String(movie.tmdbId), {
                title: [movie.title, movie.year ? String(movie.year) : ''].filter(Boolean).join(' ').trim(),
                preferPortugueseAudio: true,
                acceptPortugueseSubtitles: true,
            });

            if (!streams.length) return;

            const topStreams = streams.slice(0, 8);
            const addonNames = Array.from(new Set(topStreams.map((stream: any) => String(stream.addonName || '').trim()).filter(Boolean)));
            const titles = topStreams.map((stream: any) => String(stream.title || stream.name || stream.description || ''));
            const hasPortugueseAudio = titles.some((title) => /\bdublado\b|\bpt-br\b|\bptbr\b|\bportugues\b|\bportuguese\b|\baudio pt\b|\baudio br\b/.test(this.normalizeTitle(title)));
            const hasPortugueseSubtitle = titles.some((title) => /\blegenda pt\b|\blegenda pt br\b|\bsub pt\b|\bsubtitle pt\b|\blegendado\b/.test(this.normalizeTitle(title)));
            const quality = titles.some((title) => /2160|4k/i.test(title))
                ? '2160p'
                : titles.some((title) => /1080/i.test(title))
                    ? '1080p'
                    : titles.some((title) => /720/i.test(title))
                        ? '720p'
                        : '1080p';
            const language = hasPortugueseAudio ? 'pt-BR' : hasPortugueseSubtitle ? 'pt-BR-sub' : 'und';

            await this.recordHeuristicOutcome('movie', {
                title: movie.title,
                addonName: addonNames[0] || 'Addon Radar',
                availability: topStreams.length * 10,
                isPortuguese: hasPortugueseAudio || hasPortugueseSubtitle,
                sourceKind: 'addon-radar',
            });

            await axios.post(`${BACKEND_URL}/videos/auto-ingest`, {
                title: movie.title,
                description: movie.summary || `Filme em observaÃ§Ã£o editorial do Arconte ${movie.year ? `(${String(movie.year)})` : ''}.`,
                category: 'Movies',
                thumbnailUrl: movie.large_cover_image || movie.medium_cover_image || null,
                backdropUrl: movie.backdrop_path || movie.large_cover_image || movie.medium_cover_image || null,
                tags: [
                    'Arconte',
                    'Trending',
                    'Movie',
                    'Movies',
                    'Filme',
                    'Addon Radar',
                    quality,
                    language,
                    ...addonNames.slice(0, 4),
                ].filter(Boolean),
                tmdbId: String(movie.tmdbId),
                status: 'CATALOG',
                quality,
                language,
                sourceSite: addonNames[0] || 'Addon Radar',
                originalTitle: movie.title,
            }).catch(() => null);

            console.log(`ðŸ§© [Arconte] ${movie.title} enriquecido via addons (${addonNames.length} addon(s), idioma ${language}, qualidade ${quality}).`);
        } catch (error: any) {
            console.warn(`âš ï¸ [Arconte] Enriquecimento via addons falhou para ${movie.title}: ${error?.message || error}`);
        }
    }

    private async enrichSeriesCatalogFromAddons(seriesId: string, details: any, seasonsToProcess: any[]) {
        if (!details?.id || !seasonsToProcess?.length) return;

        try {
            const probes = seasonsToProcess.slice(0, 2).map((season: any) => ({
                seasonNumber: season.season_number,
                episodeNumber: 1,
            }));

            const results = await Promise.all(probes.map(async (probe) => {
                const probeTitle = `${details.name || details.original_name || 'Series'} S${String(probe.seasonNumber).padStart(2, '0')}E${String(probe.episodeNumber).padStart(2, '0')}`;
                const streams = await AddonService.getStreamsFromAllAddons('series', `${details.id}:${probe.seasonNumber}:${probe.episodeNumber}`, {
                    title: probeTitle,
                    preferPortugueseAudio: true,
                    acceptPortugueseSubtitles: true,
                }).catch(() => []);

                return Array.isArray(streams) ? streams.slice(0, 6) : [];
            }));

            const topStreams = results.flat();
            if (!topStreams.length) return;

            const addonNames = Array.from(new Set(topStreams.map((stream: any) => String(stream.addonName || '').trim()).filter(Boolean)));
            const titles = topStreams.map((stream: any) => String(stream.title || stream.name || stream.description || ''));
            const normalizedTitles = titles.map((title) => this.normalizeTitle(title));
            const hasPortugueseAudio = normalizedTitles.some((title) => /\bdublado\b|\bpt br\b|\bptbr\b|\bportugues\b|\bportuguese\b|\baudio pt\b|\baudio br\b/.test(title));
            const hasPortugueseSubtitle = normalizedTitles.some((title) => /\blegenda pt\b|\blegenda pt br\b|\bsub pt\b|\bsubtitle pt\b|\blegendado\b/.test(title));
            const quality = titles.some((title) => /2160|4k/i.test(title))
                ? '2160p'
                : titles.some((title) => /1080/i.test(title))
                    ? '1080p'
                    : titles.some((title) => /720/i.test(title))
                        ? '720p'
                        : null;
            const extraGenres = [
                'Addon Radar',
                hasPortugueseAudio ? 'pt-BR' : hasPortugueseSubtitle ? 'pt-BR-sub' : null,
                quality,
                ...addonNames.slice(0, 4),
            ].filter(Boolean);
            const mergedGenres = Array.from(new Set([
                ...((typeof details.genres === 'string'
                    ? details.genres.split(',')
                    : (details.genres || []).map((genre: any) => genre.name || genre)).map((genre: any) => String(genre).trim()).filter(Boolean)),
                ...extraGenres.map((genre) => String(genre).trim()),
            ]));

            await this.recordHeuristicOutcome('series', {
                title: details.name || details.original_name || 'Series',
                addonName: addonNames[0] || 'Addon Radar',
                availability: topStreams.length * 10,
                isPortuguese: hasPortugueseAudio || hasPortugueseSubtitle,
                sourceKind: 'addon-radar',
            });

            await axios.put(`${BACKEND_URL}/series/${seriesId}`, {
                genres: mergedGenres,
            }).catch(() => null);

            console.log(`ðŸ§© [Arconte] ${details.name || details.original_name} enriquecida via addons (${addonNames.length} addon(s), idioma ${hasPortugueseAudio ? 'pt-BR' : hasPortugueseSubtitle ? 'pt-BR-sub' : 'und'}${quality ? `, qualidade ${quality}` : ''}).`);
        } catch (error: any) {
            console.warn(`âš ï¸ [Arconte] Enriquecimento de sÃ©rie via addons falhou para ${details?.name || details?.original_name}: ${error?.message || error}`);
        }
    }

    private async buildMovieQueries(movie: TrendingMovie): Promise<string[]> {
        const year = movie.year ? String(movie.year) : '';
        const aliases = this.buildMovieAliases(movie.title, movie.originalTitle);
        const baseTerms = [
            ...aliases.flatMap((alias) => ([
                [alias, year].filter(Boolean).join(' ').trim(),
                [alias, year, '1080p'].filter(Boolean).join(' ').trim(),
                [alias, year, 'dublado'].filter(Boolean).join(' ').trim(),
                [alias, year, 'dual audio'].filter(Boolean).join(' ').trim(),
                [alias, year, 'pt-br'].filter(Boolean).join(' ').trim(),
                [alias, year, 'WEB-DL'].filter(Boolean).join(' ').trim(),
            ])),
        ].filter(Boolean);

        const aiTerms = await aiService.decomposeSearchQuery([
            movie.title,
            year,
            (movie.genres || []).slice(0, 3).join(' '),
        ].filter(Boolean).join(' ').trim());
        const merged = [...new Set([...baseTerms, ...aiTerms])].slice(0, 14);
        return this.rankQueriesByLearnedHeuristics('movie', merged);
    }

    private async searchMovieCandidates(movie: TrendingMovie, queries: string[]) {
        const seenMagnets = new Set<string>();
        const results: any[] = [];

        const addonCandidates = await this.getAddonMovieCandidates(movie);
        await this.loadHeuristicCache('movie', [], addonCandidates.map((item: any) => String(item.sourceSite || item.provider || '')));
        for (const item of addonCandidates) {
            if (!item?.magnetLink || seenMagnets.has(item.magnetLink)) {
                continue;
            }
            seenMagnets.add(item.magnetLink);
            results.push(item);
        }

        const scoreCandidate = (item: any) => {
            const sourceBoost = item.sourceKind === 'addon' ? 18 : 0;
            const learnedBoost = this.getLearnedAddonBoost('movie', item.sourceSite || item.provider);
            return this.estimateAvailability(item.title, item.seeds) + learnedBoost + sourceBoost;
        };

        const strongestAddonCandidate = addonCandidates
            .slice()
            .sort((a: any, b: any) => scoreCandidate(b) - scoreCandidate(a))[0];

        if (strongestAddonCandidate && scoreCandidate(strongestAddonCandidate) >= this.minAvailabilityForClickReady) {
            console.log(`ðŸ§² [Arconte] ${movie.title} jÃ¡ possui fonte forte via addon (${strongestAddonCandidate.sourceSite || strongestAddonCandidate.provider}). Reduzindo dependÃªncia da busca tradicional.`);
            return results.sort((a: any, b: any) => scoreCandidate(b) - scoreCandidate(a));
        }

        if (!this.canUseTraditionalMovieSearch()) {
            console.warn(`âš ï¸ [Arconte] Nexus filmes em cooldown. ${movie.title} seguirÃ¡ em modo addon-first nesta rodada.`);
            return results.sort((a: any, b: any) => scoreCandidate(b) - scoreCandidate(a));
        }

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
                const explained = this.explainSearchProviderError(error, NEXUS_MOVIES_URL);
                console.warn(`âš ï¸ [Arconte] Busca de filme falhou para "${query}": ${explained.summary}`);
                console.warn(`[Arconte][MovieSearchFailure] ${JSON.stringify({
                    query,
                    endpoint: explained.endpoint,
                    status: explained.status,
                    message: explained.message,
                    detail: explained.detail,
                    nested: explained.nested,
                    providers: explained.providers,
                })}`);
                if (this.shouldTriggerMovieSearchCooldown(error)) {
                    this.activateTraditionalMovieSearchCooldown();
                    break;
                }
            }
        }

        await this.loadHeuristicCache('movie', [], results.map((item: any) => String(item.sourceSite || item.provider || '')));

        return results
            .sort((a: any, b: any) => {
                const aAvailability = scoreCandidate(a);
                const bAvailability = scoreCandidate(b);
                return bAvailability - aAvailability;
            });
    }

    private async getAddonMovieCandidates(movie: TrendingMovie) {
        if (!movie.tmdbId) return [];

        try {
            const streams = await AddonService.getStreamsFromAllAddons('movie', String(movie.tmdbId), {
                title: [movie.title, movie.originalTitle, movie.year ? String(movie.year) : ''].filter(Boolean).join(' ').trim(),
                preferPortugueseAudio: true,
                acceptPortugueseSubtitles: true,
            });

            return streams
                .map((stream: any) => {
                    const magnetLink = this.buildEnrichedMagnetFromStream(stream);
                    if (!magnetLink) return null;

                    const stats = this.extractSwarmStats(stream);
                    return {
                        title: String(stream.title || stream.name || stream.description || movie.title),
                        magnetLink,
                        poster: movie.large_cover_image || movie.medium_cover_image || null,
                        seeds: stats.seeds,
                        peers: stats.peers,
                        sourceSite: stream.addonName || stream.provider || 'Addon',
                        provider: stream.provider || stream.addonName || 'Addon',
                        sourceKind: 'addon',
                    };
                })
                .filter(Boolean);
        } catch {
            return [];
        }
    }

    private extractSwarmStats(stream: any) {
        const haystack = String([stream?.title, stream?.name, stream?.description].filter(Boolean).join(' '));
        const peersMatch = haystack.match(/(?:ðŸ‘¤|peers?)[^\d]{0,6}(\d{1,5})/i);
        const seedsMatch = haystack.match(/seed(?:s|ers?)?[^\d]{0,6}(\d{1,5})/i);
        const swarmMatch = haystack.match(/swarm[^\d]{0,6}(\d{1,5})/i);

        return {
            peers: peersMatch ? Number(peersMatch[1]) : (swarmMatch ? Number(swarmMatch[1]) : 0),
            seeds: seedsMatch ? Number(seedsMatch[1]) : 0,
        };
    }

    private buildEnrichedMagnetFromStream(stream: any): string | null {
        const rawUrl = String(stream?.url || '').trim();
        const magnetUri = rawUrl.startsWith('magnet:') ? rawUrl : String(stream?.behaviorHints?.magnetUri || '').trim();
        const infoHash = String(stream?.infoHash || '').trim().toLowerCase();
        const base = magnetUri || (infoHash ? `magnet:?xt=urn:btih:${infoHash}` : '');
        if (!base.startsWith('magnet:?')) return null;

        const trackers = new Set<string>(DEFAULT_TRACKERS);
        const sources = Array.isArray(stream?.sources) ? stream.sources : [];
        for (const source of sources) {
            const value = String(source || '').trim();
            if (!value) continue;
            if (value.startsWith('tracker:')) trackers.add(value.slice('tracker:'.length));
            else if (/^(udp|ws|wss):\/\//i.test(value)) trackers.add(value);
        }

        const parts = base.split('&').filter(Boolean);
        const existingTrackers = new Set<string>();
        for (const part of parts) {
            if (!part.startsWith('tr=')) continue;
            try {
                existingTrackers.add(decodeURIComponent(part.slice(3)));
            } catch {
                existingTrackers.add(part.slice(3));
            }
        }

        for (const tracker of trackers) {
            if (!existingTrackers.has(tracker)) {
                parts.push(`tr=${encodeURIComponent(tracker)}`);
            }
        }

        return parts.join('&');
    }

    private normalizeTitle(value?: string): string {
        return (value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/gi, ' ')
            .trim()
            .toLowerCase();
    }

    private dedupeMovies(movies: TrendingMovie[]): TrendingMovie[] {
        const seen = new Set<string>();
        return movies.filter((movie) => {
            const key = movie.tmdbId
                ? `tmdb:${movie.tmdbId}`
                : `${this.normalizeTitle(movie.title)}:${String(movie.year || '')}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    private dedupeSeries(series: any[]): any[] {
        const seen = new Set<string>();
        return series.filter((item) => {
            const key = item.id ? `tmdb:${item.id}` : this.normalizeTitle(item.title || item.name);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    private async getCatalogSnapshot(): Promise<CatalogSnapshot> {
        try {
            const [videosResponse, seriesResponse] = await Promise.all([
                axios.get(`${BACKEND_URL}/videos`).catch(() => ({ data: [] })),
                axios.get(`${BACKEND_URL}/series`).catch(() => ({ data: [] })),
            ]);

            const videos = Array.isArray(videosResponse.data) ? videosResponse.data : [];
            const series = Array.isArray(seriesResponse.data) ? seriesResponse.data : [];

            return {
                movieIds: new Set(videos.map((video: any) => String(video.tmdbId || '').trim()).filter(Boolean)),
                movieTitles: new Set(videos.map((video: any) => this.normalizeTitle(video.title)).filter(Boolean)),
                seriesIds: new Set(series.map((item: any) => String(item.tmdbId || '').trim()).filter(Boolean)),
                seriesTitles: new Set(series.map((item: any) => this.normalizeTitle(item.title)).filter(Boolean)),
                videos,
                series,
            };
        } catch {
            return {
                movieIds: new Set<string>(),
                movieTitles: new Set<string>(),
                seriesIds: new Set<string>(),
                seriesTitles: new Set<string>(),
                videos: [],
                series: [],
            };
        }
    }

    private prioritizeFreshMovieCandidates(movies: TrendingMovie[], snapshot: CatalogSnapshot): TrendingMovie[] {
        const unseen = movies.filter((movie) => !this.isKnownMovie(movie, snapshot));
        const known = movies.filter((movie) => this.isKnownMovie(movie, snapshot));

        if (known.length) {
            console.log(`ðŸ§¹ [Arconte] Vetando ${known.length} filme(s) jÃ¡ presentes no banco para abrir espaÃ§o a novidades.`);
        }

        return [...unseen, ...known];
    }

    private prioritizeFreshSeriesCandidates(series: any[], snapshot: CatalogSnapshot): any[] {
        const unseen = series.filter((item) => !this.isKnownSeries(item, snapshot));
        const known = series.filter((item) => this.isKnownSeries(item, snapshot));

        if (known.length) {
            console.log(`ðŸ§¹ [Arconte] Vetando ${known.length} sÃ©rie(s) jÃ¡ presentes no banco para priorizar descobertas.`);
        }

        return [...unseen, ...known];
    }

    private isKnownMovie(movie: TrendingMovie, snapshot: CatalogSnapshot): boolean {
        const tmdbId = String(movie.tmdbId || '').trim();
        return (tmdbId && snapshot.movieIds.has(tmdbId)) || snapshot.movieTitles.has(this.normalizeTitle(movie.title));
    }

    private isKnownSeries(item: any, snapshot: CatalogSnapshot): boolean {
        const tmdbId = String(item.id || item.tmdbId || '').trim();
        const title = item.title || item.name || '';
        return (tmdbId && snapshot.seriesIds.has(tmdbId)) || snapshot.seriesTitles.has(this.normalizeTitle(title));
    }

    private buildMovieAliases(title: string, originalTitle?: string): string[] {
        const aliases = new Set<string>();
        const clean = String(title || '').replace(/[â€œâ€"']/g, '').trim();
        const normalizedSpacing = clean.replace(/\s+/g, ' ').trim();

        if (normalizedSpacing) aliases.add(normalizedSpacing);
        const cleanOriginal = String(originalTitle || '').replace(/[??????"']/g, '').replace(/\s+/g, ' ').trim();
        if (cleanOriginal && cleanOriginal.length >= 3) aliases.add(cleanOriginal);

        const noSubtitle = normalizedSpacing.split(':')[0]?.trim();
        if (noSubtitle && noSubtitle.length >= 3) aliases.add(noSubtitle);

        const noArticleSuffix = normalizedSpacing
            .replace(/\bo filme\b/gi, '')
            .replace(/\bthe movie\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
        if (noArticleSuffix && noArticleSuffix.length >= 3) aliases.add(noArticleSuffix);

        return Array.from(aliases).slice(0, 3);
    }

    private makeHeuristicKey(kind: 'query' | 'addon' | 'title', mediaType: 'movie' | 'series', value: string) {
        return `arconte:heuristic:${kind}:${mediaType}:${this.normalizeTitle(value)}`;
    }

    private parseHeuristicScore(raw?: string | null): HeuristicScore {
        if (!raw) return { wins: 0, ptBrWins: 0, totalAvailability: 0 };
        try {
            const parsed = JSON.parse(raw);
            return {
                wins: Number(parsed?.wins || 0),
                ptBrWins: Number(parsed?.ptBrWins || 0),
                totalAvailability: Number(parsed?.totalAvailability || 0),
                lastSource: parsed?.lastSource ? String(parsed.lastSource) : undefined,
                updatedAt: parsed?.updatedAt ? String(parsed.updatedAt) : undefined,
            };
        } catch {
            return { wins: 0, ptBrWins: 0, totalAvailability: 0 };
        }
    }

    private heuristicWeight(score?: HeuristicScore) {
        if (!score) return 0;
        const avgAvailability = score.wins > 0 ? score.totalAvailability / score.wins : 0;
        return (score.ptBrWins * 6) + (score.wins * 2) + Math.min(avgAvailability / 10, 12);
    }

    private getCachedHeuristic(key: string): HeuristicScore | undefined {
        return this.heuristicCache.get(key);
    }

    private getLearnedAddonBoost(mediaType: 'movie' | 'series', addonName?: string) {
        if (!addonName) return 0;
        const score = this.getCachedHeuristic(this.makeHeuristicKey('addon', mediaType, addonName));
        return this.heuristicWeight(score);
    }

    private async loadHeuristicCache(mediaType: 'movie' | 'series', queries: string[] = [], addons: string[] = [], titles: string[] = []) {
        const keys = [
            ...queries.map((value) => this.makeHeuristicKey('query', mediaType, value)),
            ...addons.map((value) => this.makeHeuristicKey('addon', mediaType, value)),
            ...titles.map((value) => this.makeHeuristicKey('title', mediaType, value)),
        ].filter(Boolean);

        const missingKeys = keys.filter((key) => !this.heuristicCache.has(key));
        if (!missingKeys.length) return;

        const rows = await prisma.systemStats.findMany({
            where: { key: { in: missingKeys } },
        }).catch(() => []);

        for (const row of rows) {
            this.heuristicCache.set(row.key, this.parseHeuristicScore(row.valueString));
        }

        for (const key of missingKeys) {
            if (!this.heuristicCache.has(key)) {
                this.heuristicCache.set(key, { wins: 0, ptBrWins: 0, totalAvailability: 0 });
            }
        }
    }

    private async recordHeuristicOutcome(
        mediaType: 'movie' | 'series',
        payload: {
            title: string;
            query?: string;
            addonName?: string;
            availability: number;
            isPortuguese: boolean;
            sourceKind?: string;
        }
    ) {
        const updates = [
            payload.query ? this.makeHeuristicKey('query', mediaType, payload.query) : null,
            payload.addonName ? this.makeHeuristicKey('addon', mediaType, payload.addonName) : null,
            payload.title ? this.makeHeuristicKey('title', mediaType, payload.title) : null,
        ].filter(Boolean) as string[];

        for (const key of updates) {
            const current = this.getCachedHeuristic(key) || this.parseHeuristicScore(
                (await prisma.systemStats.findUnique({ where: { key } }).catch(() => null))?.valueString
            );
            const next: HeuristicScore = {
                wins: (current?.wins || 0) + 1,
                ptBrWins: (current?.ptBrWins || 0) + (payload.isPortuguese ? 1 : 0),
                totalAvailability: (current?.totalAvailability || 0) + Math.max(0, payload.availability || 0),
                lastSource: payload.sourceKind || payload.addonName || current?.lastSource,
                updatedAt: new Date().toISOString(),
            };

            this.heuristicCache.set(key, next);
            await prisma.systemStats.upsert({
                where: { key },
                update: { valueString: JSON.stringify(next) },
                create: { key, valueString: JSON.stringify(next) },
            }).catch(() => null);
        }
    }

    private async rankQueriesByLearnedHeuristics(mediaType: 'movie' | 'series', queries: string[]) {
        await this.loadHeuristicCache(mediaType, queries);
        return [...queries].sort((a, b) => {
            const aScore = this.heuristicWeight(this.getCachedHeuristic(this.makeHeuristicKey('query', mediaType, a)));
            const bScore = this.heuristicWeight(this.getCachedHeuristic(this.makeHeuristicKey('query', mediaType, b)));
            return bScore - aScore;
        });
    }

    private explainError(error: any): string {
        const status = error?.response?.status;
        const data = error?.response?.data;
        const errorName = error?.name || '';
        const errorCode = error?.code || '';
        const causeMessage = error?.cause?.message || '';
        const message = error?.message || 'erro desconhecido';
        const detail = typeof data === 'string'
            ? data
            : data?.message || data?.error || (data ? JSON.stringify(data).slice(0, 240) : '');
        return [status ? `HTTP ${status}` : '', errorName, errorCode, message, causeMessage, detail].filter(Boolean).join(' | ');
    }

    private explainSearchProviderError(error: any, endpoint: string): {
        endpoint: string;
        status: number | null;
        message: string;
        detail: string;
        nested: string[];
        providers: string[];
        summary: string;
    } {
        const status = typeof error?.response?.status === 'number' ? error.response.status : null;
        const base = this.explainError(error);
        const nestedErrors = Array.isArray(error?.errors)
            ? error.errors.map((entry: any) => this.explainError(entry)).filter(Boolean)
            : [];
        const responseFailures = Array.isArray(error?.response?.data?.failures)
            ? error.response.data.failures.map((entry: any) => {
                const provider = entry?.provider || entry?.source || entry?.site || 'provider';
                const statusLabel = entry?.status ? `[${entry.status}]` : '';
                const countLabel = typeof entry?.count === 'number' && entry.count > 0 ? `(${entry.count})` : '';
                const reason = entry?.error || entry?.message || JSON.stringify(entry).slice(0, 120);
                return `${provider}${statusLabel}${countLabel}: ${reason}`;
            })
            : [];
        const detail = typeof error?.response?.data === 'string'
            ? error.response.data
            : (error?.response?.data ? JSON.stringify(error.response.data).slice(0, 400) : '');
        const summary = [
            endpoint,
            base,
            nestedErrors.length ? `nested=[${nestedErrors.slice(0, 4).join(' || ')}]` : '',
            responseFailures.length ? `providers=[${responseFailures.slice(0, 6).join(' || ')}]` : '',
        ].filter(Boolean).join(' | ');

        return {
            endpoint,
            status,
            message: error?.message || error?.name || 'erro desconhecido',
            detail,
            nested: nestedErrors.slice(0, 8),
            providers: responseFailures.slice(0, 12),
            summary,
        };
    }

    private canUseTraditionalMovieSearch(): boolean {
        return Date.now() >= this.nexusMovieSearchCooldownUntil;
    }

    private shouldTriggerMovieSearchCooldown(error: any): boolean {
        const status = error?.response?.status;
        const code = String(error?.code || '').toUpperCase();
        const message = String(error?.message || '').toUpperCase();
        return status === 502
            || status === 503
            || status === 504
            || code === 'ECONNREFUSED'
            || code === 'ECONNRESET'
            || code === 'ETIMEDOUT'
            || message.includes('ECONNREFUSED')
            || message.includes('ECONNRESET')
            || message.includes('ETIMEDOUT');
    }

    private activateTraditionalMovieSearchCooldown(minutes: number = 5) {
        const until = Date.now() + minutes * 60 * 1000;
        if (until <= this.nexusMovieSearchCooldownUntil) return;
        this.nexusMovieSearchCooldownUntil = until;
        console.warn(`âš ï¸ [Arconte] Nexus filmes indisponÃ­vel. Ativando modo addon-first por ${minutes} min.`);
    }


    private async getRecommendedMoviesFromCatalog() {
        try {
            const snapshot = await this.getCatalogSnapshot();
            const seeds = snapshot.videos
                .filter((video: any) => !!video.tmdbId)
                .slice(0, 16);

            const recommendationBatches = await Promise.all(
                seeds.map((video: any) => TMDBService.getRecommendations(Number(video.tmdbId), 'movie').catch(() => []))
            );

            return recommendationBatches
                .flat()
                .filter(Boolean)
                .filter((movie: any) => !this.isKnownMovie({
                    tmdbId: movie.id,
                    title: movie.title,
                    year: movie.release_date?.split?.('-')?.[0],
                }, snapshot));
        } catch {
            return [];
        }
    }

    private async getRecommendedSeriesFromCatalog() {
        try {
            const snapshot = await this.getCatalogSnapshot();
            const seeds = snapshot.series
                .filter((series: any) => !!series.tmdbId)
                .slice(0, 16);

            const recommendationBatches = await Promise.all(
                seeds.map((series: any) => TMDBService.getRecommendations(Number(series.tmdbId), 'tv').catch(() => []))
            );

            return recommendationBatches
                .flat()
                .filter(Boolean)
                .filter((series: any) => !this.isKnownSeries({
                    id: series.id,
                    title: series.title,
                    name: series.title,
                }, snapshot));
        } catch {
            return [];
        }
    }

    private async getLocalMovieFallbackCandidates(): Promise<TrendingMovie[]> {
        try {
            const response = await axios.get(`${BACKEND_URL}/videos`);
            const catalog = (response.data || [])
                .filter((video: any) => !!video.title)
                .slice(0, this.movieCatalogLimit)
                .map((video: any) => ({
                    tmdbId: video.tmdbId || undefined,
                    title: video.title,
                    year: undefined,
                    summary: video.description || '',
                    large_cover_image: video.thumbnailPath || null,
                    medium_cover_image: video.thumbnailPath || null,
                    backdrop_path: video.thumbnailPath || null,
                    genres: Array.isArray(video.tags) ? video.tags : String(video.tags || '').split(',').filter(Boolean),
                }));

            console.warn(`âš ï¸ [Arconte] Usando fallback local com ${catalog.length} filme(s) do banco.`);
            return this.dedupeMovies(catalog);
        } catch {
            return [];
        }
    }

    private async getLocalSeriesFallbackCandidates(): Promise<CuratedSeries[]> {
        try {
            const response = await axios.get(`${BACKEND_URL}/series`);
            const catalog = (response.data || [])
                .filter((series: any) => !!series.title)
                .slice(0, this.seriesCatalogLimit)
                .map((series: any) => ({
                    id: Number(series.tmdbId || 0),
                    title: series.title,
                    original_title: series.title,
                    overview: series.overview || '',
                    poster_path: series.poster || null,
                    backdrop_path: series.backdrop || null,
                    release_date: null,
                    vote_average: 0,
                }))
                .filter((series: CuratedSeries) => !!series.id);

            console.warn(`âš ï¸ [Arconte] Usando fallback local com ${catalog.length} sÃ©rie(s) do banco.`);
            return this.dedupeSeries(catalog);
        } catch {
            return [];
        }
    }

    private async getFreshMovieFallbackCandidates(snapshot?: CatalogSnapshot): Promise<TrendingMovie[]> {
        try {
            const state = snapshot || await this.getCatalogSnapshot();
            const recommendationBatches = await Promise.all(
                state.videos
                    .filter((video: any) => !!video.tmdbId)
                    .slice(0, 12)
                    .map((video: any) => TMDBService.getRecommendations(Number(video.tmdbId), 'movie').catch(() => []))
            );

            const catalog = recommendationBatches.flat()
                .filter((video: any) => !!video.title)
                .filter((video: any) => !this.isKnownMovie({
                    tmdbId: video.id,
                    title: video.title,
                    year: video.release_date?.split?.('-')?.[0],
                }, state))
                .slice(0, this.movieCatalogLimit * 2)
                .map((video: any) => ({
                    tmdbId: video.id || video.tmdbId || undefined,
                    title: video.title,
                    year: video.release_date?.split?.('-')?.[0],
                    summary: video.overview || video.description || '',
                    large_cover_image: video.poster_path || video.thumbnailPath || null,
                    medium_cover_image: video.poster_path || video.thumbnailPath || null,
                    backdrop_path: video.backdrop_path || video.thumbnailPath || null,
                    genres: Array.isArray(video.tags) ? video.tags : [],
                }));

            console.warn(`Ã¢Å¡Â Ã¯Â¸Â [Arconte] Usando fallback local com ${catalog.length} recomendaÃ§Ãµes inÃ©ditas derivadas do banco.`);
            return this.prioritizeFreshMovieCandidates(this.dedupeMovies(catalog), state);
        } catch {
            return [];
        }
    }

    private async getFreshSeriesFallbackCandidates(snapshot?: CatalogSnapshot): Promise<CuratedSeries[]> {
        try {
            const state = snapshot || await this.getCatalogSnapshot();
            const recommendationBatches = await Promise.all(
                state.series
                    .filter((series: any) => !!series.tmdbId)
                    .slice(0, 12)
                    .map((series: any) => TMDBService.getRecommendations(Number(series.tmdbId), 'tv').catch(() => []))
            );

            const catalog = recommendationBatches.flat()
                .filter((series: any) => !!series.id && !!series.title)
                .filter((series: any) => !this.isKnownSeries({ id: series.id, title: series.title }, state))
                .slice(0, this.seriesCatalogLimit * 2)
                .map((series: any) => ({
                    id: Number(series.id || 0),
                    title: series.title,
                    original_title: series.original_title || series.title,
                    overview: series.overview || '',
                    poster_path: series.poster_path || null,
                    backdrop_path: series.backdrop_path || null,
                    release_date: series.release_date || null,
                    vote_average: series.vote_average || 0,
                }))
                .filter((series: CuratedSeries) => !!series.id);

            console.warn(`Ã¢Å¡Â Ã¯Â¸Â [Arconte] Usando fallback local com ${catalog.length} recomendaÃ§Ãµes inÃ©ditas de sÃ©ries derivadas do banco.`);
            return this.prioritizeFreshSeriesCandidates(this.dedupeSeries(catalog), state);
        } catch {
            return [];
        }
    }

    private async sleep(ms: number) {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }
}



