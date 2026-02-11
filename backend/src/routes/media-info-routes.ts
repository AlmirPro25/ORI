/**
 * ROTAS DE INFORMAÇÕES DE MÍDIA
 */

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { MediaInfoExtractor } from '../media-info-extractor';
import path from 'path';

const router = Router();
const prisma = new PrismaClient();

/**
 * Atualiza informações de mídia de um vídeo específico
 */
router.post('/videos/:id/update-media-info', async (req, res) => {
    try {
        const { id } = req.params;
        
        const video = await prisma.video.findUnique({ where: { id } });
        if (!video) {
            return res.status(404).json({ error: 'Vídeo não encontrado' });
        }

        if (!video.storageKey) {
            return res.status(400).json({ error: 'Vídeo não possui arquivo' });
        }

        const videoPath = path.join(__dirname, '../../uploads', video.storageKey);
        
        console.log(`🔍 Extraindo info de mídia: ${video.title}`);
        const mediaInfo = await MediaInfoExtractor.extractMediaInfo(videoPath);
        
        // Atualizar banco
        await prisma.video.update({
            where: { id },
            data: {
                audioTracks: JSON.stringify(mediaInfo.audioTracks),
                subtitleTracks: JSON.stringify(mediaInfo.subtitleTracks),
                hasPortuguese: mediaInfo.hasPortuguese,
                hasDubbed: mediaInfo.hasDubbed
            }
        });

        console.log(`✅ Info atualizada: ${MediaInfoExtractor.formatMediaInfo(mediaInfo)}`);

        res.json({
            success: true,
            mediaInfo,
            formatted: MediaInfoExtractor.formatMediaInfo(mediaInfo),
            badges: MediaInfoExtractor.generateBadges(mediaInfo)
        });

    } catch (error: any) {
        console.error('❌ Erro ao atualizar info:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Atualiza informações de TODOS os vídeos
 */
router.post('/videos/batch-update-media-info', async (req, res) => {
    try {
        const videos = await prisma.video.findMany({
            where: {
                status: 'READY',
                storageKey: { not: null }
            }
        });

        console.log(`🔄 Atualizando info de ${videos.length} vídeos...`);

        let updated = 0;
        let failed = 0;

        for (const video of videos) {
            try {
                const videoPath = path.join(__dirname, '../../uploads', video.storageKey!);
                const mediaInfo = await MediaInfoExtractor.extractMediaInfo(videoPath);
                
                await prisma.video.update({
                    where: { id: video.id },
                    data: {
                        audioTracks: JSON.stringify(mediaInfo.audioTracks),
                        subtitleTracks: JSON.stringify(mediaInfo.subtitleTracks),
                        hasPortuguese: mediaInfo.hasPortuguese,
                        hasDubbed: mediaInfo.hasDubbed
                    }
                });

                updated++;
                console.log(`✅ ${updated}/${videos.length} - ${video.title}`);
            } catch (err) {
                failed++;
                console.error(`❌ Falha: ${video.title}`, err);
            }
        }

        res.json({
            success: true,
            total: videos.length,
            updated,
            failed
        });

    } catch (error: any) {
        console.error('❌ Erro no batch:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Busca vídeos com filtro de áudio/legenda
 */
router.get('/videos/search', async (req, res) => {
    try {
        const { 
            dubbed, // true/false - tem dublagem PT-BR
            portuguese, // true/false - tem PT-BR (áudio ou legenda)
            language // código do idioma
        } = req.query;

        const where: any = { status: 'READY' };

        if (dubbed === 'true') {
            where.hasDubbed = true;
        }

        if (portuguese === 'true') {
            where.hasPortuguese = true;
        }

        const videos = await prisma.video.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: { user: true }
        });

        // Filtro adicional por idioma específico
        let filtered = videos;
        if (language) {
            filtered = videos.filter(v => {
                if (!v.audioTracks) return false;
                const tracks = JSON.parse(v.audioTracks);
                return tracks.some((t: any) => t.language === language);
            });
        }

        // Adicionar badges formatadas
        const videosWithBadges = filtered.map(v => {
            let badges: any[] = [];
            if (v.audioTracks && v.subtitleTracks) {
                const mediaInfo = {
                    audioTracks: JSON.parse(v.audioTracks),
                    subtitleTracks: JSON.parse(v.subtitleTracks),
                    hasPortuguese: v.hasPortuguese,
                    hasDubbed: v.hasDubbed
                };
                badges = MediaInfoExtractor.generateBadges(mediaInfo);
            }
            return { ...v, mediaBadges: badges };
        });

        res.json(videosWithBadges);

    } catch (error: any) {
        console.error('❌ Erro na busca:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
