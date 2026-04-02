/**
 * 🚀 TORRENT DOWNLOADER V2.4 - O SISTEMA QUE NÃO MORRE (Media Orchestrator)
 * 
 * Correções de Engenharia de Guerra:
 * ✅ BOMBA 1: Fila de ingestão (MAX_CONCURRENT_DOWNLOADS)
 * ✅ BOMBA 2: Reencoding seguro (libx264 + aac)
 * ✅ BOMBA 3: Operações assíncronas (sem sync)
 * ✅ BOMBA 4: Banco como fonte de verdade (não RAM)
 * 
 * 🔥 BOMBAS SILENCIOSAS RESOLVIDAS (V2.1):
 * ✅ BOMBA 5: Separação Download/Encoding (CPU Protection)
 * ✅ BOMBA 6: Limpeza automática de disco
 * ✅ BOMBA 7: Detecção de torrents STALLED
 * ✅ BOMBA 8: Recovery on startup
 * 
 * 💣 BOMBAS AVANÇADAS RESOLVIDAS (V2.2):
 * ✅ BOMBA A: Throttling de escrita no banco (delta-based updates)
 * ✅ BOMBA B: Fila real de encoding (event-driven, não polling)
 * ✅ BOMBA C: Estratégia de seeding (manter seed por X minutos)
 * ✅ BOMBA D: Persistência de estado parcial (já via recovery)
 * ✅ BOMBA E: Limitação de threads FFmpeg
 * 
 * 🧠 Inteligência Avançada:
 * - Coleta de timing (startedAt, completedAt, processingTime)
 * - Previsão de disponibilidade (ETA)
 * - Priorização por demanda + saúde do swarm
 * - Orquestração de rede P2P
 * - Índice de Raridade para preservação de conteúdo
 */

// @ts-ignore
// Removed static import to fix ESM require issue
// import WebTorrent from 'webtorrent';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs/promises';
import ffmpeg from 'fluent-ffmpeg';
// @ts-ignore
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import { updateSwarmHealth } from './intelligence-engine';
import { SystemTelemetry } from './services/system-telemetry';
import { AddonService } from './services/addon.service';

const prisma = new PrismaClient();
ffmpeg.setFfmpegPath(ffmpegPath.path);

// ===== CONFIGURAÇÃO CRÍTICA =====
const MAX_CONCURRENT_DOWNLOADS = 3; // BOMBA 1 RESOLVIDA
const MAX_CONCURRENT_ENCODINGS = 1; // 🔥 BOMBA 5: Encoding separado (CPU intensive)
const PROCESSING_INTERVAL = 5000; // 5s
const PROGRESS_UPDATE_INTERVAL = 2000; // 2s
const STALL_TIMEOUT_MINUTES = 10; // 🔥 BOMBA 7: Timeout para marcar como STALLED
const STALL_MIN_PROGRESS = 5; // Progresso mínimo esperado em STALL_TIMEOUT_MINUTES
const ZERO_PEER_FALLBACK_MINUTES = 2; // Tenta trocar a fonte antes de desistir
const MAX_ETA_SECONDS = 2147483647; // Limite seguro para INT no banco atual
const EXTRA_TRACKERS = [
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://tracker.openbittorrent.com:6969/announce',
    'udp://tracker.torrent.eu.org:451/announce',
    'udp://open.stealth.si:80/announce',
    'wss://tracker.openwebtorrent.com',
    'wss://tracker.btorrent.xyz',
];

// 💣 BOMBA A: Throttling de escrita (só atualiza se mudou significativamente)
const MIN_PROGRESS_DELTA = 2; // Só atualiza banco se progresso mudou >= 2%
const MIN_UPDATE_INTERVAL = 5000; // Mínimo 5s entre updates no banco

// 💣 BOMBA C: Estratégia de seeding
const SEED_DURATION_MINUTES = 30; // Manter seed por 30 minutos após download
const MAX_ACTIVE_SEEDS = 5; // Máximo de seeds simultâneos

// 💣 BOMBA E: Limitação de threads FFmpeg
const FFMPEG_THREADS = 2; // Limitar FFmpeg a 2 threads

// 🔴 PROBLEMA INVISÍVEL #1: Gestão de armazenamento (CDN Cache Policy)
const MAX_STORAGE_GB = 100; // Limite máximo de armazenamento em GB

// 🔴 V2.4: Política de retenção inteligente (views + recência)
const MIN_VIEWS_TO_KEEP = 3; // Mínimo de views para não ser removido
const MAX_AGE_DAYS_UNWATCHED = 30; // Remover vídeos não assistidos após X dias

// 🔴 V2.4: Backpressure control (encoding queue pressure)
const MAX_ENCODING_QUEUE_BEFORE_THROTTLE = 3; // Se encoding queue > 3, reduzir downloads
let dynamicMaxDownloads = MAX_CONCURRENT_DOWNLOADS;

// 🔴 PROBLEMA INVISÍVEL #2: Batch processing para reduzir pressão no event loop
const SWARM_BATCH_INTERVAL = 10000; // Enviar dados de swarm a cada 10s (batch)
const swarmDataBuffer: Array<{ infoHash: string; peers: number; seeds: number; speed: number; videoId: string }> = [];

// 🔴 V2.4: Contador global de storage (evita I/O pesado)
let cachedStorageUsedMB = 0;
let lastStorageCalculation = 0;

// Contadores para controle de concorrência
let activeEncodings = 0;

// 💣 BOMBA B: Fila real de encoding (event-driven)
const encodingQueue: { videoId: string; inputPath: string; outputDir: string; downloadPath: string; resolve: () => void; reject: (err: any) => void }[] = [];
let isProcessingEncodingQueue = false;

// 💣 BOMBA A: Cache de último update para throttling
const lastUpdateCache = new Map<string, { progress: number; timestamp: number }>();

// 💣 BOMBA C: Seeds ativos
const activeSeeds = new Map<string, { torrent: any; startedAt: Date }>();
const attemptedFallbackHashes = new Map<string, Set<string>>();

// Cliente WebTorrent global (carregado dinamicamente)
let client: any = null;
let isShuttingDown = false; // 🛡️ Flag de parada global

export async function getWebTorrentClient() {
    if (!client) {
        // @ts-ignore
        // Hack para evitar que o ts-node converta import() em require()
        const webtorrentModule = await (new Function('return import("webtorrent")')());
        const WebTorrent = webtorrentModule.default;
        client = new WebTorrent({
            tracker: {
                // Add common trackers
                announce: [
                    'wss://tracker.openwebtorrent.com',
                    'wss://tracker.btorrent.xyz',
                    'wss://tracker.files.fm:7073/announce',
                    'udp://tracker.opentrackr.org:1337/announce',
                    'udp://tracker.openbittorrent.com:6969/announce'
                ]
            }
        });

        // Setup DHT listeners
        client.on('error', (err: any) => console.error('🔴 [WebTorrent] Error:', err.message));
        client.on('warning', (err: any) => console.warn('🟠 [WebTorrent] Warning:', err.message));
    }
    return client;
}

// 🛡️ V3.0: FSM & RESILIENCY (INDUSTRIAL GRADE)
export enum DownloadState {
    QUEUED = 'QUEUED',
    CONNECTING = 'CONNECTING', // Buscando peers/metadata
    DOWNLOADING = 'DOWNLOADING', // Baixando payload
    PAUSED = 'PAUSED',
    PROCESSING = 'PROCESSING', // Pós-download (move vari)
    TRANSCODING = 'TRANSCODING', // FFmpeg HLS
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
    READY = 'READY' // Final state in Video model
}

/**
 * 🛡️ INICIALIZAÇÃO INDUSTRIAL
 * Verifica integridade, limpa zumbis e prepara o terreno.
 */
export async function initDownloader() {
    console.log('🏭 [Init] Inicializando Torrent Downloader V2.4 (Industrial)...');

    try {
        // await recoverZombieJobs();
        await recoverZombieJobsEnterprise(); // V3.0 Industrial Recovery
        await fs.mkdir(path.join(process.cwd(), 'downloads'), { recursive: true });
        await fs.mkdir(path.join(process.cwd(), 'uploads', 'hls'), { recursive: true });

        // Iniciar loop de processamento
        processQueue().catch(err => console.error('❌ [Queue] Fatal Error:', err));

        console.log('✅ [Init] Sistema pronto e blindado.');
    } catch (error) {
        console.error('❌ [Init] Falha crítica na inicialização:', error);
        process.exit(1); // Fail fast
    }
}

/**
 * 🧟 RECOVERY DE JOBS ZUMBIS
 * Detecta downloads que morreram no meio (ex: crash do servidor) e os recupera.
 */
async function recoverZombieJobs() {
    console.log('🚑 [Recovery] Buscando jobs zumbis...');

    // Buscar jobs que não estão terminais
    const zombies = await prisma.downloadQueue.findMany({
        where: {
            status: {
                notIn: ['COMPLETED', 'FAILED', 'QUEUED', 'READY']
            }
        }
    });

    if (zombies.length === 0) {
        console.log('✨ [Recovery] Nenhum job zumbi encontrado. Sistema limpo.');
        return;
    }

    console.log(`⚠️ [Recovery] Encontrados ${zombies.length} jobs inconsistentes.`);

    for (const job of zombies) {
        // Lógica de Decisão de Recovery
        console.log(`🔄 [Recovery] Recuperando job ${job.id} (Status anterior: ${job.status})...`);

        // Se estava transcodificando, o arquivo temporário pode estar corrompido.
        // Melhor reiniciar o download para garantir integridade, a menos que tenhamos o arquivo full.
        // Para V2.5, vamos ser conservadores: RESET para QUEUED.

        await prisma.downloadQueue.update({
            where: { id: job.id },
            data: {
                status: 'QUEUED', // Volta pra fila
                progress: 0,
                error: 'System recovered from crash',
                updatedAt: new Date()
            }
        });

        // Limpeza de lixo (opcional, mas recomendada)
        const downloadPath = path.join(process.cwd(), 'downloads', job.videoId || '');
        try {
            await fs.rm(downloadPath, { recursive: true, force: true });
        } catch (_) { }
    }

    console.log('✅ [Recovery] Todos os jobs foram resetados para QUEUED.');
}

// ==========================================
// 🛠️ FUNÇÕES AUXILIARES
// ==========================================

// Cache de torrents ativos (apenas para performance, não é fonte de verdade)
const activeTorrents = new Map<string, any>();

interface DownloadRequest {
    magnetURI: string;
    userId: string;
    title: string;
    videoId?: string; // Opcional: usar vídeo já existente no banco
    description?: string;
    category?: string;
    priority?: number;
    fileIndex?: number; // V2.5: Permite escolher o arquivo específico (para séries)
}

/**
 * 🎯 ADICIONA DOWNLOAD À FILA (não inicia imediatamente)
 */
export async function queueDownload(request: DownloadRequest): Promise<{ videoId: string; position: number }> {
    const { magnetURI, userId, title, description, category, priority = 0 } = request;

    // Extrair infoHash do magnet
    const infoHash = extractInfoHash(magnetURI);

    // Verificar se já existe na fila
    const existing = await prisma.downloadQueue.findFirst({
        where: {
            infoHash,
            ...(request.fileIndex !== undefined && request.fileIndex !== null
                ? { fileIndex: request.fileIndex }
                : {}),
        }
    });

    if (existing) {
        return {
            videoId: existing.videoId,
            position: await getQueuePosition(existing.id)
        };
    }

    // Criar vídeo no banco se não fornecido
    let video;
    if (request.videoId) {
        video = await prisma.video.findUnique({ where: { id: request.videoId } });
        if (video) {
            // Atualizar status para garantir que o processador o perceba
            await prisma.video.update({
                where: { id: video.id },
                data: { status: 'PROCESSING' }
            });
        }
    }

    if (!video) {
        video = await prisma.video.create({
            data: {
                title,
                description: description || '',
                category: category || 'Geral',
                originalFilename: 'torrent-download',
                status: 'PROCESSING',
                userId
            }
        });
    }

    // Adicionar à fila stateful
    await prisma.downloadQueue.create({
        data: {
            videoId: video.id,
            magnetURI,
            infoHash,
            status: DownloadState.QUEUED,
            priority,
            fileIndex: request.fileIndex // V2.5: Persistir índice do arquivo
        }
    });

    const position = await getQueuePosition(video.id);

    console.log(`📋 [Queue] Adicionado: ${title} (posição ${position})`);

    // Processar fila (não-bloqueante)
    processQueue().catch(err => console.error('❌ [Queue] Erro:', err));

    return { videoId: video.id, position };
}

/**
 * 🔄 PROCESSA FILA (roda continuamente)
 */
async function processQueue() {
    if (isShuttingDown) return; // 🛡️ Abortar se estiver parando

    // Contar downloads ativos
    const activeCount = await prisma.downloadQueue.count({
        where: { status: DownloadState.DOWNLOADING }
    });

    // 🔴 V2.4: Backpressure control - reduzir downloads se encoding queue cheia
    if (encodingQueue.length > MAX_ENCODING_QUEUE_BEFORE_THROTTLE) {
        dynamicMaxDownloads = Math.max(1, MAX_CONCURRENT_DOWNLOADS - 1);
        console.log(`⚠️ [Backpressure] Encoding queue cheia (${encodingQueue.length}), reduzindo downloads para ${dynamicMaxDownloads}`);
    } else {
        dynamicMaxDownloads = MAX_CONCURRENT_DOWNLOADS;
    }

    if (activeCount >= dynamicMaxDownloads) {
        // console.log(`⏸️  [Queue] Limite atingido (${activeCount}/${dynamicMaxDownloads})`);
        return;
    }

    // Pegar próximo da fila (maior prioridade + mais antigo), respeitando Backoff
    const next = await prisma.downloadQueue.findFirst({
        where: {
            status: DownloadState.QUEUED,
            OR: [
                { nextRetryAt: null },
                { nextRetryAt: { lte: new Date() } }
            ]
        },
        orderBy: [
            { priority: 'desc' },
            { queuedAt: 'asc' }
        ]
    });

    if (!next) return;

    // 🔴 V2.5: Rarity-Based Prioritization
    if (next.infoHash) {
        try {
            const health = await prisma.swarmHealth.findUnique({ where: { contentHash: next.infoHash } });
            if (health && health.healthScore < 20) {
                console.log(`💎 [Rarity] Conteúdo raro detectado. Boosting priority.`);
                await prisma.downloadQueue.update({
                    where: { id: next.id },
                    data: { priority: { increment: 50 } }
                });
                processQueue();
                return;
            }
        } catch (_) { }
    }

    // Marcar como CONNECTING (Transição de Estado 1)
    await prisma.downloadQueue.update({
        where: { id: next.id },
        data: {
            status: DownloadState.CONNECTING,
            startedAt: new Date()
        }
    });

    console.log(`🚀 [Process] Iniciando job ${next.videoId}...`);

    // Iniciar download
    startDownload(next.id).catch(err => console.error('Error starting download wrapper', err));

    // Tentar processar mais um (concorrência)
    setTimeout(() => processQueue(), 1000);
}

/**
 * 📥 INICIA DOWNLOAD (chamado pela fila)
 */
async function startDownload(queueId: string) {
    const download = await prisma.downloadQueue.findUnique({
        where: { id: queueId }
    });

    if (!download) return;

    // Atualizar status
    await prisma.downloadQueue.update({
        where: { id: queueId },
        data: {
            status: DownloadState.DOWNLOADING,
            startedAt: new Date()
        }
    });

    // 📊 TELEMETRY START
    SystemTelemetry.trackDownloadStart();

    try {
        await downloadAndProcess(download);
    } catch (err: any) {
        // 🛡️ SMART RETRY LOGIC
        console.error(`❌ [Download] Erro ${download.videoId}:`, err);

        const currentRetry = download.retryCount || 0;
        const maxRetries = download.maxRetries || 3;

        // Se ainda tem tentativas, agenda retry
        if (currentRetry < maxRetries) {
            // Exponential Backoff: 30s, 60s, 120s...
            const delayMs = Math.pow(2, currentRetry) * 30000;
            const nextRetry = new Date(Date.now() + delayMs);

            console.warn(`♻️ [Retry] Job ${download.videoId} falhou. Tentativa ${currentRetry + 1}/${maxRetries}. Reagendando para ${nextRetry.toISOString()}`);
            SystemTelemetry.trackRetry(); // 📊 TELEMETRY RETRY

            await prisma.downloadQueue.update({
                where: { id: queueId },
                data: {
                    status: DownloadState.QUEUED,
                    retryCount: { increment: 1 },
                    nextRetryAt: nextRetry,
                    error: `Retry ${currentRetry + 1}: ${err.message}`,
                    updatedAt: new Date()
                }
            });
        } else {
            // Falha Definitiva (Give Up)
            console.error(`💀 [GiveUp] Job ${download.videoId} excedeu limites de retry (${maxRetries}). Marcando como FAILED.`);
            SystemTelemetry.trackDownloadFail(); // 📊 TELEMETRY FAIL

            await prisma.downloadQueue.update({
                where: { id: queueId },
                data: {
                    status: DownloadState.FAILED,
                    error: `Max retries reached: ${err.message}`,
                    completedAt: new Date()
                }
            });

            await prisma.video.update({
                where: { id: download.videoId },
                data: { status: 'FAILED' }
            });
        }
    }

    // Processar próximo da fila
    processQueue().catch(err => console.error('❌ [Queue] Erro:', err));
}

/**
 * 🎬 BAIXA E PROCESSA TORRENT
 */
async function downloadAndProcess(download: any) {
    const { videoId, magnetURI } = download;

    const downloadPath = path.join(process.cwd(), 'downloads', videoId);
    const uploadsPath = path.join(process.cwd(), 'uploads');
    const hlsPath = path.join(uploadsPath, 'hls', videoId);

    // Criar diretórios (BOMBA 3: async)
    await fs.mkdir(downloadPath, { recursive: true });
    await fs.mkdir(hlsPath, { recursive: true });

    const wtClient = await getWebTorrentClient();
    return new Promise<void>((resolve, reject) => {
        console.log(`📥 [Download] Iniciando: ${videoId}`);

        wtClient.add(magnetURI, { path: downloadPath }, async (torrent: any) => {
            console.log(`✅ [Torrent] Adicionado: ${torrent.name}`);

            // FSM: Atualizar para DOWNLOADING
            try {
                await prisma.downloadQueue.update({
                    where: { id: download.id },
                    data: { status: DownloadState.DOWNLOADING }
                });
            } catch (err) { console.error('Error updating status to DOWNLOADING', err); }

            // 🔴 V2.5: Otimização de Banda (Selective Download)
            if (download.fileIndex !== undefined && download.fileIndex !== null) {
                // Se temos um arquivo alvo, DESMARCA tudo primeiro
                console.log(`🎯 [Selective] Modo episódio único ativado. Desmarcando outros arquivos.`);
                torrent.files.forEach((file: any) => file.deselect());

                // Seleciona APENAS o arquivo alvo
                const targetFile = torrent.files[download.fileIndex];
                if (targetFile) {
                    console.log(`🎯 [Target] Baixando APENAS: ${targetFile.name}`);
                    targetFile.select();
                }
            } else {
                // Comportamento legado: Prioriza início de todos os vídeos
                torrent.files.forEach((file: any) => {
                    if (isVideoFile(file.name)) {
                        file.select(0);
                    }
                });
            }

            // Salvar referência
            activeTorrents.set(videoId, torrent);

            // Atualizar infoHash e metadata
            await prisma.downloadQueue.update({
                where: { videoId },
                data: {
                    infoHash: torrent.infoHash,
                    totalSize: torrent.length / 1024 / 1024, // MB
                    fileName: torrent.name
                }
            });

            // Encontrar arquivo de vídeo
            let videoFile;

            if (download.fileIndex !== undefined && download.fileIndex !== null) {
                videoFile = torrent.files[download.fileIndex];
            }

            if (!videoFile) {
                videoFile = torrent.files.find((f: any) =>
                    f.name.match(/\.(mp4|mkv|webm|avi|mov)$/i)
                ) || torrent.files.reduce((prev: any, curr: any) =>
                    prev.length > curr.length ? prev : curr
                );
            }

            if (!videoFile) {
                reject(new Error('Nenhum arquivo de vídeo encontrado'));
                return;
            }

            console.log(`🎬 [Video] Arquivo: ${videoFile.name}`);

            let isFinalizing = false;
            let progressInterval: NodeJS.Timeout | null = null;

            const getEffectiveProgress = () => {
                if (download.fileIndex !== undefined && download.fileIndex !== null && videoFile?.length) {
                    const fileProgress = Number(videoFile.downloaded || 0) / Number(videoFile.length || 1);
                    return Math.min(1, Math.max(0, fileProgress));
                }

                return Math.min(1, Math.max(0, Number(torrent.progress || 0)));
            };

            const isTargetFileReady = async () => {
                if (!videoFile) return false;

                const fileProgress = getEffectiveProgress();
                if (fileProgress < 0.999) {
                    return false;
                }

                const videoFilePath = path.join(downloadPath, videoFile.path);

                try {
                    const stats = await fs.stat(videoFilePath);
                    const expectedSize = Number(videoFile.length || 0);
                    if (!expectedSize) {
                        return stats.size > 0;
                    }

                    return stats.size >= Math.max(expectedSize - 1024, 1);
                } catch {
                    return false;
                }
            };

            const finalizeDownload = async (reason: string) => {
                if (isFinalizing) return;
                isFinalizing = true;

                if (progressInterval) {
                    clearInterval(progressInterval);
                }

                console.log(`✅ [Download] Completo: ${videoId} (${reason})`);

                // Atualizar status antes da cópia para refletir pós-download imediato.
                await prisma.downloadQueue.update({
                    where: { videoId },
                    data: {
                        status: 'PROCESSING',
                        progress: 100,
                        peers: torrent.wires.length,
                        seeds: torrent.wires.filter((w: any) => !w.peerChoking).length,
                        eta: 0,
                    }
                });

                try {
                    const videoFilePath = path.join(downloadPath, videoFile.path);
                    const finalVideoPath = path.join(uploadsPath, `${videoId}.mp4`);

                    await fs.copyFile(videoFilePath, finalVideoPath);
                    console.log(`📁 [File] Copiado: ${finalVideoPath}`);

                    await new Promise<void>((resolveEncode, rejectEncode) => {
                        encodingQueue.push({
                            videoId,
                            inputPath: finalVideoPath,
                            outputDir: hlsPath,
                            downloadPath,
                            resolve: resolveEncode,
                            reject: rejectEncode
                        });
                        processEncodingQueue();
                    });

                    const queueData = await prisma.downloadQueue.findUnique({
                        where: { videoId }
                    });

                    const processingTime = queueData?.startedAt
                        ? Math.round((Date.now() - queueData.startedAt.getTime()) / 1000)
                        : null;

                    await prisma.downloadQueue.update({
                        where: { videoId },
                        data: {
                            status: 'COMPLETED',
                            completedAt: new Date(),
                            processingTime,
                            progress: 100,
                            eta: 0,
                        }
                    });

                    await prisma.video.update({
                        where: { id: videoId },
                        data: {
                            status: 'READY',
                            originalFilename: videoFile.name,
                            storageKey: finalVideoPath,
                            hlsPath: path.join('hls', videoId, 'index.m3u8'),
                            fileSize: Number(videoFile.length || torrent.length || 0) / 1024 / 1024
                        }
                    });

                    attemptedFallbackHashes.delete(videoId);
                    console.log(`🎉 [Complete] Vídeo pronto: ${videoId} (${processingTime}s)`);

                    await cleanupDownloadFolder(downloadPath);

                    const seedUntil = new Date(Date.now() + SEED_DURATION_MINUTES * 60 * 1000);

                    if (activeSeeds.size < MAX_ACTIVE_SEEDS) {
                        activeSeeds.set(videoId, { torrent, startedAt: new Date() });
                        console.log(`🌱 [Seed] Mantendo seed por ${SEED_DURATION_MINUTES} minutos: ${videoId}`);

                        await prisma.seedState.upsert({
                            where: { videoId },
                            create: {
                                videoId,
                                infoHash: torrent.infoHash,
                                magnetURI: download.magnetURI,
                                seedUntil,
                                isActive: true
                            },
                            update: {
                                seedUntil,
                                isActive: true
                            }
                        });

                        setTimeout(async () => {
                            const seedInfo = activeSeeds.get(videoId);
                            if (seedInfo) {
                                seedInfo.torrent.destroy();
                                activeSeeds.delete(videoId);

                                await prisma.seedState.update({
                                    where: { videoId },
                                    data: { isActive: false }
                                }).catch(() => { });

                                console.log(`🛑 [Seed] Finalizado após ${SEED_DURATION_MINUTES}min: ${videoId}`);
                            }
                        }, SEED_DURATION_MINUTES * 60 * 1000);
                    } else {
                        torrent.destroy();
                        console.log(`⚠️ [Seed] Slots cheios, destruindo torrent: ${videoId}`);
                    }

                    activeTorrents.delete(videoId);
                    lastUpdateCache.delete(videoId);

                    if (processingTime) SystemTelemetry.trackDownloadSuccess(processingTime * 1000);

                    resolve();
                } catch (err: any) {
                    reject(err);
                }
            };

            // 📊 ATUALIZAR PROGRESSO (a cada 2s)
            progressInterval = setInterval(async () => {
                const progress = Math.round(getEffectiveProgress() * 100);
                const downloadSpeed = torrent.downloadSpeed / 1024; // KB/s
                const uploadSpeed = torrent.uploadSpeed / 1024; // KB/s

                // Calcular ETA
                const remainingBase = download.fileIndex !== undefined && download.fileIndex !== null
                    ? Number(videoFile.length || torrent.length || 0)
                    : Number(torrent.length || 0);
                const remaining = remainingBase * (1 - getEffectiveProgress());
                const eta = sanitizeEtaSeconds(downloadSpeed > 0 ? (remaining / downloadSpeed / 1024) : null);

                // Contar peers reais (usando wires) - CORREÇÃO do agente
                const realPeers = torrent.wires.length;
                // Seeds reais = peers que não estão choked
                const realSeeds = torrent.wires.filter((w: any) => !w.peerChoking).length;

                // 💣 BOMBA A: Throttling de escrita no banco
                const lastUpdate = lastUpdateCache.get(videoId);
                const now = Date.now();
                const shouldUpdate = !lastUpdate ||
                    (progress - lastUpdate.progress >= MIN_PROGRESS_DELTA) ||
                    (now - lastUpdate.timestamp >= MIN_UPDATE_INTERVAL);

                if (shouldUpdate) {
                    await prisma.downloadQueue.update({
                        where: { videoId },
                        data: {
                            progress,
                            downloadSpeed,
                            uploadSpeed,
                            peers: realPeers,
                            seeds: realSeeds,
                            eta
                        }
                    });
                    lastUpdateCache.set(videoId, { progress, timestamp: now });
                }

                // 🔴 PROBLEMA INVISÍVEL #2: Buffer swarm data (não await pesado no interval)
                swarmDataBuffer.push({
                    infoHash: torrent.infoHash,
                    peers: realPeers,
                    seeds: realSeeds,
                    speed: downloadSpeed,
                    videoId
                });

                console.log(
                    `📊 [Progress] ${videoId}: ${progress}% | ` +
                    `↓${(downloadSpeed / 1024).toFixed(2)} MB/s | ` +
                    `↑${(uploadSpeed / 1024).toFixed(2)} MB/s | ` +
                    `Peers: ${realPeers} | ETA: ${eta ? `${eta}s` : '?'}` 
                );

                if (download.fileIndex !== undefined && download.fileIndex !== null && await isTargetFileReady()) {
                    await finalizeDownload('target-file-ready');
                }
            }, PROGRESS_UPDATE_INTERVAL);

            // ✅ DOWNLOAD COMPLETO
            torrent.on('done', async () => {
                await finalizeDownload('torrent-done');
            });

            torrent.on('error', (err: Error) => {
                if (progressInterval) {
                    clearInterval(progressInterval);
                }
                reject(err);
            });
        });
    });
}

/**
 * 💣 BOMBA B: PROCESSADOR DE FILA DE ENCODING (event-driven)
 */
async function processEncodingQueue(): Promise<void> {
    if (isProcessingEncodingQueue) return;
    if (encodingQueue.length === 0) return;
    if (activeEncodings >= MAX_CONCURRENT_ENCODINGS) return;

    isProcessingEncodingQueue = true;

    while (encodingQueue.length > 0 && activeEncodings < MAX_CONCURRENT_ENCODINGS) {
        const job = encodingQueue.shift();
        if (!job) break;

        activeEncodings++;
        console.log(`🎬 [Encoding] Iniciando ${job.videoId} (${activeEncodings}/${MAX_CONCURRENT_ENCODINGS})`);

        try {
            await convertToHLSSafe(job.inputPath, job.outputDir);
            console.log(`✅ [Encoding] Finalizado ${job.videoId} (${activeEncodings - 1}/${MAX_CONCURRENT_ENCODINGS})`);
            job.resolve();
        } catch (err: any) {
            console.error(`❌ [Encoding] Erro ${job.videoId}:`, err.message);
            job.reject(err);
        } finally {
            activeEncodings--;
        }
    }

    isProcessingEncodingQueue = false;

    // Se ainda tem jobs na fila, continuar processando
    if (encodingQueue.length > 0) {
        setImmediate(() => processEncodingQueue());
    }
}

/**
 * 🧹 BOMBA 6: LIMPEZA AUTOMÁTICA DE DISCO
 */
async function cleanupDownloadFolder(downloadPath: string): Promise<void> {
    try {
        await fs.rm(downloadPath, { recursive: true, force: true });
        console.log(`🧹 [Cleanup] Pasta removida: ${downloadPath}`);
    } catch (err: any) {
        console.warn(`⚠️ [Cleanup] Falha ao limpar: ${err.message}`);
    }
}

/**
 * 🔄 CONVERTE PARA HLS (BOMBA 2: REENCODING SEGURO)
 */
function convertToHLSSafe(inputPath: string, outputDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
        console.log(`🔄 [HLS] Convertendo: ${inputPath}`);

        ffmpeg(inputPath)
            .outputOptions([
                // BOMBA 2 RESOLVIDA: Reencoding para compatibilidade universal
                '-c:v', 'libx264',      // Codec de vídeo universal
                '-c:a', 'aac',          // Codec de áudio universal
                '-preset', 'veryfast',  // Velocidade vs qualidade
                '-crf', '23',           // Qualidade (18-28, menor = melhor)
                '-threads', String(FFMPEG_THREADS), // 💣 BOMBA E: Limitar threads
                '-start_number', '0',
                '-hls_time', '10',
                '-hls_list_size', '0',
                '-f', 'hls'
            ])
            .output(path.join(outputDir, 'index.m3u8'))
            .on('progress', (progress) => {
                if (progress.percent) {
                    console.log(`🔄 [HLS] Progresso: ${Math.round(progress.percent)}%`);
                }
            })
            .on('end', () => {
                console.log('✅ [HLS] Conversão completa');
                resolve();
            })
            .on('error', (err) => {
                console.error('❌ [HLS] Erro:', err);
                reject(err);
            })
            .run();
    });
}

/**
 * 📊 OBTÉM STATUS DE DOWNLOAD (do banco, não da RAM)
 */
export async function getDownloadStatus(videoId: string) {
    const download = await prisma.downloadQueue.findUnique({
        where: { videoId }
    });

    if (!download) return null;

    const video = await prisma.video.findUnique({
        where: { id: videoId },
        select: { title: true, status: true }
    });

    return {
        videoId: download.videoId,
        title: video?.title,
        status: download.status,
        progress: download.progress,
        downloadSpeed: download.downloadSpeed,
        uploadSpeed: download.uploadSpeed,
        peers: download.peers,
        seeds: download.seeds,
        eta: download.eta,
        queuedAt: download.queuedAt,
        startedAt: download.startedAt,
        completedAt: download.completedAt,
        processingTime: download.processingTime,
        error: download.error
    };
}

/**
 * 📋 LISTA TODOS OS DOWNLOADS (do banco)
 */
export async function listAllDownloads(status?: string) {
    const where = status ? { status } : {};

    const downloads = await prisma.downloadQueue.findMany({
        where,
        orderBy: [
            { priority: 'desc' },
            { queuedAt: 'asc' }
        ]
    });

    const videoIds = downloads.map(d => d.videoId);
    const videos = await prisma.video.findMany({
        where: { id: { in: videoIds } },
        select: { id: true, title: true, status: true }
    });

    const videoMap = new Map(videos.map(v => [v.id, v]));

    return downloads.map(d => ({
        videoId: d.videoId,
        title: videoMap.get(d.videoId)?.title,
        status: d.status,
        progress: d.progress,
        priority: d.priority,
        queuedAt: d.queuedAt,
        eta: d.eta
    }));
}

/**
 * 🛑 CANCELA DOWNLOAD
 */
export async function cancelDownload(videoId: string): Promise<void> {
    attemptedFallbackHashes.delete(videoId);
    const download = await prisma.downloadQueue.findUnique({
        where: { videoId }
    });

    if (!download) {
        throw new Error('Download não encontrado');
    }

    // Destruir torrent se estiver ativo
    const torrent = activeTorrents.get(videoId);
    if (torrent) {
        torrent.destroy();
        activeTorrents.delete(videoId);
    }

    // Atualizar banco
    await prisma.downloadQueue.update({
        where: { videoId },
        data: {
            status: 'FAILED',
            error: 'Cancelado pelo usuário'
        }
    });

    await prisma.video.update({
        where: { id: videoId },
        data: { status: 'FAILED' }
    });

    console.log(`🛑 [Cancel] Download cancelado: ${videoId}`);
}

/**
 * 🎯 PRIORIZA DOWNLOAD (move para frente da fila)
 */
export async function prioritizeDownload(videoId: string, priority: number = 100): Promise<void> {
    await prisma.downloadQueue.update({
        where: { videoId },
        data: { priority }
    });

    console.log(`⬆️ [Priority] ${videoId} → ${priority}`);
}

/**
 * 🧠 BOOST DE DEMANDA (Netflix thinking)
 * Quando um usuário tenta assistir algo que ainda está baixando,
 * aumentamos a prioridade automaticamente.
 */
export async function boostDemand(videoId: string, demandType: 'PLAY_ATTEMPT' | 'SEARCH' | 'FAVORITE' = 'PLAY_ATTEMPT'): Promise<void> {
    const download = await prisma.downloadQueue.findUnique({
        where: { videoId }
    });

    if (!download || download.status === 'COMPLETED') return;

    // Boost baseado no tipo de demanda
    const boostValues = {
        'PLAY_ATTEMPT': 50,  // Usuário tentou assistir
        'SEARCH': 10,        // Apareceu em busca
        'FAVORITE': 30       // Usuário favoritou
    };

    const newPriority = Math.min(100, download.priority + boostValues[demandType]);

    await prisma.downloadQueue.update({
        where: { videoId },
        data: { priority: newPriority }
    });

    console.log(`🔥 [Demand] ${demandType} boost: ${videoId} → ${newPriority}`);
}

/**
 * 🎞️ VERIFICA SE É ARQUIVO DE VÍDEO
 */
function isVideoFile(filename: string): boolean {
    const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm'];
    return videoExtensions.some(ext => filename.toLowerCase().endsWith(ext));
}

/**
 * 📍 POSIÇÃO NA FILA
 */
async function getQueuePosition(videoId: string): Promise<number> {
    const download = await prisma.downloadQueue.findUnique({
        where: { videoId }
    });

    if (!download) return -1;

    const ahead = await prisma.downloadQueue.count({
        where: {
            status: 'QUEUED',
            OR: [
                { priority: { gt: download.priority } },
                {
                    priority: download.priority,
                    queuedAt: { lt: download.queuedAt }
                }
            ]
        }
    });

    return ahead + 1;
}

/**
 * 🔍 EXTRAI INFOHASH DO MAGNET
 */
function extractInfoHash(magnetURI: string): string {
    const match = magnetURI.match(/btih:([a-f0-9]{40})/i);
    return match ? match[1].toLowerCase() : '';
}

function sanitizeEtaSeconds(eta: number | null): number | null {
    if (eta === null || !Number.isFinite(eta)) return null;
    if (eta < 0) return null;
    return Math.min(Math.round(eta), MAX_ETA_SECONDS);
}

function normalizeTrackerSources(rawSources: unknown): string[] {
    const sources = Array.isArray(rawSources) ? rawSources : [];
    const trackers = new Set<string>();

    for (const source of sources) {
        const value = String(source || '').trim();
        if (!value) continue;

        if (value.startsWith('tracker:')) {
            trackers.add(value.slice('tracker:'.length));
            continue;
        }

        if (/^(udp|ws|wss):\/\//i.test(value)) {
            trackers.add(value);
        }
    }

    for (const tracker of EXTRA_TRACKERS) {
        trackers.add(tracker);
    }

    return [...trackers];
}

function buildEnrichedMagnetURI(params: {
    magnetURI?: string | null;
    infoHash?: string | null;
    sources?: unknown;
}): string | null {
    const normalizedInfoHash = String(params.infoHash || '').trim().toLowerCase();
    const baseMagnet = String(params.magnetURI || '').trim();
    const initialMagnet = baseMagnet || (normalizedInfoHash ? `magnet:?xt=urn:btih:${normalizedInfoHash}` : '');

    if (!initialMagnet.startsWith('magnet:?')) {
        return null;
    }

    const parts = initialMagnet.split('&').filter(Boolean);
    const existingTrackers = new Set<string>();

    for (const part of parts) {
        if (!part.startsWith('tr=')) continue;
        try {
            existingTrackers.add(decodeURIComponent(part.slice(3)));
        } catch {
            existingTrackers.add(part.slice(3));
        }
    }

    for (const tracker of normalizeTrackerSources(params.sources)) {
        if (!existingTrackers.has(tracker)) {
            parts.push(`tr=${encodeURIComponent(tracker)}`);
            existingTrackers.add(tracker);
        }
    }

    return parts.join('&');
}

function destroyActiveTorrent(videoId: string) {
    const torrent = activeTorrents.get(videoId);
    if (!torrent) return;

    try {
        torrent.destroy();
    } catch (error: any) {
        console.warn(`⚠️ [Stall] Falha ao destruir torrent ativo ${videoId}: ${error?.message || error}`);
    } finally {
        activeTorrents.delete(videoId);
    }
}

function getEpisodeSpecificityScore(stream: any, titleHint: string) {
    const normalize = (value?: string) =>
        String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();

    const haystack = normalize([
        stream?.title,
        stream?.name,
        stream?.description,
        stream?.behaviorHints?.filename,
    ].filter(Boolean).join(' '));
    const target = normalize(titleHint);
    const episodeMatch = target.match(/s(\d{2})e(\d{2})/i);

    let score = 0;
    if (episodeMatch) {
        const [, season, episode] = episodeMatch;
        const seasonNum = String(Number(season));
        const episodeNum = String(Number(episode));
        const exactEpisodePatterns = [
            new RegExp(`s${season}e${episode}`),
            new RegExp(`${seasonNum}x${episodeNum}`),
            new RegExp(`episodio\\s*${episodeNum}`),
            new RegExp(`episode\\s*${episodeNum}`),
        ];

        if (exactEpisodePatterns.some((pattern) => pattern.test(haystack))) {
            score += 120;
        }

        if (new RegExp(`e${episode}\\s*[-_]\\s*e?\\d{2}`).test(haystack) || new RegExp(`${seasonNum}x${episodeNum}\\s*[-_]\\s*\\d{1,2}`).test(haystack)) {
            score -= 60;
        }

        if (new RegExp(`s${season}(?!e${episode})`).test(haystack) || new RegExp(`season\\s*${seasonNum}`).test(haystack) || new RegExp(`temporada\\s*${seasonNum}`).test(haystack)) {
            score -= 10;
        }
    }

    if (/\bcomplete\b|\bcompleta\b|\btemporada\b|\bseason\b/.test(haystack)) {
        score -= 20;
    }

    if (/\bdual\b|\bdublado\b|\bpt-br\b/.test(haystack)) {
        score += 10;
    }

    return score;
}

function getSwarmScore(stream: any) {
    const haystack = `${stream?.title || ''} ${stream?.name || ''} ${stream?.description || ''}`;
    const matches = [...haystack.matchAll(/(?:👤|seed(?:s|ers?)?|peer(?:s)?)[^\d]{0,6}(\d{1,5})/gi)];
    if (!matches.length) return 0;

    return matches.reduce((best, match) => {
        const value = Number(match[1] || 0);
        return Number.isFinite(value) ? Math.max(best, value) : best;
    }, 0);
}

function parseAttemptedHashesFromError(error?: string | null) {
    const attempted = new Set<string>();
    const haystack = String(error || '');
    const markerMatch = haystack.match(/attempted=([a-f0-9,]+)/i);
    if (!markerMatch?.[1]) return attempted;

    for (const hash of markerMatch[1].split(',')) {
        const normalized = String(hash || '').trim().toLowerCase();
        if (/^[a-f0-9]{40}$/.test(normalized)) {
            attempted.add(normalized);
        }
    }

    return attempted;
}

function buildFallbackErrorMessage(addonName: string, attemptedHashes: Set<string>) {
    const serialized = [...attemptedHashes].filter(Boolean).join(',');
    return `Fallback automatico aplicado via ${addonName}${serialized ? ` | attempted=${serialized}` : ''}`;
}

function chooseFallbackStream(streams: any[], attemptedInfoHashes: Set<string>, titleHint: string) {
    return [...streams]
        .sort((a: any, b: any) => {
            const specificityDelta = getEpisodeSpecificityScore(b, titleHint) - getEpisodeSpecificityScore(a, titleHint);
            if (specificityDelta !== 0) return specificityDelta;

            const swarmDelta = getSwarmScore(b) - getSwarmScore(a);
            if (swarmDelta !== 0) return swarmDelta;

            return 0;
        })
        .find((stream: any) => {
        const candidateMagnet = buildEnrichedMagnetURI({
            magnetURI: typeof stream?.url === 'string' && stream.url.startsWith('magnet:') ? stream.url : null,
            infoHash: stream?.infoHash,
            sources: stream?.sources,
        });

        const candidateInfoHash = extractInfoHash(candidateMagnet || '') || String(stream?.infoHash || '').toLowerCase();
        if (!candidateMagnet || !candidateInfoHash) return false;
        return !attemptedInfoHashes.has(candidateInfoHash);
    });
}

async function tryEpisodeFallback(download: any): Promise<boolean> {
    const episode = await (prisma as any).episode.findFirst({
        where: { videoId: download.videoId },
        include: { series: true },
    });

    if (!episode?.series) {
        return false;
    }

    const externalId = episode.series.imdbId || (episode.series.tmdbId ? String(episode.series.tmdbId) : '');
    if (!externalId) {
        return false;
    }

    const streamId = `${externalId}:${episode.seasonNumber}:${episode.episodeNumber}`;
    const titleHint = `${episode.series.title} S${String(episode.seasonNumber).padStart(2, '0')}E${String(episode.episodeNumber).padStart(2, '0')} ${episode.title || ''}`.trim();
    const currentInfoHash = String(download.infoHash || extractInfoHash(download.magnetURI) || '').toLowerCase();
    const persistedAttempts = parseAttemptedHashesFromError(download.error);
    const attemptedInfoHashes = attemptedFallbackHashes.get(download.videoId) || persistedAttempts;
    for (const hash of persistedAttempts) {
        attemptedInfoHashes.add(hash);
    }
    if (currentInfoHash) attemptedInfoHashes.add(currentInfoHash);
    const streams = await AddonService.getStreamsFromAllAddons('series', streamId, { title: titleHint });
    const fallbackStream = chooseFallbackStream(streams, attemptedInfoHashes, titleHint);

    if (!fallbackStream) {
        return false;
    }

    const fallbackMagnet = buildEnrichedMagnetURI({
        magnetURI: typeof fallbackStream.url === 'string' && fallbackStream.url.startsWith('magnet:') ? fallbackStream.url : null,
        infoHash: fallbackStream.infoHash,
        sources: fallbackStream.sources,
    });

    if (!fallbackMagnet) {
        return false;
    }

    const fallbackInfoHash = extractInfoHash(fallbackMagnet) || String(fallbackStream.infoHash || '').toLowerCase();
    if (fallbackInfoHash) attemptedInfoHashes.add(fallbackInfoHash);
    attemptedFallbackHashes.set(download.videoId, attemptedInfoHashes);
    const fallbackFileIndex = Number.isInteger(fallbackStream.fileIdx) ? fallbackStream.fileIdx : download.fileIndex;

    destroyActiveTorrent(download.videoId);

    const downloadPath = path.join(process.cwd(), 'downloads', download.videoId);
    await fs.rm(downloadPath, { recursive: true, force: true });

    await prisma.downloadQueue.update({
        where: { id: download.id },
        data: {
            magnetURI: fallbackMagnet,
            infoHash: fallbackInfoHash || null,
            fileIndex: fallbackFileIndex,
            status: DownloadState.QUEUED,
            progress: 0,
            downloadSpeed: 0,
            uploadSpeed: 0,
            peers: 0,
            seeds: 0,
            eta: null,
            startedAt: null,
            completedAt: null,
            error: buildFallbackErrorMessage(fallbackStream.addonName || 'addon', attemptedInfoHashes),
            nextRetryAt: null,
        }
    });

    await prisma.video.update({
        where: { id: download.videoId },
        data: { status: 'PROCESSING' }
    });

    await (prisma as any).episode.update({
        where: { id: episode.id },
        data: {
            magnetLink: fallbackMagnet,
            torrentFileIndex: fallbackFileIndex,
            status: 'PROCESSING',
        }
    });

    lastUpdateCache.delete(download.videoId);
    console.log(`🔁 [Fallback] ${download.videoId} trocado para ${fallbackStream.addonName || 'addon'} (${fallbackInfoHash || 'sem infoHash'})`);
    processQueue().catch(err => console.error('❌ [Fallback] Erro ao reprocessar fila:', err));
    return true;
}

/**
 * 🚀 INICIA PROCESSADOR DE FILA (chamar no server.ts)
 */
export async function startQueueProcessor() {
    console.log('🚀 [Queue] Processador iniciado');

    // 🔥 BOMBA 8: Recovery on startup
    await recoverInterruptedDownloads();

    // 🔴 V2.4: Cleanup de seeds expirados e recovery de seeds válidos
    await cleanupExpiredSeeds();

    // Processar fila periodicamente
    setInterval(() => {
        processQueue().catch(err => console.error('❌ [Queue] Erro:', err));
    }, PROCESSING_INTERVAL);

    // 🔥 BOMBA 7: Detectar torrents STALLED periodicamente
    setInterval(() => {
        detectStalledDownloads().catch(err => console.error('❌ [Stall] Erro:', err));
    }, PROCESSING_INTERVAL * 12); // A cada 1 minuto

    // 🔴 PROBLEMA INVISÍVEL #2: Iniciar batch processor de swarm
    startSwarmBatchProcessor();

    // 🔴 PROBLEMA INVISÍVEL #1: Iniciar política de armazenamento
    startStoragePolicyEnforcer();

    // Verificar uso de disco no startup
    const storageUsage = await getStorageUsage();
    console.log(`💾 [Storage] Uso atual: ${storageUsage.usedGB}GB / ${storageUsage.maxGB}GB (${storageUsage.percentage}%)`);
}

/**
 * 🔴 V2.4: CLEANUP DE SEEDS EXPIRADOS NO STARTUP
 */
async function cleanupExpiredSeeds(): Promise<void> {
    const now = new Date();

    // Buscar seeds expirados
    const expiredSeeds = await prisma.seedState.findMany({
        where: {
            isActive: true,
            seedUntil: { lt: now }
        }
    });

    if (expiredSeeds.length > 0) {
        console.log(`🧹 [Seed] Limpando ${expiredSeeds.length} seeds expirados...`);

        // Marcar todos como inativos
        await prisma.seedState.updateMany({
            where: {
                id: { in: expiredSeeds.map((s: any) => s.id) }
            },
            data: { isActive: false }
        });
    }

    // Buscar seeds ainda válidos (opcional: re-attach para continuar seeding)
    const validSeeds = await prisma.seedState.findMany({
        where: {
            isActive: true,
            seedUntil: { gt: now }
        }
    });

    if (validSeeds.length > 0) {
        console.log(`🌱 [Seed] ${validSeeds.length} seeds válidos encontrados (não reconectando nesta versão)`);
        // TODO: Implementar re-attach de torrents para continuar seeding após restart
        // Por ora, apenas limpamos os seeds órfãos
        await prisma.seedState.updateMany({
            where: {
                id: { in: validSeeds.map((s: any) => s.id) }
            },
            data: { isActive: false }
        });
    }

    console.log('✅ [Seed] Cleanup de seeds concluído');
}

/**
 * 🔥 BOMBA 7: DETECTA TORRENTS STALLED (mortos)
 */
async function detectStalledDownloads(): Promise<void> {
    const stalledThreshold = new Date(Date.now() - STALL_TIMEOUT_MINUTES * 60 * 1000);
    const zeroPeerThreshold = new Date(Date.now() - ZERO_PEER_FALLBACK_MINUTES * 60 * 1000);
    const fallbackCandidates = new Map<string, any>();

    const zeroPeerDownloads = await prisma.downloadQueue.findMany({
        where: {
            status: 'DOWNLOADING',
            startedAt: { lt: zeroPeerThreshold },
            progress: { lte: 0 },
            peers: { lte: 0 },
        }
    });

    for (const download of zeroPeerDownloads) {
        fallbackCandidates.set(download.id, { ...download, shouldFailIfUnrecoverable: false });
    }

    const potentiallyStalled = await prisma.downloadQueue.findMany({
        where: {
            status: 'DOWNLOADING',
            startedAt: { lt: stalledThreshold },
            progress: { lt: STALL_MIN_PROGRESS }
        }
    });

    for (const download of potentiallyStalled) {
        fallbackCandidates.set(download.id, { ...download, shouldFailIfUnrecoverable: true });
    }

    let fallbackRecovered = 0;

    for (const candidate of fallbackCandidates.values()) {
        console.log(`⚠️ [Stall] Detectado torrent travado: ${candidate.videoId}`);

        try {
            const recovered = await tryEpisodeFallback(candidate);
            if (recovered) {
                fallbackRecovered += 1;
                continue;
            }
        } catch (error: any) {
            console.warn(`⚠️ [Fallback] Falhou para ${candidate.videoId}: ${error?.message || error}`);
        }

        if (!candidate.shouldFailIfUnrecoverable) {
            continue;
        }

        destroyActiveTorrent(candidate.videoId);

        console.log(`⚠️ [Stall] Detectado torrent travado: ${candidate.videoId}`);

        // Marcar como STALLED (novo status)
        await prisma.downloadQueue.update({
            where: { id: candidate.id },
            data: {
                status: 'FAILED',
                error: `STALLED: Sem progresso por ${STALL_TIMEOUT_MINUTES} minutos (peers insuficientes)`
            }
        });

        await prisma.video.update({
            where: { id: candidate.videoId },
            data: { status: 'FAILED' }
        });
    }

    const failedCount = [...fallbackCandidates.values()].filter((candidate) => candidate.shouldFailIfUnrecoverable).length - fallbackRecovered;
    if (fallbackCandidates.size > 0) {
        console.log(`🔍 [Stall] ${fallbackRecovered} fallback(s) aplicados, ${Math.max(0, failedCount)} download(s) marcados como STALLED`);
    }
}

/**
 * 🔥 BOMBA 8: RECOVERY ON STARTUP
 */
async function recoverInterruptedDownloads(): Promise<void> {
    console.log('🔄 [Recovery] Verificando downloads interrompidos...');

    // Buscar downloads que estavam em andamento quando o servidor caiu
    const interrupted = await prisma.downloadQueue.findMany({
        where: {
            status: { in: ['DOWNLOADING', 'PROCESSING'] }
        }
    });

    if (interrupted.length === 0) {
        console.log('✅ [Recovery] Nenhum download interrompido encontrado');
        return;
    }

    console.log(`🔄 [Recovery] Encontrados ${interrupted.length} download(s) interrompidos`);

    for (const download of interrupted) {
        // Resetar para QUEUED para reprocessar
        await prisma.downloadQueue.update({
            where: { id: download.id },
            data: {
                status: 'QUEUED',
                progress: 0,
                startedAt: null,
                error: null
            }
        });

        await prisma.video.update({
            where: { id: download.videoId },
            data: { status: 'PROCESSING' }
        });

        console.log(`🔄 [Recovery] Resetado: ${download.videoId}`);
    }

    console.log('✅ [Recovery] Downloads interrompidos serão reprocessados');
}

// 🧠 ESTATÍSTICAS DO SISTEMA
export async function getSystemStats() {
    const [queued, downloading, processing, completed, failed] = await Promise.all([
        prisma.downloadQueue.count({ where: { status: 'QUEUED' } }),
        prisma.downloadQueue.count({ where: { status: 'DOWNLOADING' } }),
        prisma.downloadQueue.count({ where: { status: 'PROCESSING' } }),
        prisma.downloadQueue.count({ where: { status: 'COMPLETED' } }),
        prisma.downloadQueue.count({ where: { status: 'FAILED' } })
    ]);

    // Tempo médio de processamento
    const avgProcessing = await prisma.downloadQueue.aggregate({
        where: { processingTime: { not: null } },
        _avg: { processingTime: true }
    });
    // Obter uso de armazenamento
    const storageUsage = await getStorageUsage();

    return {
        queue: {
            queued,
            downloading,
            processing,
            completed,
            failed,
            total: queued + downloading + processing + completed + failed
        },
        performance: {
            avgProcessingTime: avgProcessing._avg.processingTime || 0,
            maxConcurrent: MAX_CONCURRENT_DOWNLOADS,
            activeDownloads: downloading,
            activeEncodings: activeEncodings,
            maxEncodings: MAX_CONCURRENT_ENCODINGS,
            encodingQueueLength: encodingQueue.length
        },
        health: {
            stallTimeoutMinutes: STALL_TIMEOUT_MINUTES,
            stallMinProgress: STALL_MIN_PROGRESS
        },
        seeding: {
            activeSeeds: activeSeeds.size,
            maxSeeds: MAX_ACTIVE_SEEDS,
            seedDurationMinutes: SEED_DURATION_MINUTES
        },
        throttling: {
            minProgressDelta: MIN_PROGRESS_DELTA,
            minUpdateInterval: MIN_UPDATE_INTERVAL,
            ffmpegThreads: FFMPEG_THREADS
        },
        storage: {
            usedGB: storageUsage.usedGB,
            maxGB: storageUsage.maxGB,
            percentage: storageUsage.percentage,
            maxAgeUnwatched: MAX_AGE_DAYS_UNWATCHED,
            minViewsToKeep: MIN_VIEWS_TO_KEEP
        },
        buffers: {
            swarmDataBufferLength: swarmDataBuffer.length,
            lastUpdateCacheSize: lastUpdateCache.size,
            activeTorrentsCount: activeTorrents.size
        }
    };
}

/**
 * 🧠 ÍNDICE DE RARIDADE (IDEIA PIONEIRA)
 * Formula: rarityScore = (peers * speed) / size
 * Quanto MENOR o score, MAIS raro é o conteúdo
 */
export function calculateRarityScore(peers: number, speedKB: number, sizeMB: number): number {
    if (sizeMB === 0) return 0;
    const score = (peers * speedKB) / sizeMB;
    // Normalizar para escala 0-100 (invertida: maior = mais raro)
    const normalizedScore = Math.max(0, 100 - Math.min(100, score * 10));
    return Math.round(normalizedScore * 100) / 100;
}

/**
 * 🗑️ LIMPAR DOWNLOADS ANTIGOS COMPLETOS (manutenção de disco)
 */
export async function cleanupOldDownloads(daysOld: number = 30): Promise<number> {
    const threshold = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

    const result = await prisma.downloadQueue.deleteMany({
        where: {
            status: 'COMPLETED',
            completedAt: { lt: threshold }
        }
    });

    console.log(`🗑️ [Cleanup] Removidos ${result.count} registros antigos da fila`);
    return result.count;
}

// ============================================================
// 🔴 PROBLEMA INVISÍVEL #1: GESTÃO INTELIGENTE DE ARMAZENAMENTO
// ============================================================

/**
 * 📊 Calcula uso atual de disco em GB
 */
export async function getStorageUsage(): Promise<{ usedGB: number; maxGB: number; percentage: number }> {
    const uploadsPath = path.join(process.cwd(), 'uploads');

    let totalBytes = 0;

    try {
        const entries = await fs.readdir(uploadsPath, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const dirPath = path.join(uploadsPath, entry.name);
                totalBytes += await getDirectorySize(dirPath);
            } else if (entry.isFile()) {
                const filePath = path.join(uploadsPath, entry.name);
                const stat = await fs.stat(filePath);
                totalBytes += stat.size;
            }
        }
    } catch (err) {
        console.warn('⚠️ [Storage] Erro ao calcular uso de disco');
    }

    const usedGB = totalBytes / 1024 / 1024 / 1024;

    return {
        usedGB: Math.round(usedGB * 100) / 100,
        maxGB: MAX_STORAGE_GB,
        percentage: Math.round((usedGB / MAX_STORAGE_GB) * 100)
    };
}

async function getDirectorySize(dirPath: string): Promise<number> {
    let size = 0;
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                size += await getDirectorySize(fullPath);
            } else {
                const stat = await fs.stat(fullPath);
                size += stat.size;
            }
        }
    } catch (err) {
        // Ignorar erros de leitura
    }
    return size;
}

/**
 * 🧹 CDN CACHE POLICY: Remove vídeos menos assistidos quando disco cheio
 */
export async function enforceStoragePolicy(): Promise<{ removedCount: number; freedGB: number }> {
    const usage = await getStorageUsage();

    if (usage.percentage < 90) {
        console.log(`✅ [Storage] Uso: ${usage.percentage}% - Dentro do limite`);
        return { removedCount: 0, freedGB: 0 };
    }

    console.log(`⚠️ [Storage] Uso: ${usage.percentage}% - Iniciando limpeza inteligente`);

    // 🔴 V2.4: Política de retenção inteligente (views + recência)
    const unwatchedThreshold = new Date(Date.now() - MAX_AGE_DAYS_UNWATCHED * 24 * 60 * 60 * 1000);

    // Buscar vídeos candidatos para remoção:
    // 1. Menos de MIN_VIEWS_TO_KEEP views
    // 2. OU não assistido há mais de MAX_AGE_DAYS_UNWATCHED dias
    const candidates = await prisma.video.findMany({
        where: {
            status: 'READY',
            OR: [
                // Condição 1: Poucos views E não foi assistido recentemente
                {
                    views: { lt: MIN_VIEWS_TO_KEEP },
                    lastViewedAt: { lt: unwatchedThreshold }
                },
                // Condição 2: Nunca foi assistido
                {
                    lastViewedAt: null,
                    createdAt: { lt: unwatchedThreshold }
                },
                // 🔴 V2.5: Limpeza agressiva de prefetch preditivo (Autobot)
                // Se baixamos automaticamente e ninguém viu em 3 dias, tchau.
                {
                    tags: { contains: 'Autobot' },
                    views: 0,
                    createdAt: { lt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) }
                }
            ]
        },
        orderBy: [
            { views: 'asc' },
            { lastViewedAt: 'asc' }
        ],
        take: 10
    });

    let removedCount = 0;
    let freedBytes = 0;

    for (const video of candidates) {
        // Verificar se ainda precisa limpar
        const currentUsage = await getStorageUsage();
        if (currentUsage.percentage < 80) break;

        try {
            // Remover arquivos físicos
            const hlsPath = path.join(process.cwd(), 'uploads', 'hls', video.id);
            const videoPath = path.join(process.cwd(), 'uploads', `${video.id}.mp4`);

            const hlsSize = await getDirectorySize(hlsPath).catch(() => 0);
            const videoSize = await fs.stat(videoPath).then(s => s.size).catch(() => 0);

            await fs.rm(hlsPath, { recursive: true, force: true }).catch(() => { });
            await fs.rm(videoPath, { force: true }).catch(() => { });

            // Atualizar status no banco (não deletar, apenas marcar como removido)
            await prisma.video.update({
                where: { id: video.id },
                data: {
                    status: 'ARCHIVED',
                    hlsPath: null,
                    storageKey: null
                }
            });

            freedBytes += hlsSize + videoSize;
            removedCount++;

            console.log(`🗑️ [CDN] Removido: ${video.title} (${((hlsSize + videoSize) / 1024 / 1024).toFixed(2)}MB)`);
        } catch (err) {
            console.warn(`⚠️ [CDN] Erro ao remover ${video.id}`);
        }
    }

    const freedGB = freedBytes / 1024 / 1024 / 1024;
    console.log(`✅ [CDN] Limpeza concluída: ${removedCount} vídeos, ${freedGB.toFixed(2)}GB liberados`);

    return { removedCount, freedGB };
}

// ============================================================
// 🔴 PROBLEMA INVISÍVEL #2: BATCH PROCESSING PARA SWARM DATA
// ============================================================

/**
 * 🔄 Processa buffer de swarm data em batch (não bloqueia event loop)
 */
async function flushSwarmDataBuffer(): Promise<void> {
    if (swarmDataBuffer.length === 0) return;

    const dataToProcess = [...swarmDataBuffer];
    swarmDataBuffer.length = 0; // Limpar buffer

    // Agrupar por videoId (pegar último valor de cada)
    const latestData = new Map<string, typeof dataToProcess[0]>();
    for (const item of dataToProcess) {
        latestData.set(item.videoId, item);
    }

    // Processar em batch
    for (const [videoId, data] of latestData) {
        try {
            await updateSwarmHealth(
                data.infoHash,
                data.peers,
                data.seeds,
                data.speed,
                videoId
            );
        } catch (err) {
            // Ignorar erros individuais
        }
    }

    if (latestData.size > 0) {
        console.log(`📡 [Swarm] Batch processado: ${latestData.size} torrents`);
    }
}

/**
 * 🚀 Inicia batch processor de swarm data
 */
export function startSwarmBatchProcessor(): void {
    setInterval(() => {
        flushSwarmDataBuffer().catch(err => console.error('❌ [Swarm Batch] Erro:', err));
    }, SWARM_BATCH_INTERVAL);

    console.log(`📡 [Swarm] Batch processor iniciado (interval: ${SWARM_BATCH_INTERVAL}ms)`);
}

/**
 * 🚀 Inicia política de armazenamento periódica
 */
export function startStoragePolicyEnforcer(): void {
    // Verificar a cada 1 hora
    setInterval(() => {
        enforceStoragePolicy().catch(err => console.error('❌ [Storage Policy] Erro:', err));
    }, 60 * 60 * 1000);

    console.log(`💾 [Storage] Policy enforcer iniciado (check: 1h)`);
}

/**
 * 📈 V2.6: CÁLCULO DE PRECISÃO DE PREDIÇÃO (Feedback Loop)
 * Mede quão bem o Arconte está antecipando o desejo dos usuários.
 */
export async function getPredictionAccuracy(): Promise<{ accuracy: number; total: number; successful: number }> {
    const predictiveVideos = await prisma.video.findMany({
        where: { isPredictive: true },
        select: { views: true }
    });

    if (predictiveVideos.length === 0) {
        return { accuracy: 100, total: 0, successful: 0 }; // Neutro se não houver dados
    }

    const successful = predictiveVideos.filter(v => v.views > 0).length;
    const accuracy = (successful / predictiveVideos.length) * 100;

    return {
        accuracy,
        total: predictiveVideos.length,
        successful
    };
}

// 🔥 AUTO-INIT (BOMBA 8: Recovery & FSM)
// Inicia o sistema de orquestração automaticamente ao carregar o módulo
setTimeout(() => {
    initDownloader().catch(err => console.error('Failed to auto-init downloader:', err));
}, 2000);

// 🛡️ ZOMBIE RECOVERY V2 (Enterprise Grade)
async function recoverZombieJobsEnterprise() {
    console.log('🚑 [Recovery V2] Buscando jobs zumbis...');

    // Buscar jobs ativos (DOWNLOADING/TRANSCODING/CONNECTING)
    const activeJobs = await prisma.downloadQueue.findMany({
        where: {
            status: { in: [DownloadState.DOWNLOADING, DownloadState.TRANSCODING, DownloadState.CONNECTING, 'PROCESSING'] }
        }
    });

    const ZOMBIE_THRESHOLD = 2 * 60 * 1000; // 2 min tolerância
    const now = Date.now();
    let recoveredCount = 0;

    for (const job of activeJobs) {
        // Se updateAt for nulo (não deveria), usa queuedAt
        const lastUpdate = new Date(job.updatedAt || job.queuedAt).getTime();

        if (now - lastUpdate > ZOMBIE_THRESHOLD) {
            console.log(`🧟 [Recovery] Job ${job.videoId} detectado como zumbi (last update: ${job.updatedAt?.toISOString()}). Resetando...`);

            await prisma.downloadQueue.update({
                where: { id: job.id },
                data: {
                    status: DownloadState.QUEUED,
                    error: 'Recovered from zombie state (Enterprise Check)',
                    updatedAt: new Date()
                }
            });

            // Limpeza
            const downloadPath = path.join(process.cwd(), 'downloads', job.videoId || '');
            try { await fs.rm(downloadPath, { recursive: true, force: true }); } catch (_) { }
            recoveredCount++;
        }
    }

    if (recoveredCount > 0) {
        console.log(`✅ [Recovery] ${recoveredCount} jobs zumbis recuperados.`);
        SystemTelemetry.trackZombieRecovery(recoveredCount);
    }
    else console.log('✨ [Recovery] Nenhum job zumbi encontrado.');
}

// 🛡️ GRACEFUL SHUTDOWN (Industrial standard)
export async function shutdownDownloader() {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log('🛑 [Shutdown] Iniciando parada graciosa do Torrent Downloader...');

    // 1. Pausar aceitação de novos jobs (feito via flag)

    // 2. Destruir cliente WebTorrent (para conexões P2P)
    if (client) {
        try {
            client.destroy((err: any) => {
                if (err) console.error('Error destroying client:', err);
                else console.log('✅ [Shutdown] WebTorrent client destroyed.');
            });
        } catch (e) {
            console.error('Error calling destroy on client:', e);
        }
    }

    // 3. Persistir estado de jobs ativos como QUEUED (para garantir resume no boot)
    try {
        const activeJobs = await prisma.downloadQueue.count({
            where: { status: { in: [DownloadState.DOWNLOADING, DownloadState.TRANSCODING, DownloadState.CONNECTING] } }
        });

        if (activeJobs > 0) {
            console.log(`💾 [Shutdown] Salvando estado de ${activeJobs} jobs ativos...`);
            await prisma.downloadQueue.updateMany({
                where: { status: { in: [DownloadState.DOWNLOADING, DownloadState.TRANSCODING, DownloadState.CONNECTING] } },
                data: { status: DownloadState.QUEUED }
            });
        }
    } catch (e) {
        console.error('Error saving shutdown state:', e);
    }

    console.log('✅ [Shutdown] Downloader parado com segurança.');
}
