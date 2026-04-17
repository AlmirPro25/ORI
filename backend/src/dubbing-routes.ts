/**
 * ROTAS DE DUBLAGEM E LEGENDAS
 * =============================
 * Endpoints para sistema de dublagem AI e legendas
 */

import { Router } from 'express';
import { dubbingService } from './dubbing-service';
import { openSubtitlesService } from './opensubtitles-service';
import path from 'path';
import fs from 'fs';

const router = Router();

// ==========================================
// LEGENDAS (SUBTITLES)
// ==========================================

/**
 * GET /api/v1/subtitles/search
 * Busca legendas para um título
 */
router.get('/subtitles/search', async (req, res) => {
    try {
        const query = req.query.q as string;
        const imdbId = req.query.imdb as string;
        const year = req.query.year ? parseInt(req.query.year as string) : undefined;
        const languages = (req.query.lang as string)?.split(',') || ['pt-BR', 'pt', 'en'];
        const prioritizePTBR = req.query.ptbr !== 'false';

        if (!query && !imdbId) {
            return res.status(400).json({ error: 'Parâmetro q ou imdb obrigatório' });
        }

        const results = await openSubtitlesService.search({
            query: query || '',
            imdbId,
            year,
            languages,
            prioritizePTBR
        });

        res.json({
            success: true,
            count: results.length,
            priorityLanguage: 'pt-BR',
            subtitles: results
        });

    } catch (error: any) {
        console.error('[SUBTITLES] Erro:', error.message);
        res.status(500).json({ error: 'Falha na busca de legendas', details: error.message });
    }
});

/**
 * POST /api/v1/subtitles/download
 * Baixa uma legenda e salva localmente
 */
router.post('/subtitles/download', async (req, res) => {
    try {
        const { downloadUrl, videoId, languageCode } = req.body;

        if (!downloadUrl || !videoId || !languageCode) {
            return res.status(400).json({ error: 'downloadUrl, videoId e languageCode obrigatórios' });
        }

        const result = await openSubtitlesService.downloadSubtitle(downloadUrl, videoId, languageCode);

        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }

        // Converter para VTT para player HTML5
        const srtContent = fs.readFileSync(result.localPath!, 'utf-8');
        const vttContent = openSubtitlesService.convertSRTtoVTT(srtContent);

        const vttPath = result.localPath!.replace('.srt', '.vtt');
        fs.writeFileSync(vttPath, vttContent);

        res.json({
            success: true,
            srtPath: result.localPath,
            vttPath: vttPath,
            webPath: `/uploads/subtitles/${videoId}/subtitle.${languageCode}.vtt`
        });

    } catch (error: any) {
        console.error('[SUBTITLES] Erro download:', error.message);
        res.status(500).json({ error: 'Falha no download', details: error.message });
    }
});

/**
 * GET /api/v1/subtitles/languages
 * Lista idiomas suportados
 */
router.get('/subtitles/languages', (req, res) => {
    const languages = openSubtitlesService.getSupportedLanguages();
    res.json(languages);
});

// ==========================================
// DUBLAGEM (DUBBING)
// ==========================================

/**
 * GET /api/v1/dubbing/voices
 * Lista vozes TTS disponíveis
 */
router.get('/dubbing/voices', (req, res) => {
    const voices = dubbingService.getAvailableVoices();
    res.json({
        success: true,
        count: voices.length,
        default: 'pt-BR',
        voices
    });
});

/**
 * POST /api/v1/dubbing/preview
 * Gera preview de áudio para testar voz
 */
router.post('/dubbing/preview', async (req, res) => {
    try {
        const { text, language = 'pt-BR' } = req.body;

        if (!text) {
            return res.status(400).json({ error: 'Parâmetro text obrigatório' });
        }

        // Limitar tamanho do preview
        const previewText = text.slice(0, 200);

        const result = await dubbingService.generatePreview(previewText, language);

        if (!result.success) {
            return res.status(500).json({
                error: 'Falha ao gerar preview',
                hint: 'Instale edge-tts: pip install edge-tts'
            });
        }

        // Retornar path relativo para acesso via HTTP
        const relativePath = result.audioPath?.replace(path.join(__dirname, '..'), '').replace(/\\/g, '/');

        res.json({
            success: true,
            language,
            audioUrl: relativePath
        });

    } catch (error: any) {
        console.error('[DUBBING] Erro preview:', error.message);
        res.status(500).json({ error: 'Falha no preview', details: error.message });
    }
});

/**
 * POST /api/v1/dubbing/generate
 * Gera dublagem completa a partir de legendas
 */
router.post('/dubbing/generate', async (req, res) => {
    try {
        const { videoId, targetLanguage = 'pt-BR', subtitleContent, subtitlePath } = req.body;

        if (!videoId) {
            return res.status(400).json({ error: 'videoId obrigatório' });
        }

        if (!subtitleContent && !subtitlePath) {
            return res.status(400).json({ error: 'subtitleContent ou subtitlePath obrigatório' });
        }

        console.log(`[DUBBING] 🎙️ Iniciando geração de dublagem: ${videoId} → ${targetLanguage}`);

        // Iniciar em background (pode demorar muito)
        res.json({
            success: true,
            message: 'Dublagem iniciada em background',
            videoId,
            targetLanguage,
            status: 'PROCESSING'
        });

        // Processar async
        const result = await dubbingService.generateDubbing({
            videoId,
            targetLanguage,
            subtitleContent,
            sourceSubtitlePath: subtitlePath,
            outputDir: path.join(__dirname, '../uploads/dubbing')
        });

        // TODO: Emitir evento via Socket.io quando pronto
        console.log(`[DUBBING] ${result.success ? '✅' : '❌'} Dublagem ${result.success ? 'completa' : 'falhou'}: ${videoId}`);

    } catch (error: any) {
        console.error('[DUBBING] Erro:', error.message);
        // Resposta já foi enviada, log apenas
    }
});

/**
 * GET /api/v1/dubbing/status/:videoId
 * Verifica status de uma dublagem
 */
router.get('/dubbing/status/:videoId', async (req, res) => {
    try {
        const { videoId } = req.params;
        const language = (req.query.lang as string) || 'pt-BR';

        const dubbingDir = path.join(__dirname, '../uploads/dubbing', videoId, language);
        const finalPath = path.join(dubbingDir, `dubbing_${language}.mp3`);

        if (fs.existsSync(finalPath)) {
            const stats = fs.statSync(finalPath);
            res.json({
                status: 'READY',
                audioUrl: `/uploads/dubbing/${videoId}/${language}/dubbing_${language}.mp3`,
                fileSize: stats.size,
                createdAt: stats.birthtime
            });
        } else if (fs.existsSync(dubbingDir)) {
            // Verificar se há arquivos parciais
            const files = fs.readdirSync(dubbingDir);
            res.json({
                status: 'PROCESSING',
                progress: files.length,
                message: `${files.length} segmentos processados`
            });
        } else {
            res.json({
                status: 'NOT_FOUND',
                message: 'Nenhuma dublagem encontrada para este vídeo'
            });
        }

    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
