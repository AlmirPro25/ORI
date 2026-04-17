
import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { addVideoJob } from '../queue/producer';
import { materializeVideo } from '../workers/media-worker';
import { orchestrateSearch, orchestrateSearchLegacy } from '../services/search-orchestrator';

export const uploadVideo = async (req: Request, res: Response) => {
  if (!req.file || !req.user) {
    return res.status(400).json({ error: 'No file uploaded or user not authenticated' });
  }

  const { title, description } = req.body;

  try {
    // 1. Criar registro no Banco de Dados
    const video = await prisma.video.create({
      data: {
        title: title || req.file.originalname,
        description: description || '',
        originalFilename: req.file.originalname,
        storageKey: 'temp', // Será atualizado após processamento
        status: 'WAITING',
        userId: (req.user as any).userId,
      },
    });

    // 2. Enviar para a Fila de Processamento
    await addVideoJob({
      videoId: video.id,
      filePath: req.file.path,
      originalName: req.file.originalname,
    });

    // 3. Resposta Imediata (Assíncrona)
    return res.status(202).json({
      message: 'Upload received. Processing started.',
      video,
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to initiate video processing' });
  }
};

export const listVideos = async (req: Request, res: Response) => {
  try {
    const { q } = req.query;

    if (q) {
      console.log(`🔍 [Controller] Buscando: ${q}`);

      // 1. Busca Local (Rápida)
      const localVideos = await prisma.video.findMany({
        where: {
          OR: [
            { title: { contains: String(q) } },
            { originalFilename: { contains: String(q) } }
          ]
        }
      });

      // 2. Busca Remota Inteligente (Orchestrator V2)
      const orchestrated = await orchestrateSearch(String(q));

      // 3. Mapeamento para visualização unificada
      const remoteVideos = orchestrated.results.map((result: any) => ({
        id: 'nexus-' + Math.random().toString(36).substr(2, 9),
        title: result.tmdbTitlePt || result.title, // Mostrar título em PT-BR se disponível
        originalTitle: result.originalTitle || result.title,
        description: `Source: ${result.source} | Seeds: ${result.seeds}`,
        status: 'CATALOG_CANDIDATE',
        storageKey: result.magnet,
        peers: result.peers || 0,
        seeds: result.seeds || 0,
        fileSize: result.size || 'N/A',
        thumbnailPath: orchestrated.enrichment?.posterPath || '',
        originalFilename: result.title,
        hasPTBRAudio: result.hasPTBRAudio || false,
        hasPTBRSubs: result.hasPTBRSubs || false,
        ptbrScore: result.ptbrScore || 0,
        relevanceScore: result.relevanceScore || 0,
        titleSimilarity: result.titleSimilarity || 0,
        mediaShape: result.mediaShape || 'unknown',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'system'
      }));

      // Retornar combinação (Local + Remoto)
      return res.json([...localVideos, ...remoteVideos]);
    }

    // Listagem padrão (sem busca)
    const videos = await prisma.video.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { name: true } } }
    });

    return res.json(videos);
  } catch (error) {
    console.error('List Videos Error:', error);
    return res.status(500).json({ error: 'Erro ao listar vídeos' });
  }
};

export const getVideo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const video = await prisma.video.findUnique({
      where: { id },
      include: { user: { select: { name: true } } },
    });

    if (!video) return res.status(404).json({ error: 'Video not found' });

    return res.json(video);
  } catch (error) {
    return res.status(500).json({ error: 'Internal error' });
  }
};

export const updateVideo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // TODO: Adicionar validação de permissão se necessário

    const video = await prisma.video.update({
      where: { id },
      data: updateData,
    });

    return res.json(video);
  } catch (error) {
    console.error('Update Video Error:', error);
    return res.status(500).json({ error: 'Failed to update video' });
  }
};

export const saveHistory = async (req: Request, res: Response) => {
  try {
    const { id: videoId } = req.params;
    const { lastTime } = req.body;
    const userId = (req as any).user.userId;

    await prisma.playbackHistory.upsert({
      where: { videoId_userId: { videoId, userId } },
      update: { lastTime },
      create: { videoId, userId, lastTime }
    });

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to save history' });
  }
};

export const getHistory = async (req: Request, res: Response) => {
  try {
    const { id: videoId } = req.params;
    const userId = (req as any).user.userId;

    const history = await prisma.playbackHistory.findUnique({
      where: { videoId_userId: { videoId, userId } }
    });

    return res.json(history || { lastTime: 0 });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch history' });
  }
};

import { downloadTorrentToServer } from '../torrent-downloader';

// ...

export const playVideo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req.user as any)?.userId || 'system';

    const video = await prisma.video.findUnique({
      where: { id }
    });

    if (!video) return res.status(404).json({ error: 'Video not found' });

    // Se for CATALOG, precisamos "materializar" o vídeo (download)
    if (video.status === 'CATALOG') {
      console.log(`[PLAY] 🚀 Materializando vídeo do catálogo: ${video.title}`);

      // O storageKey contém o magnet link neste caso
      const magnetURI = video.storageKey;

      if (!magnetURI || !magnetURI.startsWith('magnet:')) {
        return res.status(400).json({ error: 'Magnet Link inválido no catálogo' });
      }

      // Iniciar download físico
      // Obs: userId null para indicar sistema/automático se preferir, ou o usuário atual
      // Iniciar materialização via Media Worker V3.0
      // O worker é burro: só recebe ID e Magnet. O vídeo já existe como CATALOG.
      await materializeVideo(video.id, magnetURI);

      // Retornar status 202 (Accepted) sem redirecionamento
      return res.status(202).json({
        status: 'PROCESSING',
        message: 'Materialização iniciada pelo worker.',
      });
    }

    return res.json({ status: video.status, video });

  } catch (error) {
    console.error('Play Error:', error);
    return res.status(500).json({ error: 'Failed to initiate playback' });
  }
};

export const getRecommended = async (req: Request, res: Response) => {
  try {
    // Simulação de recomendação: vídeos mais vistos ou recentes
    const videos = await prisma.video.findMany({
      where: {
        status: { in: ['READY', 'CATALOG'] }
      },
      take: 10,
      orderBy: { views: 'desc' },
    });
    return res.json(videos);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch recommended videos' });
  }
};
