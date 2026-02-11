import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import jwt from 'jsonwebtoken';

import { Server } from 'socket.io';
import http from 'http';
import { ArconteAutoCurator } from './auto-curator';
import { aiService } from './ai-service';
import iptvRouter from './iptv-routes';
import { YouTubeService } from './youtube-service';
import { TMDBService } from './tmdb-service';
import dubbingRoutes from './dubbing-routes';
import intelligenceRoutes from './intelligence-routes';
import { startWorker } from './intelligence-worker';
import { startQueueProcessor, queueDownload, getSystemStats, getPredictionAccuracy, cancelDownload, shutdownDownloader } from './torrent-downloader-v2';
import downloaderRoutes from './routes-downloader-v2';
import seriesRoutes from './routes/series-routes';
import mediaInfoRoutes from './routes/media-info-routes';
import { addonRoutes } from './routes/addon.routes';
import aiChatRoutes from './ai-chat-routes';

import { governanceRoutes, healthRoutes, searchRoutes, createAuthRoutes } from './modules';
import { SystemTelemetry } from './services/system-telemetry';


// Configuração do FFmpeg local (Portable)
try {
    ffmpeg.setFfmpegPath(ffmpegInstaller.path);
    ffmpeg.setFfprobePath(ffprobeInstaller.path);
} catch (e) {
    console.warn("Aviso: FFmpeg paths não puderam ser definidos automaticamente.", e);
}

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);

// Inicializar Arconte Auto-Curator
const curator = new ArconteAutoCurator();
// Inicia ciclo de 12 horas (para não sobrecarregar em dev)
curator.start(12);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

import { DownloadGovernor } from './services/download-governor';
import { ConsumptionAnalytics } from './services/consumption-analytics';
import { NexusFederation } from './services/nexus-federation';

// 📡 SOCKET.IO: UNIFIED CONNECTION HANDLER
// Registra TODOS os eventos de socket num único handler (evita listeners duplicados)
io.on('connection', (socket) => {
    let activeUserId: string | null = null;
    console.log('⚡ Socket conectado:', socket.id);

    // ── Watch Tracking (Governor) ──
    socket.on('watch:start', async (data: { userId: string, episodeId: string, isFederated?: boolean }) => {
        activeUserId = data.userId;
        DownloadGovernor.registerViewer(data.userId, data.episodeId);

        // Tracking Local vs Federated
        ConsumptionAnalytics.trackRequest(!data.isFederated);

        // 🧠 Cache Intelligence: Verificar se foi um HIT ou MISS
        if (data.episodeId) {
            const ep = await (prisma as any).episode.findUnique({
                where: { id: data.episodeId },
                select: { status: true }
            });
            ConsumptionAnalytics.trackCacheEvent(ep?.status === 'READY');
        }

        console.log(`👁️ [Monitor] Usuário ${data.userId} começou a assistir ${data.episodeId || 'vídeo'}`);
    });

    socket.on('watch:stop', () => {
        if (activeUserId) {
            DownloadGovernor.unregisterViewer(activeUserId);
            activeUserId = null;
        }
    });

    // ── Live Chat (P2P Bridge) ──
    socket.on('join_room', (videoId) => {
        socket.join(videoId);
        console.log(`👤 Socket ${socket.id} entrou na sala do vídeo: ${videoId}`);
    });

    socket.on('send_message', (data) => {
        // data: { videoId, text, user }
        io.to(data.videoId).emit('receive_message', {
            id: Date.now(),
            text: data.text,
            user: data.user,
            timestamp: new Date().toISOString()
        });
    });

    // ── Cleanup ──
    socket.on('disconnect', () => {
        if (activeUserId) {
            DownloadGovernor.unregisterViewer(activeUserId);
        }
        console.log('🔥 Socket desconectado:', socket.id);
    });
});

const PORT = 3000;

// 🔐 SEGURANÇA: JWT Secret — Fail-fast em produção
const isProduction = process.env.NODE_ENV === 'production';
if (!process.env.JWT_SECRET && isProduction) {
    console.error('🚨 [FATAL] JWT_SECRET não definido em produção. Abortando.');
    process.exit(1);
}
if (!process.env.JWT_SECRET) {
    console.warn('⚠️ [SECURITY] JWT_SECRET não definido. Usando chave efêmera (APENAS DEV).');
}
const JWT_SECRET = process.env.JWT_SECRET || require('crypto').randomBytes(32).toString('hex');

// Middleware CORS Enable All
app.use(cors({ origin: '*' }));
app.use(express.json());

// 📺 IPTV MODULE
app.use('/api/iptv', iptvRouter);

// 🎙️ DUBBING & SUBTITLES MODULE
app.use('/api/v1', dubbingRoutes);
app.use('/uploads/subtitles', express.static(path.join(__dirname, '../uploads/subtitles')));
app.use('/uploads/dubbing', express.static(path.join(__dirname, '../uploads/dubbing')));

// 🧠 INTELLIGENCE ENGINE (Sistema de Recomendação Híbrido)
app.use('/api/intelligence', intelligenceRoutes);

// 📥 DOWNLOADER V2 (Fila de Ingestão com Orquestração P2P)
app.use('/api/v1/downloads', downloaderRoutes);
app.use('/api/v1/addons', addonRoutes); // 🧩 STREMIO ADDONS MANAGER

// 📺 SERIES MANAGEMENT (Orquestrador de Séries)
app.use('/api/v1/series', seriesRoutes);

// 🎬 MEDIA INFO (Informações de Áudio e Legendas)
app.use('/api/v1/media-info', mediaInfoRoutes);

// 🤖 AI CHAT (Assistente Inteligente)
app.use('/api/ai-chat', aiChatRoutes);

// 🛡️ GOVERNANCE, TELEMETRY, FEDERATION (Module)
app.use('/api/v1', governanceRoutes);

// 🏥 HEALTH CHECK (Module — sem prefixo /api/v1)
app.use('', healthRoutes);

// 🌌 SEARCH (Module)  
app.use('/api/v1/search', searchRoutes);

// 🔐 AUTH (Module)
app.use('/api/v1/auth', createAuthRoutes(JWT_SECRET));

// (Governor, Telemetry, Health, Federation, Search, Auth — agora em modules/)

// 🌌 ORION PROTOCOL (Federation Layer)
import { orionRoutes } from './orion/routes';
import { orionNode } from './orion/service';

app.use('/api/v1/orion', orionRoutes);

// Inicializar Orion Node em Background
orionNode.start().catch(err => console.error('❌ [Orion] Falha ao iniciar nó:', err));


app.get('/api/videos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const video = await YouTubeService.getVideoDetails(id);
        if (!video) return res.status(404).json({ error: "Vídeo não encontrado." });
        res.json(video);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Arquivos Estáticos HLS
app.use('/hls', express.static(process.env.STORAGE_PATH || path.join(__dirname, '../storage')));

// Servir arquivos estáticos (HLS, Vídeos e Thumbnails)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Servir arquivos de downloads (vídeos baixados via torrent)
app.use('/downloads', express.static(path.join(__dirname, '../downloads')));

// Configuração do Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    },
});
const upload = multer({ storage });

// Health Check V1
app.get('/api/v1', (req, res) => {
    res.json({ message: "StreamForge API is running..." });
});


// Auth routes now in modules/auth (registered above)

// ==========================================
// ROTAS DE VÍDEOS & RECOMENDAÇÕES
// ==========================================

app.get('/api/v1/videos', async (req, res) => {
    try {
        const videos = await prisma.video.findMany({ orderBy: { createdAt: 'desc' }, include: { user: true } });
        res.json(videos);
    } catch (e) {
        res.status(500).json({ error: "Failed to fetch videos" });
    }
});

// Sistema de Recomendação Baseado em IA (Simulado)
app.get('/api/v1/videos/recommended', async (req, res) => {
    try {
        // Pega 6 mais vistos e 6 mais recentes para diversidade
        const [topViewed, latest] = await Promise.all([
            prisma.video.findMany({ where: { status: 'READY' }, take: 6, orderBy: { views: 'desc' } }),
            prisma.video.findMany({ where: { status: 'READY' }, take: 6, orderBy: { createdAt: 'desc' } })
        ]);

        const merged = [...topViewed, ...latest];
        const unique = Array.from(new Map(merged.map(v => [v.id, v])).values());

        res.json(unique);
    } catch (e) {
        res.status(500).json({ error: "Failed to fetch recommendations" });
    }
});

app.get('/api/v1/videos/:id', async (req, res) => {
    const video = await prisma.video.findUnique({ where: { id: req.params.id }, include: { user: true } });
    if (!video) return res.status(404).json({ error: 'Video not found' });
    res.json(video);
});

app.delete('/api/v1/videos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const video = await prisma.video.findUnique({ where: { id } });

        if (!video) return res.status(404).json({ error: 'Vídeo não encontrado' });

        console.log(`🗑️ [Deletor] Removendo ativo: ${video.title} (${id})`);

        // 1. Limpeza de Arquivos Locais (Uploads)
        const uploadDir = path.join(__dirname, '../uploads');
        if (video.storageKey) {
            const videoPath = path.join(uploadDir, video.storageKey);
            if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
        }
        if (video.thumbnailPath && !video.thumbnailPath.startsWith('http')) {
            const thumbPath = path.join(uploadDir, video.thumbnailPath);
            if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
        }

        // 2. Limpeza de HLS (Storage)
        const storageDir = process.env.STORAGE_PATH || path.join(__dirname, '../storage');
        const hlsFolder = path.join(storageDir, id);
        if (fs.existsSync(hlsFolder)) {
            fs.rmSync(hlsFolder, { recursive: true, force: true });
        }

        // 3. Limpeza de Downloads (Torrents)
        const downloadsDir = path.join(__dirname, '../downloads');
        // Tentar encontrar pasta do download pelo título ou ID
        const possibleDownloadPath = path.join(downloadsDir, video.title);
        if (fs.existsSync(possibleDownloadPath)) {
            fs.rmSync(possibleDownloadPath, { recursive: true, force: true });
        }

        // 4. Parar Downloads Ativos / Seeds / Processos Engine
        try {
            await cancelDownload(id);
            await (prisma as any).seedState.deleteMany({ where: { videoId: id } });
        } catch (e) {
            console.warn('[Deletor] Aviso: Falha ao sinalizar cancelamento para a Engine V2');
        }

        // 5. Remover do Banco
        await prisma.video.delete({ where: { id } });

        res.json({ success: true, message: 'Vídeo e arquivos removidos com sucesso.' });
    } catch (error: any) {
        console.error('❌ Erro ao deletar vídeo:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// HISTÓRICO DE REPRODUÇÃO
// ==========================================

app.get('/api/v1/videos/:id/history', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.query.userId as string;
        if (!userId) return res.json({ lastTime: 0 });

        const history = await prisma.playbackHistory.findUnique({
            where: { videoId_userId: { videoId: id, userId } }
        });
        res.json(history || { lastTime: 0 });
    } catch (e) {
        res.status(500).json({ error: 'Failed' });
    }
});

// ==========================================
// O COFRE (FAVORITOS)
// ==========================================

app.get('/api/v1/users/:userId/favorites', async (req, res) => {
    try {
        const { userId } = req.params;
        const favorites = await prisma.favorite.findMany({
            where: { userId },
            include: { video: true },
            orderBy: { createdAt: 'desc' }
        });
        // Retornamos apenas os vídeos
        res.json(favorites.map(f => f.video));
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch favorites' });
    }
});

app.post('/api/v1/users/:userId/favorites/:videoId', async (req, res) => {
    try {
        const { userId, videoId } = req.params;

        const existing = await prisma.favorite.findUnique({
            where: { videoId_userId: { videoId, userId } }
        });

        if (existing) {
            await prisma.favorite.delete({
                where: { videoId_userId: { videoId, userId } }
            });
            return res.json({ favorited: false });
        } else {
            await prisma.favorite.create({
                data: { videoId, userId }
            });
            return res.json({ favorited: true });
        }
    } catch (e) {
        res.status(500).json({ error: 'Failed to toggle favorite' });
    }
});

app.get('/api/v1/users/:userId/favorites/:videoId/status', async (req, res) => {
    try {
        const { userId, videoId } = req.params;
        const existing = await prisma.favorite.findUnique({
            where: { videoId_userId: { videoId, userId } }
        });
        res.json({ favorited: !!existing });
    } catch (e) {
        res.status(500).json({ error: 'Failed to check status' });
    }
});

app.post('/api/v1/videos/:id/history', async (req, res) => {
    try {
        const { id } = req.params;
        const { userId, lastTime } = req.body;
        if (!userId) return res.status(400).json({ error: 'userId required' });

        await prisma.playbackHistory.upsert({
            where: { videoId_userId: { videoId: id, userId } },
            update: { lastTime },
            create: { videoId: id, userId, lastTime }
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to save history' });
    }
});

app.get('/api/v1/users/:userId/history', async (req, res) => {
    try {
        const { userId } = req.params;
        const history = await prisma.playbackHistory.findMany({
            where: { userId },
            include: { video: true },
            orderBy: { updatedAt: 'desc' },
            take: 20
        });
        res.json(history);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

// Upload com Video e Thumbnail
app.post('/api/v1/videos/upload', upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 }
]), async (req: any, res) => {
    try {
        const files = req.files;
        if (!files.file) return res.status(400).json({ error: 'No video file uploaded' });

        const videoFile = files.file[0];
        const thumbFile = files.thumbnail ? files.thumbnail[0] : null;

        let userId = 'anon-user';
        const authHeader = req.headers.authorization;
        if (authHeader) {
            try {
                const token = authHeader.split(' ')[1];
                const decoded: any = jwt.verify(token, JWT_SECRET);
                userId = decoded.id;
            } catch (e) { }
        }

        const video = await prisma.video.create({
            data: {
                title: req.body.title || 'Sem título',
                description: req.body.description || '',
                category: req.body.category || 'Geral',
                originalFilename: videoFile.originalname,
                status: 'PROCESSING',
                userId: userId,
                storageKey: videoFile.filename,
                thumbnailPath: thumbFile ? thumbFile.filename : null
            },
        });

        processVideo(video.id, videoFile.path);
        res.status(202).json({ message: 'Upload recebido.', video });
    } catch (error) {
        res.status(500).json({ error: 'Erro no upload' });
    }
});

// Ingestão Automática via Nexus Agent
app.post('/api/v1/videos/auto-ingest', async (req, res) => {
    try {
        const { title, description, category, externalSource, thumbnailUrl, tags } = req.body;

        // Validação: Se externalSource é um magnet link, forçar status NEXUS
        const isMagnetLink = externalSource && externalSource.startsWith('magnet:');
        let videoId = undefined;

        if (isMagnetLink) {
            const hashMatch = externalSource.match(/btih:([a-zA-Z0-9]+)/i);
            if (hashMatch) {
                videoId = hashMatch[1].toLowerCase();
            }
        }

        // Verificar se já existe
        const existing = await prisma.video.findUnique({
            where: { id: videoId || 'unknown' }
        });

        if (existing) {
            return res.json(existing);
        }

        const systemAgent = await prisma.user.upsert({
            where: { email: 'arconte@streamforge.ai' },
            update: {},
            create: {
                id: 'nexus-agent-system',
                email: 'arconte@streamforge.ai',
                name: 'Arconte AI',
                password: 'system-process-hash',
                role: 'ADMIN'
            }
        });

        const video = await prisma.video.create({
            data: {
                id: videoId, // Se for magnet, usa o infoHash como ID
                title: title || 'Ativo Nexus',
                description: description || 'Extraído automaticamente pelo Arconte.',
                category: category || 'NEXUS',
                status: isMagnetLink ? 'NEXUS' : 'READY',
                originalFilename: 'nexus-at-source',
                userId: systemAgent.id,
                hlsPath: externalSource,
                thumbnailPath: thumbnailUrl,
                tags: Array.isArray(tags) ? tags.join(',') : tags,
                isPredictive: req.body.predictive || false
            }
        });

        // Notificar via Socket.io que o Arconte adicionou algo novo
        io.emit('arconte_new_content', {
            title: video.title,
            thumbnail: video.thumbnailPath,
            id: video.id
        });

        console.log(`✅ Auto-ingestão iniciada: ${video.title} (${video.status})`);

        // --- ENRIQUECIMENTO EM BACKGROUND ---
        // Despacha o Arconte para analisar o conteúdo sem travar a resposta
        if (isMagnetLink) {
            // Se for preditivo (Arconte decidiu que é tendência forte), enfileira download
            if (req.body.predictive) {
                console.log(`🧠 [Predictive] Iniciando prefech preventivo: ${video.title}`);
                queueDownload({
                    magnetURI: externalSource,
                    videoId: video.id,
                    userId: systemAgent.id,
                    title: video.title,
                    priority: 50 // Prioridade média para prefetch
                }).catch(err => console.error('❌ Erro no prefetch preditivo:', err));
            }

            if (!tags?.includes('Enriched')) {
                aiService.enrichContent(video.title, description || '').then(async (enriched: any) => {
                    await prisma.video.update({
                        where: { id: video.id },
                        data: {
                            title: enriched.title,
                            description: enriched.description,
                            category: enriched.category,
                            thumbnailPath: enriched.poster || video.thumbnailPath,
                            tags: [...(video.tags?.split(',') || []), ...enriched.tags, 'Enriched', 'Autobot'].join(',')
                        }
                    });
                    console.log(`✨ Conteúdo enriquecido pela IA: ${enriched.title}`);

                    // Notifica novamente com os dados reais
                    io.emit('arconte_new_content', {
                        title: enriched.title,
                        thumbnail: enriched.poster || video.thumbnailPath,
                        id: video.id
                    });
                }).catch((err: Error) => console.error('❌ Erro no enriquecimento em background:', err));
            }
        }

        res.status(201).json(video);
    } catch (error) {
        console.error('❌ Falha na ingestão automática:', error);
        res.status(500).json({ error: 'Falha na ingestão automática' });
    }
});

/**
 * 📥 Importar Metadados do TMDB para a Biblioteca (Povoar)
 */
app.post('/api/v1/videos/import', async (req, res) => {
    try {
        const { tmdbId, imdbId, title, overview, poster_path, backdrop_path, release_date, media_type, userId, tags } = req.body;

        if (!tmdbId || !title) {
            return res.status(400).json({ error: 'TMDB ID e Título são obrigatórios.' });
        }

        // Verificar se já existe pelo TMDB ID
        const existing = await prisma.video.findFirst({
            where: { tmdbId: String(tmdbId) }
        });

        if (existing) {
            return res.json({ message: 'Vídeo já existe na biblioteca', video: existing, imported: false });
        }

        // Garantir usuário do sistema
        let ownerId = userId;
        if (!ownerId) {
            const systemAgent = await prisma.user.upsert({
                where: { email: 'arconte@streamforge.ai' },
                update: {},
                create: {
                    id: 'nexus-agent-system',
                    email: 'arconte@streamforge.ai',
                    name: 'Arconte AI',
                    password: 'system-process-hash',
                    role: 'ADMIN'
                }
            });
            ownerId = systemAgent.id;
        }

        const video = await prisma.video.create({
            data: {
                title: title,
                description: overview || '',
                category: media_type === 'tv' ? 'series' : 'Filmes',
                originalFilename: `TMDB-${tmdbId}`,
                status: 'REMOTE', // Indica que é um item remoto (sem arquivo local físico ainda)
                tmdbId: String(tmdbId),
                imdbId: imdbId ? String(imdbId) : null,
                thumbnailPath: poster_path, // Pode ser URL completa ou path relativo se baixarmos
                userId: ownerId,
                tags: tags || 'TMDB,Imported',
                isPredictive: false
            }
        });

        console.log(`📚 [Library] Vídeo importado do TMDB: ${title} (${tmdbId})`);
        res.status(201).json({ message: 'Vídeo importado com sucesso', video, imported: true });

    } catch (e: any) {
        console.error('Erro ao importar vídeo:', e);
        res.status(500).json({ error: 'Falha na importação: ' + e.message });
    }
});

import { arconteAdmin } from './nexus-bridge';

app.post('/api/v1/ai/deep-search', async (req, res) => {
    const { query, prioritizePTBR = true, ptbrOnly = false } = req.body;
    if (!query) return res.status(400).json({ error: 'Termo de busca vazio.' });

    console.log(`[ORION] Arconte despachado: "${query}" (PriorizePTBR: ${prioritizePTBR})`);
    arconteAdmin.processDemand(query); // Adicionar suporte em uma versão futura para passar filtros ao Arconte

    res.json({ message: 'Arconte foi despachado para a rede profunda.' });
});

// ==========================================
// ROTAS DE INTERATIVIDADE
// ==========================================

app.post('/api/v1/videos/:id/comments', async (req, res) => {
    try {
        const { id } = req.params;
        const { content, userId } = req.body;
        const comment = await prisma.comment.create({ data: { content, videoId: id, userId } });
        res.json(comment);
    } catch (e) {
        res.status(500).json({ error: 'Failed' });
    }
});

app.post('/api/v1/videos/:id/like', async (req, res) => {
    try {
        const { id } = req.params;
        const { userId, isLike } = req.body;
        const like = await prisma.like.upsert({
            where: { videoId_userId: { videoId: id, userId } },
            update: { isLike },
            create: { videoId: id, userId, isLike }
        });
        res.json(like);
    } catch (e) {
        res.status(500).json({ error: 'Failed' });
    }
});

app.get('/api/v1/videos/:id/stats', async (req, res) => {
    try {
        const { id } = req.params;
        const [likesCount, dislikesCount, comments] = await Promise.all([
            prisma.like.count({ where: { videoId: id, isLike: true } }),
            prisma.like.count({ where: { videoId: id, isLike: false } }),
            prisma.comment.findMany({ where: { videoId: id }, include: { user: true }, orderBy: { createdAt: 'desc' } })
        ]);
        res.json({ likesCount, dislikesCount, comments });
    } catch (e) {
        res.status(500).json({ error: 'Failed' });
    }
});

app.delete('/api/v1/videos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const video = await prisma.video.findUnique({ where: { id } });
        if (!video) return res.status(404).json({ error: 'Video not found' });
        const baseDir = path.join(__dirname, '../uploads');
        if (video.storageKey) {
            const videoPath = path.join(baseDir, video.storageKey);
            if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
        }
        if (video.thumbnailPath) {
            const thumbPath = path.join(baseDir, video.thumbnailPath);
            if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
        }
        const hlsDir = path.join(baseDir, 'hls', id);
        if (fs.existsSync(hlsDir)) fs.rmSync(hlsDir, { recursive: true, force: true });
        await prisma.video.delete({ where: { id } });
        res.json({ message: 'Success' });
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

// 🎬 Rota de Streaming de Vídeo com Range Requests
app.get('/api/v1/videos/:id/stream', async (req, res) => {
    try {
        const { id } = req.params;
        const video = await prisma.video.findUnique({ where: { id } });

        if (!video || !video.storageKey) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const videoPath = path.join(__dirname, '..', video.storageKey);

        if (!fs.existsSync(videoPath)) {
            return res.status(404).json({ error: 'Video file not found' });
        }

        const stat = fs.statSync(videoPath);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            const file = fs.createReadStream(videoPath, { start, end });
            const head = {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': 'video/mp4',
            };
            res.writeHead(206, head);
            file.pipe(res);
        } else {
            const head = {
                'Content-Length': fileSize,
                'Content-Type': 'video/mp4',
            };
            res.writeHead(200, head);
            fs.createReadStream(videoPath).pipe(res);
        }
    } catch (error) {
        console.error('Stream error:', error);
        res.status(500).json({ error: 'Stream failed' });
    }
});

// Worker Interno
async function processVideo(videoId: string, inputPath: string) {
    const outputDir = path.join(__dirname, `../uploads/hls/${videoId}`);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, 'index.m3u8');

    ffmpeg(inputPath)
        .outputOptions(['-hls_time', '10', '-hls_list_size', '0'])
        .output(outputPath)
        .on('end', async () => {
            await prisma.video.update({
                where: { id: videoId },
                data: { status: 'READY', hlsPath: `hls/${videoId}/index.m3u8` }
            });
        })
        .on('error', async () => {
            await prisma.video.update({ where: { id: videoId }, data: { status: 'FAILED' } });
        })
        .run();
}

// ==========================================
// SISTEMA DE RECOMENDAÇÕES (TAG-BASED)
// ==========================================
app.get('/api/v1/recommendations', async (req, res) => {
    try {
        const userId = req.query.userId as string;
        if (!userId) {
            // Se não logado, retorna vídeos populares ou aleatórios
            const randomVideos = await prisma.video.findMany({
                take: 10,
                orderBy: { views: 'desc' }
            });
            return res.json(randomVideos);
        }

        // 1. Pegar o histórico recente do usuário
        const history = await prisma.playbackHistory.findMany({
            where: { userId },
            include: { video: true },
            orderBy: { updatedAt: 'desc' },
            take: 5
        });

        // 2. Extrair categorias e tags do histórico
        const categories = history.map(h => h.video.category);
        const allTags = history.flatMap(h => h.video.tags?.split(',') || []);

        // 3. Buscar vídeos similares (mesma categoria ou tags)
        const recommendations = await prisma.video.findMany({
            where: {
                OR: [
                    { category: { in: categories } },
                    {
                        tags: {
                            contains: allTags[0] // Busca simples pela primeira tag por enquanto
                        }
                    }
                ],
                NOT: {
                    id: { in: history.map(h => h.videoId) } // Não recomendar o que já viu
                }
            },
            take: 10,
            orderBy: { views: 'desc' }
        });

        res.json(recommendations);
    } catch (error) {
        res.status(500).json({ error: 'Falha ao buscar recomendações' });
    }
});

// ==========================================
// DASHBOARD ANALYTICS (ADMIN)
// ==========================================
app.get('/api/v1/admin/analytics', async (req, res) => {
    try {
        const [totalVideos, totalUsers, totalViews, categoryStats] = await Promise.all([
            prisma.video.count(),
            prisma.user.count(),
            prisma.video.aggregate({ _sum: { views: true } }),
            prisma.video.groupBy({
                by: ['category'],
                _count: { _all: true }
            })
        ]);

        res.json({
            stats: {
                videos: totalVideos,
                users: totalUsers,
                views: totalViews._sum.views || 0,
                activeNodes: Math.floor(Math.random() * 50) + 10 // Simulação de nodes P2P
            },
            categories: categoryStats,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: 'Falha ao buscar analytics' });
    }
});

// ==========================================
// SYSTEM TELEMETRY (INDUSTRIAL GRADE)
// ==========================================
app.get('/api/v1/system/telemetry', (req, res) => {
    res.json(SystemTelemetry.getSnapshot());
});




server.listen(PORT, () => {
    console.log(`🚀 STREAMFORGE BACKEND ONLINE NA PORTA ${PORT}`);
    console.log(`📺 IPTV Module: /api/iptv/*`);
    console.log(`🧠 Intelligence Engine: /api/intelligence/*`);
    console.log(`📥 Downloader V2: /api/v1/downloads/*`);
    console.log(`📊 Telemetry Engine: /api/v1/system/telemetry`);

    // Inicia o worker de inteligência
    startWorker().catch(console.error);

    // Inicia o processador de fila de downloads
    startQueueProcessor();
});

// 🛡️ GRACEFUL SHUTDOWN Handler
const gracefulShutdown = async () => {
    console.log('🛑 [Shutdown] Sinal recebido. Parando serviços...');

    // Parar Downloader (Stateful)
    await shutdownDownloader();

    // Fechar servidor HTTP
    server.close(() => {
        console.log('✅ [Shutdown] Servidor HTTP fechado.');

        // Fechar conexão com banco
        prisma.$disconnect().then(() => {
            console.log('✅ [Shutdown] Conexão com DB fechada.');
            process.exit(0);
        });
    });

    // Force exit after 10s if hung
    setTimeout(() => {
        console.error('⚠️ [Shutdown] Forçando saída após timeout...');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
