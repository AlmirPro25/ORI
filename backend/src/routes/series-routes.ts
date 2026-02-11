/**
 * 📺 SERIES ROUTES
 * 
 * REST API completa para gerenciamento de séries.
 * Inclui CRUD de séries, temporadas e episódios.
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { episodeParser } from '../services/episode-parser';
import { DownloadScheduler } from '../services/download-scheduler';
import { TorrentExplorer } from '../services/torrent-explorer';

const prisma = new PrismaClient();
const router = Router();

// ==========================================
// 📺 SÉRIES
// ==========================================

/**
 * GET /api/v1/series
 * Lista todas as séries
 */
router.get('/', async (_req: Request, res: Response) => {
    try {
        const series = await (prisma as any).series.findMany({
            include: {
                _count: {
                    select: { episodes: true, seasons: true },
                },
                episodes: {
                    select: { status: true },
                },
            },
            orderBy: { updatedAt: 'desc' },
        });

        // Enriquecer com contadores de status
        const enriched = series.map((s: any) => {
            const readyCount = s.episodes.filter((e: any) => e.status === 'READY').length;
            const totalCount = s.episodes.length;
            const { episodes, ...rest } = s;
            return {
                ...rest,
                readyEpisodes: readyCount,
                totalEpisodes: totalCount,
                progress: totalCount > 0 ? Math.round((readyCount / totalCount) * 100) : 0,
            };
        });

        res.json(enriched);
    } catch (error: any) {
        console.error('❌ [Series] Error listing:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/v1/series/:id
 * Detalhes de uma série com temporadas e episódios
 */
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const series = await (prisma as any).series.findUnique({
            where: { id },
            include: {
                seasons: {
                    include: {
                        episodes: {
                            orderBy: { episodeNumber: 'asc' },
                            include: { video: true },
                        },
                    },
                    orderBy: { seasonNumber: 'asc' },
                },
            },
        });

        if (!series) return res.status(404).json({ error: 'Series not found' });
        res.json(series);
    } catch (error: any) {
        console.error('❌ [Series] Error getting:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/v1/series
 * Cria uma nova série
 */
router.post('/', async (req: Request, res: Response) => {
    try {
        const { title, overview, poster, backdrop, tmdbId, imdbId, status, genres, totalSeasons, totalEpisodes, firstAirDate, lastAirDate } = req.body;

        if (!title) return res.status(400).json({ error: 'Title is required' });

        // Verificar se já existe por tmdbId
        if (tmdbId) {
            const existing = await (prisma as any).series.findUnique({ where: { tmdbId } });
            if (existing) return res.json(existing);
        }

        const series = await (prisma as any).series.create({
            data: {
                title,
                overview,
                poster,
                backdrop,
                tmdbId,
                imdbId,
                status: status || 'ONGOING',
                genres: typeof genres === 'string' ? genres : JSON.stringify(genres || []),
                totalSeasons: totalSeasons || 0,
                totalEpisodes: totalEpisodes || 0,
                firstAirDate: firstAirDate ? new Date(firstAirDate) : null,
                lastAirDate: lastAirDate ? new Date(lastAirDate) : null,
            },
        });

        res.status(201).json(series);
    } catch (error: any) {
        console.error('❌ [Series] Error creating:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/v1/series/:id
 * Atualiza uma série
 */
router.put('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const data = req.body;

        if (data.genres && Array.isArray(data.genres)) {
            data.genres = JSON.stringify(data.genres);
        }
        if (data.firstAirDate) data.firstAirDate = new Date(data.firstAirDate);
        if (data.lastAirDate) data.lastAirDate = new Date(data.lastAirDate);

        const series = await (prisma as any).series.update({
            where: { id },
            data,
        });

        res.json(series);
    } catch (error: any) {
        console.error('❌ [Series] Error updating:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/v1/series/:id
 * Deleta uma série e todas as entidades relacionadas
 */
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await (prisma as any).series.delete({ where: { id } });
        res.json({ message: 'Series deleted' });
    } catch (error: any) {
        console.error('❌ [Series] Error deleting:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 📅 TEMPORADAS
// ==========================================

/**
 * GET /api/v1/series/:id/seasons
 * Lista temporadas de uma série
 */
router.get('/:id/seasons', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const seasons = await (prisma as any).season.findMany({
            where: { seriesId: id },
            include: {
                _count: { select: { episodes: true } },
            },
            orderBy: { seasonNumber: 'asc' },
        });
        res.json(seasons);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/v1/series/:id/seasons
 * Cria uma temporada
 */
router.post('/:id/seasons', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { seasonNumber, name, overview, poster, episodeCount, airDate } = req.body;

        const season = await (prisma as any).season.upsert({
            where: {
                seriesId_seasonNumber: { seriesId: id, seasonNumber },
            },
            update: { name, overview, poster, episodeCount, airDate: airDate ? new Date(airDate) : null },
            create: {
                seriesId: id,
                seasonNumber,
                name: name || `Temporada ${seasonNumber}`,
                overview,
                poster,
                episodeCount: episodeCount || 0,
                airDate: airDate ? new Date(airDate) : null,
            },
        });

        res.json(season);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 🎬 EPISÓDIOS
// ==========================================

/**
 * GET /api/v1/series/:id/episodes
 * Lista todos os episódios de uma série
 */
router.get('/:id/episodes', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const episodes = await (prisma as any).episode.findMany({
            where: { seriesId: id },
            include: { video: true },
            orderBy: [{ seasonNumber: 'asc' }, { episodeNumber: 'asc' }],
        });
        res.json(episodes);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/v1/series/:id/seasons/:seasonNumber/episodes
 * Lista episódios de uma temporada específica
 */
router.get('/:id/seasons/:seasonNumber/episodes', async (req: Request, res: Response) => {
    try {
        const { id, seasonNumber } = req.params;
        const episodes = await (prisma as any).episode.findMany({
            where: {
                seriesId: id,
                seasonNumber: parseInt(seasonNumber, 10),
            },
            include: { video: true },
            orderBy: { episodeNumber: 'asc' },
        });
        res.json(episodes);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/v1/series/:id/episodes
 * Cria ou atualiza um episódio
 */
router.post('/:id/episodes', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { seasonNumber, episodeNumber, title, overview, duration, airDate, stillPath, magnetLink, quality, fileSize } = req.body;

        if (!seasonNumber || !episodeNumber || !title) {
            return res.status(400).json({ error: 'seasonNumber, episodeNumber and title are required' });
        }

        // Upsert da temporada
        const season = await (prisma as any).season.upsert({
            where: {
                seriesId_seasonNumber: { seriesId: id, seasonNumber },
            },
            update: {},
            create: {
                seriesId: id,
                seasonNumber,
                name: `Temporada ${seasonNumber}`,
            },
        });

        // Upsert do episódio
        const episode = await (prisma as any).episode.upsert({
            where: {
                seriesId_seasonNumber_episodeNumber: { seriesId: id, seasonNumber, episodeNumber },
            },
            update: {
                title,
                overview,
                duration,
                airDate: airDate ? new Date(airDate) : undefined,
                stillPath,
                magnetLink,
                quality,
                fileSize,
            },
            create: {
                seriesId: id,
                seasonId: season.id,
                seasonNumber,
                episodeNumber,
                title,
                overview,
                duration,
                airDate: airDate ? new Date(airDate) : null,
                stillPath,
                magnetLink,
                quality,
                fileSize,
            },
        });

        res.json(episode);
    } catch (error: any) {
        console.error('❌ [Episode] Error creating:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 📥 DOWNLOAD ACTIONS
// ==========================================

/**
 * POST /api/v1/series/:id/download
 * Baixar série completa
 */
router.post('/:id/download', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { userId } = req.body;
        const count = await DownloadScheduler.queueSeries(id); // userId not supported in queueSeries recursive loop yet, but could be added
        res.json({ message: `${count} episodes queued for download`, count });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/v1/series/:id/seasons/:seasonNumber/download
 * Baixar temporada
 */
router.post('/:id/seasons/:seasonNumber/download', async (req: Request, res: Response) => {
    try {
        const { id, seasonNumber } = req.params;
        const { userId } = req.body;
        const count = await DownloadScheduler.queueSeason(id, parseInt(seasonNumber, 10)); // userId could be added to loop
        res.json({ message: `${count} episodes queued for download`, count });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 🎬 EPISODE INDIVIDUAL ACTIONS
// ==========================================

/**
 * GET /api/v1/episodes/:id
 * Detalhes de um episódio
 */
router.get('/episodes/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const episode = await (prisma as any).episode.findUnique({
            where: { id },
            include: {
                video: true,
                series: true,
                season: true,
            },
        });
        if (!episode) return res.status(404).json({ error: 'Episode not found' });
        res.json(episode);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/v1/episodes/:id/download
 * Baixar episódio específico
 */
router.post('/episodes/:id/download', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { userId } = req.body;
        await DownloadScheduler.queueEpisode(id, 50, userId);
        res.json({ message: 'Episode queued for download' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/v1/episodes/:id/next
 * Próximo episódio (para Auto Next)
 */
router.get('/episodes/:id/next', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const episode = await (prisma as any).episode.findUnique({ where: { id } });

        if (!episode) return res.status(404).json({ error: 'Episode not found' });

        // Próximo na mesma temporada
        let next = await (prisma as any).episode.findFirst({
            where: {
                seriesId: episode.seriesId,
                seasonNumber: episode.seasonNumber,
                episodeNumber: { gt: episode.episodeNumber },
            },
            orderBy: { episodeNumber: 'asc' },
            include: { video: true, series: true },
        });

        // Se não achou, primeiro da próxima temporada
        if (!next) {
            next = await (prisma as any).episode.findFirst({
                where: {
                    seriesId: episode.seriesId,
                    seasonNumber: { gt: episode.seasonNumber },
                },
                orderBy: [{ seasonNumber: 'asc' }, { episodeNumber: 'asc' }],
                include: { video: true, series: true },
            });
        }

        res.json(next || null);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/v1/episodes/:id/previous
 * Episódio anterior
 */
router.get('/episodes/:id/previous', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const episode = await (prisma as any).episode.findUnique({ where: { id } });

        if (!episode) return res.status(404).json({ error: 'Episode not found' });

        let prev = await (prisma as any).episode.findFirst({
            where: {
                seriesId: episode.seriesId,
                seasonNumber: episode.seasonNumber,
                episodeNumber: { lt: episode.episodeNumber },
            },
            orderBy: { episodeNumber: 'desc' },
            include: { video: true, series: true },
        });

        if (!prev) {
            prev = await (prisma as any).episode.findFirst({
                where: {
                    seriesId: episode.seriesId,
                    seasonNumber: { lt: episode.seasonNumber },
                },
                orderBy: [{ seasonNumber: 'desc' }, { episodeNumber: 'desc' }],
                include: { video: true, series: true },
            });
        }

        res.json(prev || null);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/v1/series/ingest
 * Ingestão inteligente: recebe um magnet link, identifica se é série/episódio,
 * e cria as entidades automaticamente
 */
router.post('/ingest', async (req: Request, res: Response) => {
    try {
        const { magnetLink, title, filename } = req.body;

        if (!title && !filename) {
            return res.status(400).json({ error: 'title or filename is required' });
        }

        const nameToAnalyze = filename || title;
        const parsed = episodeParser.parse(nameToAnalyze);

        if (!parsed) {
            return res.status(200).json({ isSeries: false, message: 'Not identified as series content' });
        }

        // Buscar ou criar série
        let series = await (prisma as any).series.findFirst({
            where: { title: { contains: parsed.seriesName } },
        });

        if (!series) {
            series = await (prisma as any).series.create({
                data: {
                    title: parsed.seriesName,
                    status: 'ONGOING',
                },
            });
            console.log(`📺 [Ingest] Nova série criada: ${series.title}`);
        }

        // Buscar ou criar temporada
        const season = await (prisma as any).season.upsert({
            where: {
                seriesId_seasonNumber: {
                    seriesId: series.id,
                    seasonNumber: parsed.seasonNumber,
                },
            },
            update: {},
            create: {
                seriesId: series.id,
                seasonNumber: parsed.seasonNumber,
                name: `Temporada ${parsed.seasonNumber}`,
            },
        });

        // Buscar ou criar episódio
        const episode = await (prisma as any).episode.upsert({
            where: {
                seriesId_seasonNumber_episodeNumber: {
                    seriesId: series.id,
                    seasonNumber: parsed.seasonNumber,
                    episodeNumber: parsed.episodeNumber,
                },
            },
            update: {
                magnetLink: magnetLink || undefined,
                quality: parsed.quality || undefined,
            },
            create: {
                seriesId: series.id,
                seasonId: season.id,
                seasonNumber: parsed.seasonNumber,
                episodeNumber: parsed.episodeNumber,
                title: `Episode ${parsed.episodeNumber}`,
                magnetLink,
                quality: parsed.quality,
            },
        });

        // Atualizar contadores
        const [seasonCount, episodeCount] = await Promise.all([
            (prisma as any).season.count({ where: { seriesId: series.id } }),
            (prisma as any).episode.count({ where: { seriesId: series.id } }),
        ]);

        await (prisma as any).series.update({
            where: { id: series.id },
            data: { totalSeasons: seasonCount, totalEpisodes: episodeCount },
        });

        console.log(`📺 [Ingest] ${series.title} S${parsed.seasonNumber}E${parsed.episodeNumber} registered`);

        res.json({
            isSeries: true,
            series,
            season,
            episode,
            parsed,
        });
    } catch (error: any) {
        console.error('❌ [Ingest] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/v1/series/torrent/explore?magnetLink=...
 * Explora um torrent e retorna os episódios sugeridos com análise profunda
 */
router.get('/torrent/explore', async (req: Request, res: Response) => {
    try {
        const { magnetLink } = req.query;
        if (!magnetLink) return res.status(400).json({ error: 'magnetLink is required' });

        console.log(`🔍 [Explore] Inspecionando torrent...`);
        const metadata = await TorrentExplorer.explore(magnetLink as string);

        // Gerar sugestões expandidas (tratando multi-episódios)
        const suggestedEpisodes: any[] = [];
        const filesToProcess = metadata.files.filter(f => f.isSeries && f.isVideo && !f.isSample);

        for (const file of filesToProcess) {
            // Se for multi-episódio (ex: S01E01-E02), expandir entradas
            if (file.isMultiEpisode && file.season !== undefined && file.episode !== undefined && file.episodeEnd !== undefined) {
                for (let i = file.episode; i <= file.episodeEnd; i++) {
                    suggestedEpisodes.push({
                        season: file.season,
                        episode: i, // Número individual
                        name: file.seriesName || metadata.detectedSeriesName || `Episode ${i}`,
                        path: file.path,
                        index: file.index,
                        quality: file.quality,
                        codec: file.codec,
                        size: file.length,
                        isMulti: true
                    });
                }
            } else if (file.season !== undefined && file.episode !== undefined) {
                // Episódio simples
                suggestedEpisodes.push({
                    season: file.season,
                    episode: file.episode,
                    name: file.seriesName || metadata.detectedSeriesName || `Episode ${file.episode}`,
                    path: file.path,
                    index: file.index,
                    quality: file.quality,
                    codec: file.codec,
                    size: file.length,
                    isSpecial: file.isSpecial
                });
            }
        }

        // Ordenar sugestões
        suggestedEpisodes.sort((a, b) => {
            if (a.season !== b.season) return a.season - b.season;
            return a.episode - b.episode;
        });

        res.json({
            name: metadata.name,
            infoHash: metadata.infoHash,
            totalFiles: metadata.totalFiles,
            totalSize: metadata.totalSize,
            suggestedEpisodes,
            warnings: metadata.warnings,
            detectedSeriesName: metadata.detectedSeriesName,
            isSeasonPack: metadata.isSeasonPack,
            qualityProfile: metadata.qualityProfile
        });
    } catch (error: any) {
        console.error('❌ [Explore] Error:', error);
        res.status(500).json({ error: error.message || 'Failed to explore torrent' });
    }
});

/**
 * POST /api/v1/series/bulk-ingest
 * Ingestão de múltiplos episódios de um mesmo torrent
 */
router.post('/bulk-ingest', async (req: Request, res: Response) => {
    try {
        const { magnetLink, seriesId, episodes } = req.body;

        if (!magnetLink || !seriesId || !Array.isArray(episodes)) {
            return res.status(400).json({ error: 'magnetLink, seriesId and episodes array are required' });
        }

        console.log(`📥 [BulkIngest] Processando ${episodes.length} episódios para série ${seriesId}`);
        const results = [];

        // Buscar série
        const series = await (prisma as any).series.findUnique({ where: { id: seriesId } });
        if (!series) return res.status(404).json({ error: 'Series not found' });

        for (const epData of episodes) {
            const { seasonNumber, episodeNumber, title, fileIndex, filePath, quality } = epData;

            // Validar dados mínimos
            if (seasonNumber === undefined || episodeNumber === undefined || fileIndex === undefined) {
                console.warn(`⚠️ [BulkIngest] Pulinando item inválido:`, epData);
                continue;
            }

            // 1. Assegurar temporada (pode ser 0 para specials)
            const season = await (prisma as any).season.upsert({
                where: { seriesId_seasonNumber: { seriesId, seasonNumber } },
                update: {},
                create: {
                    seriesId,
                    seasonNumber,
                    name: seasonNumber === 0 ? 'Specials' : `Temporada ${seasonNumber}`
                }
            });

            // 2. Criar/Atualizar episódio
            const episode = await (prisma as any).episode.upsert({
                where: { seriesId_seasonNumber_episodeNumber: { seriesId, seasonNumber, episodeNumber } },
                update: {
                    magnetLink,
                    torrentFileIndex: fileIndex,
                    torrentFileRelativePath: filePath,
                    quality: quality || undefined,
                    // Se o título vier genérico, não sobrescreve se já tiver um melhor
                    ...(title && !title.includes('Episode') ? { title } : {})
                },
                create: {
                    seriesId,
                    seasonId: season.id,
                    seasonNumber,
                    episodeNumber,
                    title: title || `Episódio ${episodeNumber}`,
                    magnetLink,
                    torrentFileIndex: fileIndex,
                    torrentFileRelativePath: filePath,
                    quality: quality || null,
                    status: 'NOT_DOWNLOADED'
                }
            });

            results.push(episode);
        }

        // Atualizar contadores da série
        const [seasonCount, episodeCount] = await Promise.all([
            (prisma as any).season.count({ where: { seriesId: series.id } }),
            (prisma as any).episode.count({ where: { seriesId: series.id } }),
        ]);

        await (prisma as any).series.update({
            where: { id: series.id },
            data: { totalSeasons: seasonCount, totalEpisodes: episodeCount },
        });

        console.log(`✅ [BulkIngest] Sucesso! ${results.length} processados.`);
        res.json({ message: `${results.length} episodes ingested successfully`, count: results.length });
    } catch (error: any) {
        console.error('❌ [BulkIngest] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/v1/series/scheduler/stats
 * Estatísticas do scheduler de downloads
 */
router.get('/scheduler/stats', async (_req: Request, res: Response) => {
    try {
        const stats = DownloadScheduler.getStats();
        res.json(stats);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
