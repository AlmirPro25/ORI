import 'dotenv/config';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { TMDBService } from './tmdb-service';
import { aiService } from './ai-service';
import { AddonService } from './services/addon.service';
import { eventBus, SystemEvents, ActivityType } from './event-bus';

/**
 * ARCONTE AUTO-CURATOR
 * Curadoria automática real de filmes e séries.
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

type SimpleAxiosData<T = any> = {
    data: T;
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
        await this.waitForBackendReady();
        console.log('📡 Arconte iniciando ciclo de busca de tendências...');
        
        eventBus.emit(SystemEvents.SYSTEM_ACTIVITY, { 
            activity: ActivityType.SCANNING, 
            detail: 'Iniciando varredura global de tendências' 
        });

        await this.refreshFeedbackLoop();

        await this.runMovieCycle();
        await this.runSeriesCycle();

        console.log('✅ Ciclo de curadoria concluído.');
        
        // Insight de conclusão
        this.emitRandomInsight();

        eventBus.emit(SystemEvents.SYSTEM_ACTIVITY, { 
            activity: ActivityType.IDLE, 
            detail: 'Aguardando próximo ciclo' 
        });
    }

    private emitRandomInsight() {
        const insights = [
            "Varredura de tendências concluída. O catálogo está sincronizado com o Nexus.",
            "Detectei novas fontes de alta qualidade para os títulos mais populares hoje.",
            "Minha rede P2P está estável. Arconte operando em modo de vigilância.",
            "Soberania digital garantida: Fontes PT-BR priorizadas com sucesso.",
            "Acurácia das previsões está em subida. Sistema aprendendo com o uso."
        ];
        const message = insights[Math.floor(Math.random() * insights.length)];
        
        eventBus.emit(SystemEvents.ARCONTE_INSIGHT, {
            message,
            type: 'thought'
        });
    }

    private async waitForBackendReady(retries: number = 8, delayMs: number = 2500) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                await axios.get(`${BACKEND_URL.replace('/api/v1', '')}/health`, { timeout: 4000 });
                return;
            } catch {
                if (attempt === retries) {
                    console.warn('⚠️ [Arconte] Backend local ainda não ficou pronto a tempo. Continuando mesmo assim.');
                    return;
                }
                await this.sleep(delayMs);
            }
        }
    }

    private async refreshFeedbackLoop() {
        try {
            const statsRes = await axios.get(`${BACKEND_URL}/downloads/stats/predictions`).catch(() => null) as SimpleAxiosData<any> | null;
            if (!statsRes) return;

            const { accuracy } = statsRes.data;
            this.lastAccuracy = accuracy;

            if (accuracy < 30) {
                this.predictiveLimit = 2;
                this.movieCatalogLimit = 18;
                this.seriesCatalogLimit = 10;
                this.minSeedsForPredictive = 100;
                console.log(`📉 [Arconte] Baixa acurácia (${accuracy}%). Tornando-se conservador.`);
            } else if (accuracy > 70) {
                this.predictiveLimit = 10;
                this.movieCatalogLimit = 40;
                this.seriesCatalogLimit = 24;
                this.minSeedsForPredictive = 30;
                console.log(`📈 [Arconte] Alta acurácia (${accuracy}%). Tornando-se agressivo.`);
            } else {
                this.predictiveLimit = 5;
                this.movieCatalogLimit = 28;
                this.seriesCatalogLimit = 16;
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
                console.log('📡 [Arconte] Tentando YTS...');
                const response = await axios.get('https://yts.mx/api/v2/list_movies.json?sort_by=trending_score&limit=20', { timeout: 10000 }) as SimpleAxiosData<any>;
                movies = response.data?.data?.movies || [];
                console.log(`✅ [Arconte] ${movies.length} tendências encontradas no YTS.`);
            } catch {
                console.warn('⚠️ [Arconte] YTS falhou (DNS ou Timeout). Tentando fallback TMDB...');
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
                console.log(`✅ [Arconte] ${movies.length} tendências encontradas no TMDB.`);
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
            console.log(`🎬 [Arconte] Radar expandido para ${movies.length} filmes candidatos neste ciclo.`);

            if (!movies.length) {
                console.warn('⚠️ [Arconte] Nenhuma tendência de filmes encontrada no momento.');
                return;
            }

            for (let i = 0; i < Math.min(movies.length, this.movieCatalogLimit); i++) {
                const movie = movies[i];
                const isHighTrend = i < this.predictiveLimit;
                await this.processMovie(movie, isHighTrend);
                await this.sleep(900);
            }
        } catch (error: any) {
            console.error('❌ Erro crítico no ciclo de filmes do Arconte:', error.message);
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
                console.warn('⚠️ [Arconte] Séries em alta indisponíveis. Verifique TMDB_API_KEY válida.');
                return;
            }

            console.log(`📺 [Arconte] ${seriesCandidates.length} séries candidatas recebidas do radar expandido do TMDB.`);

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
            console.error('❌ Erro crítico no ciclo de séries do Arconte:', error.message);
        }
    }

    private async processMovie(movie: TrendingMovie, isHighTrend: boolean = false) {
        try {
            const year = movie.year ? String(movie.year) : '';
            console.log(`📦 Processando filme: ${movie.title} ${year ? `(${year})` : ''} ${isHighTrend ? '🔥 [Predictive Candidate]' : ''}`);

            const searchResponse = await axios.get(`${BACKEND_URL}/videos`) as SimpleAxiosData<any[]>;
            const existing = (searchResponse.data || []).find((v: any) =>
                this.normalizeTitle(v.title) === this.normalizeTitle(movie.title)
            );

            if (existing) {
                console.log(`⏩ ${movie.title} já existe no catálogo. Pulando.`);
                return;
            }

            await this.seedMovieCatalogEntry(movie);
            await this.enrichMovieCatalogFromAddons(movie);

            const movieQueries = await this.buildMovieQueries(movie);
            const movieCandidates = await this.searchMovieCandidates(movie, movieQueries);
            const bestTorrent = movieCandidates[0];

            if (!bestTorrent) {
                console.log(`🗄️ [Catalog] ${movie.title} entrou no radar do Arconte mesmo sem fonte forte ainda.`);
                return;
            }

            const bestAvailability = this.estimateAvailability(bestTorrent.title, bestTorrent.seeds);
            if (bestAvailability < this.minAvailabilityForCatalog) {
                console.log(`🗄️ [Catalog] ${movie.title} ficou em CATALOG puro porque a melhor fonte ainda está fraca (${bestAvailability}).`);
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
                addonName: bestTorrent.sourceSite || 'Nexus',
                availability: bestAvailability,
                isPortuguese: language === 'pt-BR' || language === 'pt-BR-sub',
                sourceKind: bestTorrent.sourceSite || 'Nexus',
            });

            await axios.post(`${BACKEND_URL}/videos/auto-ingest`, {
                title: movie.title,
                description: movie.summary || `Filme popular de ${year || 'ano desconhecido'}. Encontrado via curadoria automática.`,
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
                console.log(`🧠 [Predictive] ${movie.title} marcado para download automático preventivo.`);
            } else if (shouldCatalogOnly) {
                console.log(`🗄️ [Catalog] ${movie.title} entrou como CATALOG ${shouldExposeDirectSource ? 'com fonte clicavel' : 'aguardando melhor materialização'}.`);
            }

            console.log(`✨ ${movie.title} adicionado com sucesso ao catálogo!`);
        } catch (error: any) {
            console.error(`Erro ao processar filme ${movie.title}:`, this.explainError(error));
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

            const series = (seriesResponse as SimpleAxiosData<any>).data;
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
                    console.log(`⚠️ [Arconte] Nenhum pack viável encontrado para ${seriesCandidate.title} S${String(seasonNumber).padStart(2, '0')}.`);
                    continue;
                }

                await this.recordHeuristicOutcome('series', {
                    title: seriesCandidate.title,
                    query: `${titleForSearch} S${String(seasonNumber).padStart(2, '0')}`,
                    addonName: bestPack.sourceSite || 'Nexus Series',
                    availability: this.estimateAvailability(bestPack.title, bestPack.seeds),
                    isPortuguese: this.detectLanguage(bestPack.title) !== 'en',
                    sourceKind: bestPack.sourceSite || 'Nexus Series',
                });

                const explored = await axios.get(`${BACKEND_URL}/series/torrent/explore`, {
                    params: { magnetLink: bestPack.magnetLink },
                }) as SimpleAxiosData<any>;

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
            console.error(`Erro ao processar serie ${seriesCandidate.title}:`, this.explainError(error));
        }
    }

    private async findBestSeriesPack(seriesName: string, seasonNumber: number) {
        const response = await axios.post(NEXUS_SERIES_URL, {
            query: seriesName,
            season: seasonNumber,
            limit: 8,
        }) as SimpleAxiosData<any>;

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
                description: movie.summary || `Filme em observação editorial do Arconte ${movie.year ? `(${String(movie.year)})` : ''}.`,
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

            console.log(`🧩 [Arconte] ${movie.title} enriquecido via addons (${addonNames.length} addon(s), idioma ${language}, qualidade ${quality}).`);
        } catch (error: any) {
            console.warn(`⚠️ [Arconte] Enriquecimento via addons falhou para ${movie.title}: ${error?.message || error}`);
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

            console.log(`🧩 [Arconte] ${details.name || details.original_name} enriquecida via addons (${addonNames.length} addon(s), idioma ${hasPortugueseAudio ? 'pt-BR' : hasPortugueseSubtitle ? 'pt-BR-sub' : 'und'}${quality ? `, qualidade ${quality}` : ''}).`);
        } catch (error: any) {
            console.warn(`⚠️ [Arconte] Enriquecimento de série via addons falhou para ${details?.name || details?.original_name}: ${error?.message || error}`);
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
            console.log(`🧲 [Arconte] ${movie.title} já possui fonte forte via addon (${strongestAddonCandidate.sourceSite || strongestAddonCandidate.provider}). Reduzindo dependência da busca tradicional.`);
            return results.sort((a: any, b: any) => scoreCandidate(b) - scoreCandidate(a));
        }

        if (!this.canUseTraditionalMovieSearch()) {
            console.warn(`⚠️ [Arconte] Nexus filmes em cooldown. ${movie.title} seguirá em modo addon-first nesta rodada.`);
            return results.sort((a: any, b: any) => scoreCandidate(b) - scoreCandidate(a));
        }

        for (const query of queries) {
            try {
                const nexusResponse = await axios.post(NEXUS_MOVIES_URL, {
                    query,
                    category: 'Movies',
                    limit: 8,
                }) as SimpleAxiosData<any>;

                for (const item of nexusResponse.data.results || []) {
                    if (!item?.magnetLink || seenMagnets.has(item.magnetLink)) {
                        continue;
                    }

                    seenMagnets.add(item.magnetLink);
                    results.push(item);
                }
            } catch (error: any) {
                const explained = this.explainSearchProviderError(error, NEXUS_MOVIES_URL);
                console.warn(`⚠️ [Arconte] Busca de filme falhou para "${query}": ${explained.summary}`);
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

    private prioritizeFreshMovieCandidates(movies: TrendingMovie[], snapshot: CatalogSnapshot): TrendingMovie[] {
        return movies.filter((m) => {
            const tmdbIdMatch = m.tmdbId && snapshot.movieIds.has(String(m.tmdbId));
            const titleMatch = snapshot.movieTitles.has(this.normalizeTitle(m.title));
            return !tmdbIdMatch && !titleMatch;
        });
    }

    private prioritizeFreshSeriesCandidates(series: CuratedSeries[], snapshot: CatalogSnapshot): CuratedSeries[] {
        return series.filter((s) => {
            const tmdbIdMatch = s.id && snapshot.seriesIds.has(String(s.id));
            const titleMatch = snapshot.seriesTitles.has(this.normalizeTitle(s.title));
            return !tmdbIdMatch && !titleMatch;
        });
    }

    private async getFreshMovieFallbackCandidates(snapshot: CatalogSnapshot): Promise<TrendingMovie[]> {
        const topRated = await TMDBService.getTopRatedMovies();
        return this.prioritizeFreshMovieCandidates(topRated.map(m => ({
            tmdbId: m.id,
            title: m.title,
            originalTitle: m.original_title,
            year: m.release_date?.split('-')[0],
            summary: m.overview,
            large_cover_image: m.poster_path,
            medium_cover_image: m.poster_path,
            backdrop_path: m.backdrop_path,
            genres: [],
        })), snapshot).slice(0, 5);
    }

    private async getFreshSeriesFallbackCandidates(snapshot: CatalogSnapshot): Promise<any[]> {
        const popular = await TMDBService.getPopularSeries();
        return this.prioritizeFreshSeriesCandidates(popular, snapshot).slice(0, 5);
    }

    private async getRecommendedMoviesFromCatalog(): Promise<any[]> {
        try {
            const res = await axios.get(`${BACKEND_URL}/videos`).catch(() => ({ data: [] })) as SimpleAxiosData<any[]>;
            const catalog: any[] = res.data || [];
            if (catalog.length < 3) return [];

            const randomIdx = Math.floor(Math.random() * catalog.length);
            const ref = catalog[randomIdx];
            if (!ref.tmdbId) return [];

            return await TMDBService.getRecommendations(ref.tmdbId, 'movie');
        } catch { return []; }
    }

    private async getRecommendedSeriesFromCatalog(): Promise<any[]> {
        try {
            const res = await axios.get(`${BACKEND_URL}/series`).catch(() => ({ data: [] })) as SimpleAxiosData<any[]>;
            const catalog: any[] = res.data || [];
            if (catalog.length < 2) return [];

            const randomIdx = Math.floor(Math.random() * catalog.length);
            const ref = catalog[randomIdx];
            if (!ref.tmdbId) return [];

            return await TMDBService.getRecommendations(ref.tmdbId, 'tv');
        } catch { return []; }
    }

    private dedupeMovies(movies: TrendingMovie[]): TrendingMovie[] {
        const seen = new Set<string>();
        return movies.filter(m => {
            const key = m.tmdbId ? String(m.tmdbId) : this.normalizeTitle(m.title);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    private dedupeSeries(series: any[]): any[] {
        const seen = new Set<string>();
        return series.filter(s => {
            const key = s.id ? String(s.id) : this.normalizeTitle(s.name || s.title);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    private async getCatalogSnapshot(): Promise<CatalogSnapshot> {
        const [videosRes, seriesRes] = await Promise.all([
            axios.get(`${BACKEND_URL}/videos`).catch(() => ({ data: [] })),
            axios.get(`${BACKEND_URL}/series`).catch(() => ({ data: [] })),
        ]);

        const videos = videosRes.data || [];
        const series = seriesRes.data || [];

        return {
            movieIds: new Set(videos.map((v: any) => String(v.tmdbId)).filter(id => id !== 'undefined')),
            movieTitles: new Set(videos.map((v: any) => this.normalizeTitle(v.title))),
            seriesIds: new Set(series.map((s: any) => String(s.tmdbId)).filter(id => id !== 'undefined')),
            seriesTitles: new Set(series.map((s: any) => this.normalizeTitle(s.title))),
            videos,
            series,
        };
    }

    private async getAddonMovieCandidates(movie: TrendingMovie) {
        if (!movie.tmdbId) return [];
        try {
            const streams = await AddonService.getStreamsFromAllAddons('movie', String(movie.tmdbId), {
                title: movie.title,
                preferPortugueseAudio: true,
                acceptPortugueseSubtitles: true,
            });

            return (streams || []).map((s: any) => ({
                title: s.title || s.name || s.description || movie.title,
                magnetLink: s.url || s.infoHash ? `magnet:?xt=urn:btih:${s.infoHash}` : null,
                seeds: 50, // Addons raramente expõem seeds, assumimos viável
                sourceSite: s.addonName || 'Addon Radar',
                provider: s.addonName || 'Addon Radar',
                sourceKind: 'addon',
                poster: movie.large_cover_image || movie.medium_cover_image,
                originalTitle: movie.title,
            })).filter(s => s.magnetLink);
        } catch {
            return [];
        }
    }

    private normalizeTitle(t: string): string {
        return t.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[^\w\s]/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    private buildMovieAliases(title: string, original?: string): string[] {
        const names = new Set<string>();
        names.add(title);
        if (original) names.add(original);
        return Array.from(names);
    }

    private async loadHeuristicCache(kind: 'movie' | 'series', queries: string[], providers: string[]) {
        try {
            const heuristicOutcomeStore = (prisma as any).heuristicOutcome;
            if (!heuristicOutcomeStore) {
                return;
            }

            const existing = await heuristicOutcomeStore.findMany({
                where: {
                    kind,
                },
                take: 100,
                orderBy: { updatedAt: 'desc' }
            });

            existing.forEach((outcome: any) => {
                const key = outcome.sourceKind;
                const current = this.heuristicCache.get(key) || { wins: 0, ptBrWins: 0, totalAvailability: 0 };
                current.wins += outcome.availability > 20 ? 1 : 0;
                current.ptBrWins += outcome.isPortuguese ? 1 : 0;
                current.totalAvailability += outcome.availability;
                current.lastSource = outcome.sourceKind;
                this.heuristicCache.set(key, current);
            });
        } catch (e) {
            console.warn('⚠️ [Heuristic] Falha ao carregar cache do banco:', e);
        }
    }

    private getLearnedAddonBoost(kind: 'movie' | 'series', addonName?: string): number {
        if (!addonName) return 0;
        const score = this.heuristicCache.get(addonName);
        if (!score) return 0;

        let boost = 0;
        if (score.ptBrWins > 5) boost += 15;
        if (score.wins > 10) boost += 5;
        boost += Math.floor(score.totalAvailability / 500);

        return Math.min(boost, 30);
    }

    private rankQueriesByLearnedHeuristics(kind: 'movie' | 'series', queries: string[]): string[] {
        return queries.sort((a, b) => {
            const aPt = /\bdublado\b|\bpt br\b|\bptbr\b|\bportugues\b/.test(this.normalizeTitle(a)) ? 10 : 0;
            const bPt = /\bdublado\b|\bpt br\b|\bptbr\b|\bportugues\b/.test(this.normalizeTitle(b)) ? 10 : 0;
            return bPt - aPt;
        });
    }

    private async recordHeuristicOutcome(kind: 'movie' | 'series', data: {
        title: string,
        query?: string,
        addonName?: string,
        availability: number,
        isPortuguese: boolean,
        sourceKind: string
    }) {
        try {
            const heuristicOutcomeStore = (prisma as any).heuristicOutcome;
            if (!heuristicOutcomeStore) {
                return;
            }

            await heuristicOutcomeStore.upsert({
                where: {
                    kind_title_sourceKind: {
                        kind,
                        title: data.title,
                        sourceKind: data.sourceKind
                    }
                },
                update: {
                    query: data.query,
                    availability: data.availability,
                    isPortuguese: data.isPortuguese,
                    updatedAt: new Date()
                },
                create: {
                    kind,
                    title: data.title,
                    query: data.query || 'N/A',
                    addonName: data.addonName || 'Unknown',
                    availability: data.availability,
                    isPortuguese: data.isPortuguese,
                    sourceKind: data.sourceKind
                }
            });
        } catch (e) {
            console.warn('⚠️ [Heuristic] Falha ao persistir aprendizado:', e);
        }
    }

    private canUseTraditionalMovieSearch(): boolean {
        return Date.now() > this.nexusMovieSearchCooldownUntil;
    }

    private activateTraditionalMovieSearchCooldown() {
        this.nexusMovieSearchCooldownUntil = Date.now() + (15 * 60 * 1000);
    }

    private shouldTriggerMovieSearchCooldown(error: any): boolean {
        const status = error.response?.status;
        return status === 429 || status === 503 || status === 502;
    }

    private explainSearchProviderError(error: any, url: string) {
        return {
            summary: error.message || 'Erro de conexão',
            endpoint: url,
            status: error.response?.status || 'NETWORK_ERROR',
            message: error.response?.data?.message || 'Nenhum detalhe fornecido pelo backend',
            detail: error.response?.data?.error || null,
            nested: error.response?.data?.details || null,
            providers: error.response?.data?.providers_status || null,
        };
    }

    private explainError(error: any) {
        if (!error) return 'Erro desconhecido';
        if (error.response) {
            return {
                message: error.message || 'Falha HTTP',
                status: error.response.status || null,
                data: error.response.data || null,
            };
        }

        return error.message || String(error);
    }

    private sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export const arconteAutoCurator = new ArconteAutoCurator();
