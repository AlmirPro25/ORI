/**
 * 🚀 ROTAS DO DOWNLOADER V2
 * 
 * Endpoints para gerenciar fila de downloads
 */

import { Router } from 'express';
import {
    queueDownload,
    getDownloadStatus,
    listAllDownloads,
    cancelDownload,
    prioritizeDownload,
    getSystemStats,
    boostDemand,
    getPredictionAccuracy
} from './torrent-downloader-v2';
import { authenticate } from './middleware/auth';

const router = Router();

/**
 * POST /api/v1/downloads/queue
 * Adiciona download à fila
 */
router.post('/queue', authenticate, async (req, res) => {
    try {
        const { magnetURI, title, description, category, priority } = req.body;
        const userId = req.user!.id;

        if (!magnetURI || !title) {
            return res.status(400).json({
                error: 'magnetURI e title são obrigatórios'
            });
        }

        const result = await queueDownload({
            magnetURI,
            userId,
            title,
            description,
            category,
            priority
        });

        res.json({
            success: true,
            message: `Download adicionado à fila (posição ${result.position})`,
            videoId: result.videoId,
            position: result.position
        });
    } catch (err: any) {
        console.error('❌ [API] Erro ao adicionar à fila:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/v1/downloads/:videoId
 * Status de um download específico
 */
router.get('/:videoId', authenticate, async (req, res) => {
    try {
        const { videoId } = req.params;
        const status = await getDownloadStatus(videoId);

        if (!status) {
            return res.status(404).json({ error: 'Download não encontrado' });
        }

        res.json(status);
    } catch (err: any) {
        console.error('❌ [API] Erro ao buscar status:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/v1/downloads
 * Lista todos os downloads (com filtro opcional)
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const { status } = req.query;
        const downloads = await listAllDownloads(status as string);

        res.json({
            total: downloads.length,
            downloads
        });
    } catch (err: any) {
        console.error('❌ [API] Erro ao listar downloads:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/v1/downloads/:videoId
 * Cancela um download
 */
router.delete('/:videoId', authenticate, async (req, res) => {
    try {
        const { videoId } = req.params;
        await cancelDownload(videoId);

        res.json({
            success: true,
            message: 'Download cancelado'
        });
    } catch (err: any) {
        console.error('❌ [API] Erro ao cancelar download:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/v1/downloads/:videoId/prioritize
 * Prioriza um download na fila
 */
router.post('/:videoId/prioritize', authenticate, async (req, res) => {
    try {
        const { videoId } = req.params;
        const { priority = 100 } = req.body;

        await prioritizeDownload(videoId, priority);

        res.json({
            success: true,
            message: 'Download priorizado'
        });
    } catch (err: any) {
        console.error('❌ [API] Erro ao priorizar:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/v1/downloads/stats/system
 * Estatísticas do sistema de downloads
 */
router.get('/stats/system', authenticate, async (req, res) => {
    try {
        const stats = await getSystemStats();
        res.json(stats);
    } catch (err: any) {
        console.error('❌ [API] Erro ao buscar stats:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/v1/downloads/:videoId/boost
 * Boost de demanda para um conteúdo específico
 */
router.post('/:videoId/boost', async (req, res) => {
    try {
        const { videoId } = req.params;
        const { type = 'PLAY_ATTEMPT' } = req.body;

        await boostDemand(videoId, type);

        res.json({
            success: true,
            message: 'Demanda registrada com sucesso'
        });
    } catch (err: any) {
        console.error('❌ [API] Erro no boost de demanda:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/v1/downloads/stats/predictions
 * Estatísticas de precisão de predição (Feedback Loop)
 */
router.get('/stats/predictions', authenticate, async (req, res) => {
    try {
        const stats = await getPredictionAccuracy();
        res.json(stats);
    } catch (err: any) {
        console.error('❌ [API] Erro ao buscar stats de predição:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
