import { Router } from 'express';
import { authenticate } from './middleware/auth';
import {
  trackWatchSession,
  calculateUserProfile,
  getRecommendations,
  runIntelligenceJob,
} from './intelligence-engine';

const router = Router();

/**
 * POST /api/intelligence/track
 * Registra sessão de visualização
 */
router.post('/track', authenticate, async (req, res) => {
  try {
    const { videoId, startTime, endTime, videoDuration } = req.body;
    const userId = (req as any).user.id;

    await trackWatchSession(userId, videoId, startTime, endTime, videoDuration);

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Intelligence] Erro ao registrar sessão:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/intelligence/profile
 * Retorna perfil comportamental do usuário
 */
router.get('/profile', authenticate, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const profile = await calculateUserProfile(userId);

    res.json(profile || { message: 'Perfil ainda não calculado' });
  } catch (error: any) {
    console.error('[Intelligence] Erro ao calcular perfil:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/intelligence/recommendations
 * Retorna recomendações personalizadas
 */
router.get('/recommendations', authenticate, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const limit = parseInt(req.query.limit as string) || 20;
    const explorationRate = parseFloat(req.query.exploration as string) || 0.1;

    const recommendations = await getRecommendations(userId, limit, explorationRate);

    res.json(recommendations);
  } catch (error: any) {
    console.error('[Intelligence] Erro ao gerar recomendações:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/intelligence/run-job (admin only)
 * Força execução do job de cálculo
 */
router.post('/run-job', authenticate, async (req, res) => {
  try {
    const user = (req as any).user;
    if (user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    await runIntelligenceJob();
    res.json({ success: true, message: 'Job executado com sucesso' });
  } catch (error: any) {
    console.error('[Intelligence] Erro ao executar job:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
