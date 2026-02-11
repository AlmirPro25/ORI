/**
 * 🛡️ MODULE: Governance Routes
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
import { DownloadGovernor } from '../../services/download-governor';
import { ConsumptionAnalytics } from '../../services/consumption-analytics';
import { NexusFederation } from '../../services/nexus-federation';
import { getSystemStats, getPredictionAccuracy } from '../../torrent-downloader-v2';

const router = Router();
const prisma = new PrismaClient();

// ==========================================
// 🛡️ GOVERNOR
// ==========================================

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
                totalWatchMinutes: true
            }
        });
        res.json(users);
    } catch (e) {
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

// ==========================================
// 🏅 USER BADGES & UEV
// ==========================================

router.get('/users/:userId/badges', async (req, res) => {
    const badges = await ConsumptionAnalytics.getUserBadges(req.params.userId);
    res.json(badges);
});

router.get('/telemetry/uev', async (_req, res) => {
    const uev = await ConsumptionAnalytics.getExperienceMetrics();
    res.json(uev);
});

// ==========================================
// 🛰️ NEXUS FEDERATION
// ==========================================

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

// ==========================================
// 📊 TELEMETRY (TTFF, Sessions)
// ==========================================

let ttffMetrics: number[] = [];

router.post('/telemetry/ttff', (req, res) => {
    const { ttff, episodeId, isLocal } = req.body;
    if (typeof ttff === 'number') {
        ttffMetrics.push(ttff);
        DownloadGovernor.registerTTFF(ttff, !!isLocal);
        if (ttffMetrics.length > 100) ttffMetrics.shift();
        console.log(`⏱️ [Telemetry] TTFF para ${episodeId}: ${ttff}ms (Local: ${!!isLocal}, Média: ${Math.round(ttffMetrics.reduce((a, b) => a + b, 0) / ttffMetrics.length)}ms)`);
    }
    res.sendStatus(200);
});

router.get('/telemetry/stats', (_req, res) => {
    const avgTTFF = ttffMetrics.length > 0
        ? Math.round(ttffMetrics.reduce((a, b) => a + b, 0) / ttffMetrics.length)
        : 0;
    res.json({
        avgTTFF,
        samples: ttffMetrics.length,
        cacheHitRate: ConsumptionAnalytics.getCacheHitRate()
    });
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
        avgBitrate: avgBitrate || 0
    });
    res.sendStatus(201);
});

// ==========================================
// 🏥 HEALTH CHECK UNIFICADO (Router separado — montado em / no server-portable)
// ==========================================

const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
    const checks: Record<string, { status: string; detail?: string }> = {};
    let overallHealthy = true;

    // 1. Database
    try {
        await prisma.$queryRaw`SELECT 1`;
        checks.database = { status: 'ok' };
    } catch (e: any) {
        checks.database = { status: 'error', detail: e.message };
        overallHealthy = false;
    }

    // 2. FFmpeg
    try {
        const ffmpegPath = ffmpegInstaller.path;
        checks.ffmpeg = { status: fs.existsSync(ffmpegPath) ? 'ok' : 'missing', detail: ffmpegPath };
    } catch {
        checks.ffmpeg = { status: 'error', detail: 'FFmpeg not configured' };
        overallHealthy = false;
    }

    // 3. Storage
    try {
        const stats = await getSystemStats();
        checks.storage = {
            status: stats.storage.percentage > 95 ? 'critical' : stats.storage.percentage > 80 ? 'warning' : 'ok',
            detail: `${stats.storage.usedGB.toFixed(1)}GB / ${stats.storage.maxGB}GB (${stats.storage.percentage}%)`
        };
        if (stats.storage.percentage > 95) overallHealthy = false;
    } catch {
        checks.storage = { status: 'unknown' };
    }

    // 4. Prediction Engine
    try {
        const pred = await getPredictionAccuracy();
        checks.prediction = {
            status: pred.total === 0 ? 'no_data' : pred.accuracy > 30 ? 'ok' : 'poor',
            detail: `${pred.accuracy.toFixed(0)}% accuracy (${pred.successful}/${pred.total})`
        };
    } catch {
        checks.prediction = { status: 'error' };
    }

    res.status(overallHealthy ? 200 : 503).json({
        status: overallHealthy ? 'healthy' : 'degraded',
        version: '2.6',
        uptime: Math.floor(process.uptime()),
        checks
    });
});

export { healthRouter };
export default router;

