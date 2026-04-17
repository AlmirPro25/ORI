/**
 * 🚀 MEDIA WORKER - O EXECUTOR DE MATERIALIZAÇÃO (V3.0)
 * 
 * Responsabilidade Única:
 * "Recebo ordem de materializar um ID existente. Entrego bits no disco."
 * 
 * Princípios de Arquitetura:
 * 1. ZERO CRIAÇÃO DE VÍDEO: O worker nunca faz prisma.video.create().
 * 2. ID IMUTÁVEL: O ID do vídeo é a chave primária de tudo.
 * 3. EXECUTOR BURRO: Não decide regras de negócio, apenas prioriza e executa.
 * 4. ROBUSTEZ: Herda toda a engenharia de guerra do V2.4 (Fila, Swarm, Recovery).
 */

// @ts-ignore
// Removed static import to fix ESM require issue
// import WebTorrent from 'webtorrent';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import ffmpeg from 'fluent-ffmpeg';
// @ts-ignore
import ffmpegPath from '@ffmpeg-installer/ffmpeg';

const prisma = new PrismaClient();
ffmpeg.setFfmpegPath(ffmpegPath.path);

// ===== CONFIGURAÇÃO CRÍTICA (Herdada do V2.4) =====
const MAX_CONCURRENT_DOWNLOADS = 3;
const MAX_CONCURRENT_ENCODINGS = 1;
const PROCESSING_INTERVAL = 5000;
const PROGRESS_UPDATE_INTERVAL = 2000;
const MIN_PROGRESS_DELTA = 2;
const MIN_UPDATE_INTERVAL = 5000;
const SEED_DURATION_MINUTES = 30;
const MAX_ACTIVE_SEEDS = 5;
const FFMPEG_THREADS = 2;
const MAX_ENCODING_QUEUE_BEFORE_THROTTLE = 3;

// Estados internos
let dynamicMaxDownloads = MAX_CONCURRENT_DOWNLOADS;
let activeEncodings = 0;
const encodingQueue: { videoId: string; inputPath: string; outputDir: string; downloadPath: string; resolve: () => void; reject: (err: any) => void }[] = [];
let isProcessingEncodingQueue = false;
const lastUpdateCache = new Map<string, { progress: number; timestamp: number }>();
const activeSeeds = new Map<string, { torrent: any; startedAt: Date }>();
const activeTorrents = new Map<string, any>(); // Cache de performance

// Cliente WebTorrent Singleton
let client: any = null;

async function getWebTorrentClient() {
    if (!client) {
        // @ts-ignore
        const webtorrentModule = await (new Function('return import("webtorrent")')());
        const WebTorrent = webtorrentModule.default;
        client = new WebTorrent();
    }
    return client;
}

/**
 * 🎯 MATERIALIZE VIDEO (API PÚBLICA ÚNICA)
 * Transforma um Video existente no catálogo em um Video físico.
 */
export async function materializeVideo(videoId: string, magnetURI: string, priority: number = 50): Promise<void> {
    console.log(`🧠 [MediaWorker] Ordem de materialização recebida: ${videoId}`);

    if (!videoId || !magnetURI) {
        throw new Error('VideoID e MagnetURI são obrigatórios para materialização.');
    }

    // 1. Validar existência e posse do ID
    const video = await prisma.video.findUnique({ where: { id: videoId } });
    if (!video) {
        throw new Error(`Video ${videoId} não encontrado no catálogo. Materialização abortada.`);
    }

    // 2. Extrair InfoHash
    const infoHash = extractInfoHash(magnetURI);

    // 3. Verificar se já está na fila de download
    const existingQueue = await prisma.downloadQueue.findUnique({ where: { videoId } });

    if (existingQueue) {
        if (existingQueue.status === 'COMPLETED') {
            console.log(`✨ [MediaWorker] Vídeo já materializado: ${videoId}`);
            // Garantir consistência do status do vídeo
            if (video.status !== 'READY') {
                await prisma.video.update({ where: { id: videoId }, data: { status: 'READY' } });
            }
            return;
        }
        console.log(`♻️ [MediaWorker] Já está na fila de download. Atualizando prioridade.`);
        await prioritizeDownload(videoId, priority + 10);
        return;
    }

    // 4. Mudar Status para PROCESSING (Atomicidade Conceitual)
    if (video.status === 'CATALOG' || video.status === 'WAITING' || video.status === 'FAILED') {
        await prisma.video.update({
            where: { id: videoId },
            data: {
                status: 'PROCESSING',
                materializationRequestedAt: new Date()
            } as any
        });
    }

    // 5. Criar entrada na Fila de Execução (DownloadQueue)
    await prisma.downloadQueue.create({
        data: {
            videoId: video.id, // Vínculo forte: Primary Key
            magnetURI,
            infoHash,
            status: 'QUEUED',
            priority
        }
    });

    console.log(`🚀 [MediaWorker] Job enfileirado com sucesso: ${videoId}`);

    // trigger processamento
    processQueue().catch(err => console.error('❌ [MediaWorker] Cycle Error:', err));
}

/**
 * 🔄 PROCESSOR LOOP (MOTOR DE EXECUÇÃO)
 */
async function processQueue() {
    // 1. Verificar Backpressure (Encoding Queue)
    if (encodingQueue.length > MAX_ENCODING_QUEUE_BEFORE_THROTTLE) {
        dynamicMaxDownloads = Math.max(1, MAX_CONCURRENT_DOWNLOADS - 1);
    } else {
        dynamicMaxDownloads = MAX_CONCURRENT_DOWNLOADS;
    }

    // 2. Verificar Slots de Download
    const activeCount = await prisma.downloadQueue.count({
        where: { status: 'DOWNLOADING' }
    });

    if (activeCount >= dynamicMaxDownloads) return;

    // 3. Pegar próximo job (Prioridade > FIFO)
    const next = await prisma.downloadQueue.findFirst({
        where: { status: 'QUEUED' },
        orderBy: [
            { priority: 'desc' },
            { queuedAt: 'asc' }
        ]
    });

    if (!next) return;

    // 4. Iniciar Execução
    await startDownloadExecution(next.id);

    // Recursão suave
    setTimeout(() => processQueue(), 1000);
}

/**
 * 📥 EXECUTOR DE DOWNLOAD FÍSICO
 */
async function startDownloadExecution(queueId: string) {
    const download = await prisma.downloadQueue.findUnique({ where: { id: queueId } });
    if (!download) return;

    // Travar status
    await prisma.downloadQueue.update({
        where: { id: queueId },
        data: { status: 'DOWNLOADING', startedAt: new Date() }
    });

    try {
        await executeWebTorrent(download);
    } catch (err: any) {
        console.error(`❌ [MediaWorker] Falha no download ${download.videoId}:`, err);

        // Marcar falha na fila
        await prisma.downloadQueue.update({
            where: { id: queueId },
            data: { status: 'FAILED', error: err.message }
        });

        // Refletir falha no objeto Video
        await prisma.video.update({
            where: { id: download.videoId },
            data: { status: 'FAILED' }
        });
    }
}

/**
 * 🕸️ WEBTORRENT ENGINE
 */
async function executeWebTorrent(download: any) {
    const { videoId, magnetURI } = download;
    const downloadPath = path.join(process.cwd(), 'downloads', videoId);
    const uploadsPath = path.join(process.cwd(), 'uploads');
    const hlsPath = path.join(uploadsPath, 'hls', videoId);

    // Preparar terreno
    await fs.mkdir(downloadPath, { recursive: true });
    await fs.mkdir(hlsPath, { recursive: true });

    const wtClient = await getWebTorrentClient();

    return new Promise<void>((resolve, reject) => {
        console.log(`⚡ [MediaWorker] Iniciando engine WebTorrent: ${videoId}`);

        wtClient.add(magnetURI, { path: downloadPath }, async (torrent: any) => {
            console.log(`✅ [MediaWorker] Metadata recebido: ${torrent.name}`);

            // Priorização de streaming (Início do arquivo)
            torrent.files.forEach((file: any) => {
                if (isVideoFile(file.name)) {
                    file.select(0);
                }
            });

            activeTorrents.set(videoId, torrent);

            // Atualizar metadados físicos
            await prisma.downloadQueue.update({
                where: { videoId },
                data: {
                    infoHash: torrent.infoHash,
                    totalSize: torrent.length / 1024 / 1024,
                    fileName: torrent.name
                }
            });

            // Encontrar vídeo principal
            const videoFile = torrent.files.find((f: any) => f.name.match(/\.(mp4|mkv|webm|avi|mov)$/i))
                || torrent.files.sort((a: any, b: any) => b.length - a.length)[0];

            if (!videoFile) {
                reject(new Error('Nenhum arquivo de vídeo encontrado no torrent.'));
                return;
            }

            // Loop de Progresso
            const progressInterval = setInterval(async () => {
                const progress = Math.round(torrent.progress * 100);
                const downloadSpeed = torrent.downloadSpeed / 1024;
                const uploadSpeed = torrent.uploadSpeed / 1024;
                const remaining = torrent.length * (1 - torrent.progress);
                const rawEta = downloadSpeed > 0 ? Math.round(remaining / downloadSpeed / 1024) : 0;
                const eta = Number.isFinite(rawEta)
                    ? Math.max(0, Math.min(rawEta, 2147483647))
                    : 0;

                // Throttling de DB updates
                const lastUpdate = lastUpdateCache.get(videoId);
                const now = Date.now();

                if (!lastUpdate || (now - lastUpdate.timestamp >= MIN_UPDATE_INTERVAL) || (progress - lastUpdate.progress >= MIN_PROGRESS_DELTA)) {
                    await prisma.downloadQueue.update({
                        where: { videoId },
                        data: {
                            progress,
                            downloadSpeed,
                            uploadSpeed,
                            peers: torrent.wires.length,
                            eta
                        }
                    });
                    lastUpdateCache.set(videoId, { progress, timestamp: now });
                }

            }, PROGRESS_UPDATE_INTERVAL);

            // COMPLETED
            torrent.on('done', async () => {
                clearInterval(progressInterval);
                console.log(`🏁 [MediaWorker] Download físico concluído: ${videoId}`);

                // Mover para Processing (Encoding)
                await prisma.downloadQueue.update({ where: { videoId }, data: { status: 'PROCESSING', progress: 100 } });

                try {
                    const srcPath = path.join(downloadPath, videoFile.path);
                    const destPath = path.join(uploadsPath, `${videoId}.mp4`);

                    // Cópia atômica (ou quase)
                    await fs.copyFile(srcPath, destPath);

                    // Adicionar à fila de Encoding
                    await new Promise<void>((resolveEncode, rejectEncode) => {
                        encodingQueue.push({
                            videoId,
                            inputPath: destPath,
                            outputDir: hlsPath,
                            downloadPath,
                            resolve: resolveEncode, // Callback de sucesso
                            reject: rejectEncode
                        });
                        processEncodingQueue();
                    });

                    // FINALIZAÇÃO DE SUCESSO
                    // Aqui atualizamos o Video principal com o resultado final
                    await prisma.video.update({
                        where: { id: videoId },
                        data: {
                            status: 'READY',
                            storageKey: destPath,
                            hlsPath: `hls/${videoId}/index.m3u8`,
                            originalFilename: videoFile.name,
                            fileSize: torrent.length / 1024 / 1024,
                            quality: '1080p' // Assumido por padrão, futuro: ffprobe
                        }
                    });

                    await prisma.downloadQueue.update({
                        where: { videoId },
                        data: { status: 'COMPLETED', completedAt: new Date() }
                    });

                    console.log(`✨ [MediaWorker] Ciclo completo! Vídeo READY: ${videoId}`);

                    // Cleanup & Seeding
                    cleanupDownloadFolder(downloadPath);
                    handleSeeding(videoId, torrent, magnetURI);

                    activeTorrents.delete(videoId);
                    resolve();

                } catch (err: any) {
                    reject(err);
                }
            });

            torrent.on('error', (err: Error) => {
                clearInterval(progressInterval);
                reject(err);
            });
        });
    });
}

/**
 * 🏭 FILA DE ENCODING (CPU BOUND)
 */
async function processEncodingQueue() {
    if (isProcessingEncodingQueue || encodingQueue.length === 0 || activeEncodings >= MAX_CONCURRENT_ENCODINGS) return;

    isProcessingEncodingQueue = true;

    while (encodingQueue.length > 0 && activeEncodings < MAX_CONCURRENT_ENCODINGS) {
        const job = encodingQueue.shift();
        if (!job) break;

        activeEncodings++;
        console.log(`🎬 [MediaWorker] Encoding iniciado: ${job.videoId}`);

        try {
            await convertToHLS(job.inputPath, job.outputDir);
            job.resolve();
        } catch (err) {
            job.reject(err);
        } finally {
            activeEncodings--;
        }
    }
    isProcessingEncodingQueue = false;
    if (encodingQueue.length > 0) processEncodingQueue(); // Continue
}

/**
 * 🎞️ FFMPEG HLS CONVERTER
 */
function convertToHLS(inputPath: string, outputDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .outputOptions([
                '-codec copy', // V3.0: Copy é mais rápido e preserva qualidade original
                '-start_number 0',
                '-hls_time 10',
                '-hls_list_size 0',
                '-f hls'
            ])
            .output(path.join(outputDir, 'index.m3u8'))
            .on('end', () => resolve())
            .on('error', (err) => reject(err))
            .run();
    });
}

/**
 * 🌱 SEEDING STRATEGY
 */
async function handleSeeding(videoId: string, torrent: any, magnetURI: string) {
    if (activeSeeds.size >= MAX_ACTIVE_SEEDS) {
        torrent.destroy();
        return;
    }

    const seedUntil = new Date(Date.now() + SEED_DURATION_MINUTES * 60 * 1000);
    activeSeeds.set(videoId, { torrent, startedAt: new Date() });

    // Persistir estado de seed
    await prisma.seedState.upsert({
        where: { videoId },
        create: { videoId, infoHash: torrent.infoHash, magnetURI, seedUntil, isActive: true },
        update: { seedUntil, isActive: true }
    });

    console.log(`🌱 [MediaWorker] Seeding ativo por ${SEED_DURATION_MINUTES}min: ${videoId}`);

    setTimeout(async () => {
        if (activeSeeds.has(videoId)) {
            torrent.destroy();
            activeSeeds.delete(videoId);
            await prisma.seedState.update({ where: { videoId }, data: { isActive: false } }).catch(() => { });
        }
    }, SEED_DURATION_MINUTES * 60 * 1000);
}

// Helpers
function extractInfoHash(magnetURI: string): string {
    const match = magnetURI.match(/xt=urn:btih:([a-zA-Z0-9]+)/);
    return match ? match[1] : '';
}

function isVideoFile(filename: string): boolean {
    return /\.(mp4|mkv|avi|mov|wmv|flv|webm)$/i.test(filename);
}

function cleanupDownloadFolder(path: string) {
    fs.rm(path, { recursive: true, force: true }).catch(err => console.warn(`Cleanup failed: ${err}`));
}

// Exportações de Controle
export async function prioritizeDownload(videoId: string, priority: number) {
    await prisma.downloadQueue.update({ where: { videoId }, data: { priority } });
}

export async function cancelMaterialization(videoId: string) {
    const torrent = activeTorrents.get(videoId);
    if (torrent) torrent.destroy();

    await prisma.downloadQueue.update({
        where: { videoId },
        data: { status: 'FAILED', error: 'Cancelado manualmente' }
    });

    // Reverter vídeo para FAILED ou CATALOG? FAILED é mais seguro.
    await prisma.video.update({ where: { id: videoId }, data: { status: 'FAILED' } });
}

export async function getWorkerStatus(videoId: string) {
    return prisma.downloadQueue.findUnique({ where: { videoId } });
}

// Init
console.log('👷 [MediaWorker] V3.0 Online e pronto para ordens.');
processQueue(); // Loop inicial
