/**
 * MODULE: Governance Routes
 *
 * Responsabilidades:
 * - Governor health, swarms, economy, profitability, recovery
 * - Telemetry (TTFF, sessions, UEV)
 * - Health check unificado
 * - Nexus Federation endpoints
 * - User badges
 */
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import axios from 'axios';
import { DownloadGovernor } from '../../services/download-governor';
import { AddonService } from '../../services/addon.service';
import { ConsumptionAnalytics } from '../../services/consumption-analytics';
import { MediaVerificationService } from '../../services/media-verification.service';
import { LanguageVerificationTelemetry } from '../../services/language-verification-telemetry';
import { NexusFederation } from '../../services/nexus-federation';
import { PlaybackTelemetry } from '../../services/playback-telemetry';
import { SearchRankingTelemetry } from '../../services/search-ranking-telemetry';
import { SourceIntelligence } from '../../services/source-intelligence';
import { VideoSelectionTelemetry } from '../../services/video-selection-telemetry';
import { getSystemStats, getPredictionAccuracy } from '../../torrent-downloader-v2';
import { structuredLogger } from '../../utils/structured-logger';

const router = Router();
const prisma = new PrismaClient();

router.get('/governor/health', async (_req, res) => {
    const health = await DownloadGovernor.getSystemHealth();
    res.json(health);
});

router.get('/governor/heatmap', async (_req, res) => {
    const heatmap = await ConsumptionAnalytics.getHeatmap();
    res.json(heatmap);
});

router.get('/governor/swarms', (_req, res) => {
    const swarms = DownloadGovernor.getActiveSwarms();
    res.json(swarms);
});

router.get('/governor/economy', async (_req, res) => {
    const economy = await ConsumptionAnalytics.getEconomicValues();
    res.json(economy);
});

router.get('/governor/profitability', async (_req, res) => {
    const scores = await ConsumptionAnalytics.getProfitabilityScores();
    res.json(scores);
});

router.get('/governor/users', async (_req, res) => {
    try {
        const users = await prisma.user.findMany({
            take: 10,
            orderBy: { reputationScore: 'desc' },
            select: {
                id: true,
                name: true,
                reputationScore: true,
                totalUploadBytes: true,
                totalWatchMinutes: true,
            },
        });
        res.json(users);
    } catch {
        res.status(500).json({ error: 'Failed' });
    }
});

router.get('/governor/balance', async (_req, res) => {
    const balance = await ConsumptionAnalytics.getEconomyBalance();
    res.json(balance);
});

router.get('/governor/recovery', (_req, res) => {
    const metrics = DownloadGovernor.getRecoveryMetrics();
    res.json(metrics);
});

router.get('/users/:userId/badges', async (req, res) => {
    const badges = await ConsumptionAnalytics.getUserBadges(req.params.userId);
    res.json(badges);
});

router.get('/telemetry/uev', async (_req, res) => {
    const uev = await ConsumptionAnalytics.getExperienceMetrics();
    res.json(uev);
});

router.get('/nexus/heartbeat', async (_req, res) => {
    const hb = await DownloadGovernor.getNexusHeartbeat();
    res.json(hb);
});

router.post('/nexus/heartbeat', async (req, res) => {
    await NexusFederation.processHeartbeat(req.body);
    res.sendStatus(200);
});

router.get('/nexus/status', (_req, res) => {
    res.json(NexusFederation.getNetworkStatus());
});

router.post('/nexus/admission', async (req, res) => {
    const { userId } = req.body;
    const decision = await NexusFederation.requestAdmission(userId);
    res.json(decision);
});

let ttffMetrics: number[] = [];

router.post('/telemetry/ttff', (req, res) => {
    const { ttff, episodeId, isLocal } = req.body;
    if (typeof ttff === 'number') {
        ttffMetrics.push(ttff);
        DownloadGovernor.registerTTFF(ttff, !!isLocal);
        PlaybackTelemetry.trackTTFF(ttff, isLocal ? 'LOCAL' : 'REMOTE');
        if (ttffMetrics.length > 100) ttffMetrics.shift();
        structuredLogger.info('Telemetry TTFF received', {
            episodeId,
            ttff,
            isLocal: !!isLocal,
            avgTTFF: Math.round(ttffMetrics.reduce((a, b) => a + b, 0) / ttffMetrics.length),
        });
    }
    res.sendStatus(200);
});

router.get('/telemetry/stats', (_req, res) => {
    const playbackStats = PlaybackTelemetry.getStats();
    const avgTTFF = ttffMetrics.length > 0
        ? Math.round(ttffMetrics.reduce((a, b) => a + b, 0) / ttffMetrics.length)
        : playbackStats.avgTTFF;
    res.json({
        ...playbackStats,
        avgTTFF,
        samples: ttffMetrics.length > 0 ? ttffMetrics.length : playbackStats.samples,
        cacheHitRate: ConsumptionAnalytics.getCacheHitRate(),
    });
});

router.get('/telemetry/source-intelligence', async (req, res) => {
    const snapshot = await SourceIntelligence.getOperationalSnapshot({
        ref: req.query.videoId
            ? await prisma.video.findUnique({
                where: { id: String(req.query.videoId) },
                select: {
                    title: true,
                    originalTitle: true as any,
                    tmdbId: true as any,
                    imdbId: true as any,
                    quality: true,
                    hasPortugueseAudio: true,
                    hasPortugueseSubs: true,
                    episode: {
                        select: {
                            seasonNumber: true,
                            episodeNumber: true,
                        },
                    } as any,
                } as any,
            }).then((video: any) => video ? ({
                title: video.title,
                originalTitle: video.originalTitle || null,
                tmdbId: video.tmdbId || null,
                imdbId: video.imdbId || null,
                preferredQuality: video.quality || null,
                preferredLanguage: video.hasPortugueseAudio ? 'pt-BR' : video.hasPortugueseSubs ? 'pt-BR-sub' : 'und',
                seasonNumber: video.episode?.seasonNumber || null,
                episodeNumber: video.episode?.episodeNumber || null,
            }) : undefined).catch(() => undefined)
            : undefined,
        limit: Number(req.query.limit || 8),
    });

    res.json(snapshot);
});

router.get('/telemetry/search-ranking', async (req, res) => {
    res.json(await SearchRankingTelemetry.getSnapshot(Number(req.query.limit || 20)));
});

router.get('/telemetry/addon-operations', async (req, res) => {
    const preferPortuguese = String(req.query.preferPortuguese || '').toLowerCase();
    res.json(await AddonService.getOperationalSnapshot({
        preferPortuguese: preferPortuguese === '1' || preferPortuguese === 'true' || preferPortuguese === 'pt',
    }));
});

router.get('/telemetry/language-verification', async (req, res) => {
    res.json(await LanguageVerificationTelemetry.getSnapshot(Number(req.query.limit || 20)));
});

router.get('/telemetry/video-selection', async (req, res) => {
    res.json(await VideoSelectionTelemetry.getSnapshot({
        limit: Number(req.query.limit || 20),
        videoId: req.query.videoId ? String(req.query.videoId) : null,
    }));
});

router.post('/telemetry/session', async (req, res) => {
    const { userId, videoId, duration, bytesDisk, bytesNetwork, ttff, source, bufferEvents, avgBitrate } = req.body;
    await ConsumptionAnalytics.trackSessionEnd({
        userId,
        videoId,
        duration,
        bytesDisk: bytesDisk || 0,
        bytesNetwork: bytesNetwork || 0,
        ttff: ttff || 0,
        source: source || 'UNKNOWN',
        bufferEvents: bufferEvents || 0,
        avgBitrate: avgBitrate || 0,
    });

    const video = await prisma.video.findUnique({
        where: { id: String(videoId || '') },
        select: {
            title: true,
            originalTitle: true as any,
            tmdbId: true as any,
            imdbId: true as any,
            quality: true,
            hasPortugueseAudio: true,
            hasPortugueseSubs: true,
            episode: {
                select: {
                    seasonNumber: true,
                    episodeNumber: true,
                },
            } as any,
        } as any,
    }).catch(() => null);

    if (video) {
        await SourceIntelligence.recordPlaybackOutcome({
            title: (video as any).title,
            originalTitle: (video as any).originalTitle || null,
            tmdbId: (video as any).tmdbId || null,
            imdbId: (video as any).imdbId || null,
            preferredQuality: (video as any).quality || null,
            preferredLanguage: (video as any).hasPortugueseAudio ? 'pt-BR' : (video as any).hasPortugueseSubs ? 'pt-BR-sub' : 'und',
            seasonNumber: (video as any).episode?.seasonNumber || null,
            episodeNumber: (video as any).episode?.episodeNumber || null,
        }, {
            observedSource: source || 'UNKNOWN',
            duration: Number(duration || 0),
            ttff: Number(ttff || 0),
            bufferEvents: Number(bufferEvents || 0),
            bytesNetwork: Number(bytesNetwork || 0),
            avgBitrate: Number(avgBitrate || 0),
        });
    }

    res.sendStatus(201);
});

router.post('/videos/:id/verify-media', async (req, res) => {
    try {
        const result = await MediaVerificationService.verifyVideo(req.params.id);
        if (!result.verified) {
            return res.status(400).json(result);
        }
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error?.message || 'verification failed' });
    }
});

const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
    const checks: Record<string, { status: string; detail?: string }> = {};
    let overallHealthy = true;
    const nexusUrl = process.env.NEXUS_URL || 'http://localhost:3005';
    const tmdbApiKey = process.env.TMDB_API_KEY;

    try {
        await prisma.$queryRaw`SELECT 1`;
        checks.database = { status: 'ok' };
    } catch (e: any) {
        checks.database = { status: 'error', detail: e.message };
        overallHealthy = false;
    }

    try {
        const ffmpegPath = ffmpegInstaller.path;
        checks.ffmpeg = { status: fs.existsSync(ffmpegPath) ? 'ok' : 'missing', detail: ffmpegPath };
    } catch {
        checks.ffmpeg = { status: 'error', detail: 'FFmpeg not configured' };
        overallHealthy = false;
    }

    try {
        const stats = await getSystemStats();
        checks.storage = {
            status: stats.storage.percentage > 95 ? 'critical' : stats.storage.percentage > 80 ? 'warning' : 'ok',
            detail: `${stats.storage.usedGB.toFixed(1)}GB / ${stats.storage.maxGB}GB (${stats.storage.percentage}%)`,
        };
        if (stats.storage.percentage > 95) overallHealthy = false;
    } catch {
        checks.storage = { status: 'unknown' };
    }

    try {
        const pred = await getPredictionAccuracy();
        checks.prediction = {
            status: pred.total === 0 ? 'no_data' : pred.accuracy > 30 ? 'ok' : 'poor',
            detail: `${pred.accuracy.toFixed(0)}% accuracy (${pred.successful}/${pred.total})`,
        };
    } catch {
        checks.prediction = { status: 'error' };
    }

    try {
        const rankingSnapshot = await SearchRankingTelemetry.getSnapshot(10);
        const coolingDown = (rankingSnapshot.adaptivePolicies || []).filter((policy: any) => policy.cooldown);
        checks.searchRanking = {
            status: coolingDown.length > 3 ? 'warning' : 'ok',
            detail: `${coolingDown.length} source(s) in logical cooldown`,
        };
    } catch {
        checks.searchRanking = { status: 'error' };
    }

    try {
        const nexusResponse = await axios.get(`${nexusUrl}/health`, { timeout: 4000 }).catch(async () => {
            return axios.get(`${nexusUrl}/api/health`, { timeout: 4000 });
        });
        checks.nexus = {
            status: nexusResponse.status >= 200 && nexusResponse.status < 300 ? 'ok' : 'warning',
            detail: `HTTP ${nexusResponse.status}`,
        };
    } catch (e: any) {
        checks.nexus = { status: 'error', detail: e?.message || 'unreachable' };
        overallHealthy = false;
    }

    if (!tmdbApiKey) {
        checks.tmdb = { status: 'missing', detail: 'TMDB_API_KEY not configured' };
    } else {
        try {
            const tmdbResponse = await axios.get('https://api.themoviedb.org/3/configuration', {
                params: { api_key: tmdbApiKey },
                timeout: 4000,
            });
            checks.tmdb = {
                status: tmdbResponse.status === 200 ? 'ok' : 'warning',
                detail: `HTTP ${tmdbResponse.status}`,
            };
        } catch (e: any) {
            checks.tmdb = { status: 'error', detail: e?.message || 'unreachable' };
            overallHealthy = false;
        }
    }

    res.status(overallHealthy ? 200 : 503).json({
        status: overallHealthy ? 'healthy' : 'degraded',
        version: '2.7',
        uptime: Math.floor(process.uptime()),
        checks,
    });
});

export { healthRouter };
export default router;
