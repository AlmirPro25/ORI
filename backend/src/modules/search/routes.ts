/**
 * 🌌 MODULE: Search Routes (ORION V4)
 * 
 * O módulo mais crítico do sistema.
 * 
 * Arquitetura de 4 Camadas:
 * - Camada 1: TMDB como Tradutor (PT-BR → EN/Original)
 * - Camada 2: PT-BR Scoring (boost para conteúdo com áudio/subs PT-BR)
 * - Camada 3: Tradução Reversa (títulos PT-BR na UI)
 * - Camada 4: Cache Semântico Persistente (SQLite, TTL 30d)
 */
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { YouTubeService } from '../../youtube-service';
import { TMDBService } from '../../tmdb-service';
import { SemanticCacheService } from '../../services/semantic-cache-service';
import { arconteAdmin } from '../../nexus-bridge';

const router = Router();
const prisma = new PrismaClient();
const axiosLib = require('axios');

// 🌌 ORION GLOBAL SEARCH ORCHESTRATOR V4 — TMDB AS TRANSLATOR + SEMANTIC INTELLIGENCE
router.get('/', async (req, res) => {
    // Timeout de 45 segundos para toda a busca
    const searchTimeout = setTimeout(() => {
        if (!res.headersSent) {
            console.warn('⏱️ [ORION] Timeout de busca atingido (45s)');
            res.status(504).json({
                error: 'Busca demorou muito tempo',
                local: [],
                youtube: [],
                tmdb: [],
                nexus: [],
                series: [],
                iptv: [],
                enrichment: null
            });
        }
    }, 45000);

    try {
        const query = (req.query.q as string || '').trim();
        if (!query) {
            clearTimeout(searchTimeout);
            return res.status(400).json({ error: "Termo de busca mandatório." });
        }

        console.log(`🔍 [ORION SEARCH V4] 🧠 Inteligência Semântica ativada para: "${query}"`);

        const NEXUS_URL = process.env.NEXUS_URL || 'http://localhost:3005';

        // ============================================
        // FASE 0: TMDB COMO TRADUTOR (REGRA DE OURO) + CACHE SEMÂNTICO (UPGRADE 1)
        // ============================================
        let tmdbEnrichment: any = null;
        let nexusSearchTerms: string[] = [query];

        try {
            // 🧠 1. Tentar Cache primeiro
            const cached = await SemanticCacheService.get(query);
            if (cached) {
                console.log(`🧠 [ORION V4] Cache Hit Semântico Global: "${query}"`);
                tmdbEnrichment = cached;
            } else {
                const tmdbRes = await axiosLib.get(`https://api.themoviedb.org/3/search/multi`, {
                    params: {
                        api_key: process.env.TMDB_API_KEY || 'e6f987515d023363364df2298c564343',
                        query: query,
                        include_adult: true,
                        language: 'pt-BR'
                    },
                    timeout: 5000
                });

                const bestMatch = tmdbRes.data.results?.find((i: any) =>
                    i.media_type === 'movie' || i.media_type === 'tv'
                );

                if (bestMatch) {
                    const isTV = bestMatch.media_type === 'tv';
                    const titlePt = isTV ? (bestMatch.name || bestMatch.title) : bestMatch.title;
                    const originalTitle = isTV
                        ? (bestMatch.original_name || bestMatch.original_title)
                        : (bestMatch.original_title || bestMatch.title);
                    const releaseYear = (bestMatch.release_date || bestMatch.first_air_date || '').split('-')[0];

                    let titleEn = originalTitle;
                    try {
                        const typeForApi = isTV ? 'tv' : 'movie';
                        const detailRes = await axiosLib.get(`https://api.themoviedb.org/3/${typeForApi}/${bestMatch.id}`, {
                            params: { api_key: process.env.TMDB_API_KEY || 'e6f987515d023363364df2298c564343', language: 'en-US' },
                            timeout: 5000
                        });
                        titleEn = isTV
                            ? (detailRes.data.name || detailRes.data.original_name || originalTitle)
                            : (detailRes.data.title || detailRes.data.original_title || originalTitle);
                    } catch { /* usa original */ }

                    tmdbEnrichment = {
                        titlePt,
                        titleEn,
                        originalTitle,
                        year: releaseYear,
                        mediaType: bestMatch.media_type as 'movie' | 'tv',
                        tmdbId: bestMatch.id,
                        posterPath: bestMatch.poster_path
                            ? `https://image.tmdb.org/t/p/w500${bestMatch.poster_path}`
                            : null,
                        backdropPath: bestMatch.backdrop_path
                            ? `https://image.tmdb.org/t/p/w1280${bestMatch.backdrop_path}`
                            : null,
                        overview: bestMatch.overview,
                        voteAverage: bestMatch.vote_average
                    };

                    // 💾 2. Salvar no Cache
                    await SemanticCacheService.set(query, tmdbEnrichment);
                }
            }

            if (tmdbEnrichment) {
                const { titleEn, titlePt, originalTitle, year: releaseYear } = tmdbEnrichment;

                console.log(`🎬 [ORION V4] Tradução Aplicada: "${query}" -> "${titleEn}"`);

                nexusSearchTerms = [];
                if (titleEn && releaseYear) nexusSearchTerms.push(`${titleEn} ${releaseYear}`);
                if (titleEn) nexusSearchTerms.push(titleEn);
                if (originalTitle && originalTitle !== titleEn && originalTitle !== titlePt) {
                    nexusSearchTerms.push(originalTitle);
                }
                if (!nexusSearchTerms.some(t => t.toLowerCase() === query.toLowerCase())) {
                    nexusSearchTerms.push(query);
                }

                nexusSearchTerms = [...new Set(nexusSearchTerms.map(t => t.trim()).filter(Boolean))];
            }
        } catch (e) {
            console.warn('⚠️ [ORION V4] TMDB translation failed, using literal query');
        }

        console.log(`🚀 [ORION V4] Termos para Nexus: ${nexusSearchTerms.join(' | ')}`);

        // ============================================
        // FASE 1: Busca paralela em todas as fontes
        // ============================================

        // 1. Busca Local (aceita PT-BR)
        const localPromise = prisma.video.findMany({
            where: {
                OR: [
                    { title: { contains: query } },
                    { tags: { contains: query } },
                    { description: { contains: query } }
                ]
            },
            take: 15
        }).catch(() => []);

        // 2. YouTube (aceita PT-BR)
        const youtubePromise = YouTubeService.searchVideos(query).catch(() => []);

        // 3. TMDB (aceita PT-BR)
        const tmdbPromise = TMDBService.search(query).catch(() => []);

        // 4. Nexus: buscar com TODOS os termos traduzidos (paralelo)
        const nexusPromise = (async () => {
            const allNexusResults: any[] = [];

            const nexusSearches = nexusSearchTerms.slice(0, 3).map(async (term) => {
                try {
                    const response = await axiosLib.post(`${NEXUS_URL}/api/search/ptbr`, {
                        query: term,
                        limit: 10
                    }, { timeout: 20000 });
                    return response.data.results || [];
                } catch (e) {
                    try {
                        const fallback = await axiosLib.post(`${NEXUS_URL}/api/search`, {
                            query: term,
                            prioritizePTBR: true
                        }, { timeout: 15000 });
                        return fallback.data.results || [];
                    } catch { return []; }
                }
            });

            const results = await Promise.all(nexusSearches);
            results.forEach(r => allNexusResults.push(...r));
            return allNexusResults;
        })();

        // Executar tudo em paralelo
        const [localResults, youtubeResults, tmdbResults, nexusResults] =
            await Promise.all([localPromise, youtubePromise, tmdbPromise, nexusPromise]);

        // ============================================
        // FASE 2: Detecção de Séries (TMDB Intelligence)
        // ============================================
        let seriesResults: any[] = [];
        let seriesMetadata: any = null;

        const detectedSeries = tmdbResults.filter((t: any) => t.media_type === 'tv');

        if (detectedSeries.length > 0) {
            console.log(`📺 [ORION V4] Série detectada: "${detectedSeries[0].title}" (TMDB ID: ${detectedSeries[0].id})`);

            const seriesId = detectedSeries[0].id;
            const seriesDetails = await TMDBService.getDetails(seriesId, 'tv').catch(() => null);

            if (seriesDetails) {
                seriesMetadata = {
                    id: seriesDetails.id,
                    name: seriesDetails.name,
                    original_name: seriesDetails.original_name,
                    overview: seriesDetails.overview,
                    poster: seriesDetails.poster_path ? `https://image.tmdb.org/t/p/w500${seriesDetails.poster_path}` : null,
                    backdrop: seriesDetails.backdrop_path ? `https://image.tmdb.org/t/p/w1280${seriesDetails.backdrop_path}` : null,
                    number_of_seasons: seriesDetails.number_of_seasons,
                    number_of_episodes: seriesDetails.number_of_episodes,
                    status: seriesDetails.status,
                    first_air_date: seriesDetails.first_air_date,
                    vote_average: seriesDetails.vote_average,
                    genres: seriesDetails.genres?.map((g: any) => g.name) || [],
                    seasons: seriesDetails.seasons?.map((s: any) => ({
                        season_number: s.season_number,
                        name: s.name,
                        episode_count: s.episode_count,
                        air_date: s.air_date,
                        poster: s.poster_path ? `https://image.tmdb.org/t/p/w300${s.poster_path}` : null
                    })).filter((s: any) => s.season_number > 0) || []
                };
            }

            // Buscar torrents de série no Nexus usando TÍTULO EN/ORIGINAL (não PT-BR!)
            try {
                const seriesSearchName = tmdbEnrichment?.titleEn || detectedSeries[0].original_title || detectedSeries[0].title || query;
                console.log(`📺 [ORION V4] Buscando torrents de série com: "${seriesSearchName}"`);
                const nexusSeries = await axiosLib.post(`${NEXUS_URL}/api/search/series`, {
                    query: seriesSearchName,
                    limit: 15
                }, { timeout: 30000 });
                seriesResults = nexusSeries.data.results || [];
                console.log(`📺 [ORION V4] Nexus séries: ${seriesResults.length} resultados`);
            } catch (e) {
                console.warn('[ORION V4] Nexus series endpoint falhou.');
            }
        }

        // ============================================
        // FASE 3: Consolidação, De-duplicação e PT-BR Scoring
        // ============================================
        const localMap = new Map();
        const youtubeMap = new Map();
        const tmdbMap = new Map();
        const nexusMap = new Map();

        localResults.forEach((v: any) => localMap.set(v.id, v));
        youtubeResults.forEach((v: any) => youtubeMap.set(v.id || v.youtubeId, v));
        tmdbResults.forEach((v: any) => tmdbMap.set(v.id, v));

        // Nexus com PT-BR scoring
        nexusResults.forEach((v: any) => {
            const match = v.magnetLink?.match(/btih:([a-zA-Z0-9]+)/i);
            const id = match ? match[1].toLowerCase() : v.magnetLink || `nexus_${Date.now()}_${Math.random()}`;
            if (!nexusMap.has(id)) {
                const titleLower = (v.title || '').toLowerCase();
                const hasPTBRAudio = v.hasPTBRAudio || /\b(dublado|dual[._-]?audio|pt[._-]?br|portuguese|brazil)\b/i.test(titleLower);
                const hasPTBRSubs = v.hasPTBRSubs || /\b(legendado|leg[._-]?pt|sub[._-]?pt|portuguese[._-]?sub)\b/i.test(titleLower);

                let ptbrScore = v.ptbrScore || 0;
                if (hasPTBRAudio) ptbrScore += 150;
                if (hasPTBRSubs) ptbrScore += 80;

                nexusMap.set(id, {
                    id: `nexus_${id}`,
                    title: v.title,
                    displayTitle: tmdbEnrichment?.titlePt || v.title,
                    originalTitle: tmdbEnrichment?.originalTitle || v.title,
                    thumbnailPath: v.poster || tmdbEnrichment?.posterPath || null,
                    category: v.type === 'SEASON_PACK' || v.type === 'COMPLETE_PACK' ? 'SERIES' : 'MOVIE',
                    quality: v.detectedQuality || v.quality || '1080p',
                    seeds: v.seeds || 0,
                    size: v.size,
                    magnetLink: v.magnetLink,
                    hasPTBRAudio,
                    hasPTBRSubs,
                    ptbrScore,
                    totalScore: ptbrScore + Math.min((v.seeds || 0) * 2, 200),
                    sourceSite: v.sourceSite || v.provider || 'Nexus',
                    isSeasonPack: v.isSeasonPack || false,
                    isCompletePack: v.isCompletePack || false,
                    detectedSeason: v.detectedSeason || null,
                    detectedEpisode: v.detectedEpisode || null,
                    type: v.type || 'UNKNOWN',
                    source: 'NEXUS'
                });
            }
        });

        // Enriquecer resultados de série do Nexus
        const seriesMap = new Map();
        seriesResults.forEach((v: any) => {
            const match = v.magnetLink?.match(/btih:([a-zA-Z0-9]+)/i);
            const id = match ? match[1].toLowerCase() : `series_${Date.now()}_${Math.random()}`;
            if (!seriesMap.has(id) && !nexusMap.has(id)) {
                const titleLower = (v.title || '').toLowerCase();
                const hasPTBRAudio = v.hasPTBRAudio || /\b(dublado|dual[._-]?audio|pt[._-]?br|portuguese|brazil)\b/i.test(titleLower);
                const hasPTBRSubs = v.hasPTBRSubs || /\b(legendado|leg[._-]?pt|sub[._-]?pt|portuguese[._-]?sub)\b/i.test(titleLower);

                let ptbrScore = v.ptbrScore || 0;
                if (hasPTBRAudio) ptbrScore += 150;
                if (hasPTBRSubs) ptbrScore += 80;

                seriesMap.set(id, {
                    id: `series_${id}`,
                    title: v.title,
                    displayTitle: tmdbEnrichment?.titlePt || v.title,
                    originalTitle: tmdbEnrichment?.originalTitle || v.title,
                    thumbnailPath: v.poster || tmdbEnrichment?.posterPath || null,
                    quality: v.detectedQuality || v.quality || 'HD',
                    seeds: v.seeds || 0,
                    size: v.size,
                    magnetLink: v.magnetLink,
                    hasPTBRAudio,
                    hasPTBRSubs,
                    ptbrScore,
                    sourceSite: v.sourceSite || v.provider || 'Nexus',
                    isSeasonPack: v.isSeasonPack || false,
                    isCompletePack: v.isCompletePack || false,
                    detectedSeason: v.detectedSeason || null,
                    detectedEpisode: v.detectedEpisode || null,
                    type: v.type || 'UNKNOWN',
                    source: 'NEXUS_SERIES'
                });
            }
        });

        // Ordenar Nexus e Series por PT-BR score + seeds
        const sortByScore = (arr: any[]) => arr.sort((a, b) => {
            const ptDiff = (b.ptbrScore || 0) - (a.ptbrScore || 0);
            if (ptDiff !== 0) return ptDiff;
            return (b.seeds || 0) - (a.seeds || 0);
        });

        const finalResults = {
            local: Array.from(localMap.values()),
            youtube: Array.from(youtubeMap.values()),
            tmdb: Array.from(tmdbMap.values()),
            nexus: sortByScore(Array.from(nexusMap.values())),
            series: sortByScore(Array.from(seriesMap.values())),
            seriesMetadata,
            iptv: [],
            searchTermsUsed: nexusSearchTerms,
            ptbrMode: true,
            enrichment: tmdbEnrichment
        };

        // Se não houver resultados, despacha Arconte em background
        if (finalResults.nexus.length === 0 && finalResults.series.length === 0 && finalResults.local.length === 0) {
            const arconteTerm = tmdbEnrichment?.titleEn || query;
            console.log(`🕵️ [ORION V4] Sem resultados. Despachando Arconte para: "${arconteTerm}"`);
            arconteAdmin.processDemand(arconteTerm);
        }

        const totalTorrents = finalResults.nexus.length + finalResults.series.length;
        const ptbrCount = [...finalResults.nexus, ...finalResults.series].filter((r: any) => r.hasPTBRAudio || r.hasPTBRSubs).length;

        console.log(`✨ [ORION V4] Resultados: Local=${finalResults.local.length} | TMDB=${finalResults.tmdb.length} | YouTube=${finalResults.youtube.length} | Torrents=${totalTorrents} (🇧🇷 ${ptbrCount} PT-BR) | Series=${finalResults.series.length}`);
        if (tmdbEnrichment) {
            console.log(`🎯 [ORION V4] Tradução: "${query}" → "${tmdbEnrichment.titleEn}" (${tmdbEnrichment.year})`);
        }

        clearTimeout(searchTimeout);
        res.json(finalResults);

    } catch (error: any) {
        clearTimeout(searchTimeout);
        console.error('❌ Erro na busca global inteligente:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message, local: [], youtube: [], tmdb: [], nexus: [], series: [], iptv: [], enrichment: null });
        }
    }
});

export default router;
