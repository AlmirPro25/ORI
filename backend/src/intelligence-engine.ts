/**
 * INTELLIGENCE ENGINE v2.0
 * Sistema de recomendação híbrido com correções de produção
 * 
 * Correções aplicadas:
 * - Sem (as any) - TypeScript completo
 * - Batch processing - Performance
 * - Trending com idade - Viral score
 * - Risk-aware recommendations - Evita travamentos
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface RecommendationWeights {
  userInterest: number;
  globalPopularity: number;
  swarmHealth: number;
}

const DEFAULT_WEIGHTS: RecommendationWeights = {
  userInterest: 0.6,
  globalPopularity: 0.3,
  swarmHealth: 0.1,
};

const BATCH_SIZE = 50; // Processa 50 vídeos por vez

/**
 * Registra uma sessão de visualização
 */
export async function trackWatchSession(
  userId: string,
  videoId: string,
  startTime: number,
  endTime: number,
  videoDuration: number
) {
  const duration = endTime - startTime;
  const watchPercentage = (duration / videoDuration) * 100;

  await prisma.watchSession.create({
    data: {
      userId,
      videoId,
      startTime,
      endTime,
      duration,
      completed: watchPercentage >= 90,
      abandoned: watchPercentage < 30,
    },
  });

  // Atualiza views do vídeo
  await prisma.video.update({
    where: { id: videoId },
    data: { views: { increment: 1 } },
  });
}

/**
 * Calcula o perfil comportamental do usuário
 */
export async function calculateUserProfile(userId: string) {
  const sessions = await prisma.watchSession.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  if (sessions.length === 0) return null;

  const totalSessions = sessions.length;
  const completedSessions = sessions.filter((s) => s.completed).length;
  const avgSessionTime =
    sessions.reduce((sum: number, s) => sum + s.duration, 0) / totalSessions;

  // Calcula preferências por categoria
  const videoIds = sessions.map((s) => s.videoId);
  const videos = await prisma.video.findMany({
    where: { id: { in: videoIds } },
    select: { id: true, category: true },
  });

  const categoryCount: Record<string, number> = {};
  videos.forEach((v) => {
    categoryCount[v.category] = (categoryCount[v.category] || 0) + 1;
  });

  // Normaliza para 0-1
  const maxCount = Math.max(...Object.values(categoryCount));
  const preferredGenres: Record<string, number> = {};
  Object.entries(categoryCount).forEach(([cat, count]) => {
    preferredGenres[cat] = count / maxCount;
  });

  await prisma.userProfile.upsert({
    where: { userId },
    create: {
      userId,
      preferredGenres: JSON.stringify(preferredGenres),
      avgSessionTime,
      completionRate: completedSessions / totalSessions,
      lastActive: new Date(),
    },
    update: {
      preferredGenres: JSON.stringify(preferredGenres),
      avgSessionTime,
      completionRate: completedSessions / totalSessions,
      lastActive: new Date(),
    },
  });

  return { preferredGenres, avgSessionTime, completionRate: completedSessions / totalSessions };
}

/**
 * Calcula estatísticas de conteúdo (roda em job)
 * CORREÇÃO: Trending agora considera idade do conteúdo
 */
export async function calculateContentStats(videoId: string) {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Views nas últimas 24h
  const views24h = await prisma.watchSession.count({
    where: {
      videoId,
      createdAt: { gte: last24h },
    },
  });

  // Views totais
  const viewsTotal = await prisma.watchSession.count({
    where: { videoId },
  });

  // Taxa de conclusão
  const sessions = await prisma.watchSession.findMany({
    where: { videoId },
    select: { completed: true, duration: true },
  });

  const completionRate =
    sessions.length > 0
      ? sessions.filter((s) => s.completed).length / sessions.length
      : 0;

  const avgWatchTime =
    sessions.length > 0
      ? sessions.reduce((sum: number, s) => sum + s.duration, 0) / sessions.length
      : 0;

  // CORREÇÃO: Trending com idade (efeito viral)
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { createdAt: true },
  });

  const ageHours = video
    ? (now.getTime() - video.createdAt.getTime()) / 3600000
    : 1;

  // Trending score: views recentes / idade (com decay)
  const trendingScore = views24h / (ageHours + 2);

  await prisma.contentStats.upsert({
    where: { videoId },
    create: {
      videoId,
      views24h,
      viewsTotal,
      completionRate,
      avgWatchTime,
      trendingScore,
      recommendScore: 0,
    },
    update: {
      views24h,
      viewsTotal,
      completionRate,
      avgWatchTime,
      trendingScore,
    },
  });
}

/**
 * Atualiza saúde do swarm (chamado pelo torrent-downloader)
 */
export async function updateSwarmHealth(
  contentHash: string,
  peers: number,
  seeds: number,
  avgSpeed: number,
  videoId?: string
) {
  // 🧠 v2.5: Health core com Rarity Logic
  // Conteúdos com poucos seeds são marcados com health baixo (< 20)
  // para ativar boosts de preservação.
  let healthScore = 0;

  if (seeds === 0) {
    healthScore = peers > 0 ? 10 : 0;
  } else if (seeds < 3) {
    healthScore = 20; // Raro/Crítico
  } else {
    // Escala linear até 100
    healthScore = Math.min(100, (seeds * 10 + peers * 2 + avgSpeed / 50));
  }

  await prisma.swarmHealth.upsert({
    where: { contentHash },
    create: {
      contentHash,
      videoId,
      peers,
      seeds,
      avgSpeed,
      healthScore,
      lastSeen: new Date(),
    },
    update: {
      peers,
      seeds,
      avgSpeed,
      healthScore,
      lastSeen: new Date(),
    },
  });

  if (healthScore <= 20) {
    console.log(`💎 [Rarity] Swarm Health Crítico (${healthScore}/100) para ${videoId || contentHash}`);
  }
}

/**
 * FÓRMULA MÁGICA v2: Calcula score de recomendação
 * CORREÇÃO: Risk-aware - penaliza conteúdo com swarm ruim
 * NOVO: Bandwidth-aware - considera infraestrutura do usuário
 */
export async function calculateRecommendationScore(
  videoId: string,
  userId?: string,
  weights: RecommendationWeights = DEFAULT_WEIGHTS
): Promise<number> {
  // 1. Popularidade global
  const stats = await prisma.contentStats.findUnique({
    where: { videoId },
  });

  if (!stats) return 0;

  const popularityScore =
    (stats.trendingScore * 0.5 + stats.viewsTotal * 0.3 + stats.completionRate * 100 * 0.2) / 100;

  // 2. Saúde do swarm
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { storageKey: true, quality: true, fileSize: true },
  });

  let swarmScore = 0.5; // Default se não tiver torrent
  if (video?.storageKey) {
    const swarm = await prisma.swarmHealth.findFirst({
      where: { videoId },
    });
    swarmScore = swarm ? swarm.healthScore / 100 : 0.5;
  }

  // 3. Interesse do usuário
  let userScore = 0.5; // Default para usuários sem perfil
  let bandwidthPenalty = 1.0; // Sem penalidade por padrão

  if (userId) {
    const profile = await prisma.userProfile.findUnique({
      where: { userId },
    });

    if (profile && profile.preferredGenres) {
      const videoData = await prisma.video.findUnique({
        where: { id: videoId },
        select: { category: true },
      });

      const genres = JSON.parse(profile.preferredGenres);
      userScore = genres[videoData?.category || ''] || 0.3;

      // NOVO: Bandwidth-aware
      if (profile.avgBandwidth > 0 && video?.quality) {
        const qualityBandwidth: Record<string, number> = {
          '720p': 2500,  // 2.5 MB/s
          '1080p': 5000, // 5 MB/s
          '4K': 15000,   // 15 MB/s
        };

        const requiredBandwidth = qualityBandwidth[video.quality] || 5000;
        const userBandwidth = profile.avgBandwidth;

        // Se banda do usuário < 70% do necessário, penaliza
        if (userBandwidth < requiredBandwidth * 0.7) {
          bandwidthPenalty = userBandwidth / requiredBandwidth;
          bandwidthPenalty = Math.max(0.3, bandwidthPenalty); // Mínimo 30%
        }
      }
    }
  }

  // FÓRMULA BASE
  const baseScore =
    userScore * weights.userInterest +
    popularityScore * weights.globalPopularity +
    swarmScore * weights.swarmHealth;

  // CORREÇÃO: Risk-aware - penaliza swarm ruim
  const deliveryRisk = 1 - swarmScore;

  // NOVO: Aplica penalidade de bandwidth
  const finalScore = baseScore * (1 - deliveryRisk * 0.5) * bandwidthPenalty;

  // Atualiza no banco
  await prisma.contentStats.update({
    where: { videoId },
    data: { recommendScore: finalScore },
  });

  return finalScore;
}

/**
 * Recomendações personalizadas com exploração
 */
export async function getRecommendations(
  userId: string,
  limit: number = 20,
  explorationRate: number = 0.1
): Promise<any[]> {
  const explorationCount = Math.ceil(limit * explorationRate);
  const exploitationCount = limit - explorationCount;

  // 1. Exploitation: conteúdo com alto score
  const topContent = await prisma.contentStats.findMany({
    where: {
      recommendScore: { gt: 0 },
    },
    orderBy: { recommendScore: 'desc' },
    take: exploitationCount,
  });

  // Buscar vídeos relacionados
  const videoIds = topContent.map((c) => c.videoId);
  const videos = await prisma.video.findMany({
    where: { id: { in: videoIds } },
    select: {
      id: true,
      title: true,
      category: true,
      thumbnailPath: true,
      duration: true,
      views: true,
    },
  });

  // Mapear scores para vídeos
  const videosWithScores = videos.map((v) => {
    const stat = topContent.find((c) => c.videoId === v.id);
    return { ...v, score: stat?.recommendScore || 0 };
  });

  // 2. Exploration: conteúdo novo ou pouco visto
  const newContent = await prisma.video.findMany({
    where: {
      views: { lt: 100 },
      status: 'READY',
    },
    orderBy: { createdAt: 'desc' },
    take: explorationCount,
    select: {
      id: true,
      title: true,
      category: true,
      thumbnailPath: true,
      duration: true,
      views: true,
    },
  });

  // Combina e embaralha
  const recommendations = [
    ...videosWithScores,
    ...newContent.map((v) => ({ ...v, score: 0.5 })),
  ];

  return recommendations.sort(() => Math.random() - 0.5);
}

/**
 * Job que roda periodicamente (a cada 5 minutos)
 * CORREÇÃO: Batch processing para performance
 */
export async function runIntelligenceJob() {
  console.log('[Intelligence] Iniciando job de cálculo...');
  const startTime = Date.now();

  // 1. Atualiza stats de todos os vídeos (em batches)
  const videos = await prisma.video.findMany({
    where: { status: 'READY' },
    select: { id: true },
  });

  console.log(`[Intelligence] Processando ${videos.length} vídeos em batches de ${BATCH_SIZE}...`);

  // CORREÇÃO: Batch processing
  for (let i = 0; i < videos.length; i += BATCH_SIZE) {
    const batch = videos.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((v) => calculateContentStats(v.id)));
    console.log(`[Intelligence] Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(videos.length / BATCH_SIZE)} concluído`);
  }

  // 2. Recalcula scores de recomendação (em batches)
  for (let i = 0; i < videos.length; i += BATCH_SIZE) {
    const batch = videos.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((v) => calculateRecommendationScore(v.id)));
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`[Intelligence] Job concluído em ${duration}s. ${videos.length} vídeos processados.`);
}
