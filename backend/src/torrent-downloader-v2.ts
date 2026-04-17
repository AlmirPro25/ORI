/**
 * ðŸš€ TORRENT DOWNLOADER V2.4 - O SISTEMA QUE NÃƒO MORRE (Media Orchestrator)
 * 
 * CorreÃ§Ãµes de Engenharia de Guerra:
 * âœ… BOMBA 1: Fila de ingestÃ£o (MAX_CONCURRENT_DOWNLOADS)
 * âœ… BOMBA 2: Reencoding seguro (libx264 + aac)
 * âœ… BOMBA 3: OperaÃ§Ãµes assÃ­ncronas (sem sync)
 * âœ… BOMBA 4: Banco como fonte de verdade (nÃ£o RAM)
 * 
 * ðŸ”¥ BOMBAS SILENCIOSAS RESOLVIDAS (V2.1):
 * âœ… BOMBA 5: SeparaÃ§Ã£o Download/Encoding (CPU Protection)
 * âœ… BOMBA 6: Limpeza automÃ¡tica de disco
 * âœ… BOMBA 7: DetecÃ§Ã£o de torrents STALLED
 * âœ… BOMBA 8: Recovery on startup
 * 
 * ðŸ’£ BOMBAS AVANÃ‡ADAS RESOLVIDAS (V2.2):
 * âœ… BOMBA A: Throttling de escrita no banco (delta-based updates)
 * âœ… BOMBA B: Fila real de encoding (event-driven, nÃ£o polling)
 * âœ… BOMBA C: EstratÃ©gia de seeding (manter seed por X minutos)
 * âœ… BOMBA D: PersistÃªncia de estado parcial (jÃ¡ via recovery)
 * âœ… BOMBA E: LimitaÃ§Ã£o de threads FFmpeg
 * 
 * ðŸ§  InteligÃªncia AvanÃ§ada:
 * - Coleta de timing (startedAt, completedAt, processingTime)
 * - PrevisÃ£o de disponibilidade (ETA)
 * - PriorizaÃ§Ã£o por demanda + saÃºde do swarm
 * - OrquestraÃ§Ã£o de rede P2P
 * - Ãndice de Raridade para preservaÃ§Ã£o de conteÃºdo
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
import { MediaVerificationService } from './services/media-verification.service';
import { PtBrQueryPlanner } from './services/ptbr-query-planner';
import { SearchRankingTelemetry } from './services/search-ranking-telemetry';
import { SourceIntelligence } from './services/source-intelligence';
import { VideoSelectionTelemetry } from './services/video-selection-telemetry';
import { eventBus, SystemEvents } from './event-bus';

const prisma = new PrismaClient();
ffmpeg.setFfmpegPath(ffmpegPath.path);

// ===== CONFIGURAÃ‡ÃƒO CRÃTICA =====
const MAX_CONCURRENT_DOWNLOADS = 3; // BOMBA 1 RESOLVIDA
const MAX_CONCURRENT_ENCODINGS = 1; // ðŸ”¥ BOMBA 5: Encoding separado (CPU intensive)
const PROCESSING_INTERVAL = 5000; // 5s
const PROGRESS_UPDATE_INTERVAL = 2000; // 2s
const STALL_TIMEOUT_MINUTES = 10; // ðŸ”¥ BOMBA 7: Timeout para marcar como STALLED
const STALL_MIN_PROGRESS = 5; // Progresso mÃ­nimo esperado em STALL_TIMEOUT_MINUTES
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

// ðŸ’£ BOMBA A: Throttling de escrita (sÃ³ atualiza se mudou significativamente)
const MIN_PROGRESS_DELTA = 2; // SÃ³ atualiza banco se progresso mudou >= 2%
const MIN_UPDATE_INTERVAL = 5000; // MÃ­nimo 5s entre updates no banco

// ðŸ’£ BOMBA C: EstratÃ©gia de seeding
const SEED_DURATION_MINUTES = 30; // Manter seed por 30 minutos apÃ³s download
const MAX_ACTIVE_SEEDS = 5; // MÃ¡ximo de seeds simultÃ¢neos

// ðŸ’£ BOMBA E: LimitaÃ§Ã£o de threads FFmpeg
const FFMPEG_THREADS = 2; // Limitar FFmpeg a 2 threads

// ðŸ”´ PROBLEMA INVISÃVEL #1: GestÃ£o de armazenamento (CDN Cache Policy)
const MAX_STORAGE_GB = 100; // Limite mÃ¡ximo de armazenamento em GB

// ðŸ”´ V2.4: PolÃ­tica de retenÃ§Ã£o inteligente (views + recÃªncia)
const MIN_VIEWS_TO_KEEP = 3; // MÃ­nimo de views para nÃ£o ser removido
const MAX_AGE_DAYS_UNWATCHED = 30; // Remover vÃ­deos nÃ£o assistidos apÃ³s X dias

// ðŸ”´ V2.4: Backpressure control (encoding queue pressure)
const MAX_ENCODING_QUEUE_BEFORE_THROTTLE = 3; // Se encoding queue > 3, reduzir downloads
let dynamicMaxDownloads = MAX_CONCURRENT_DOWNLOADS;

// ðŸ”´ PROBLEMA INVISÃVEL #2: Batch processing para reduzir pressÃ£o no event loop
const SWARM_BATCH_INTERVAL = 10000; // Enviar dados de swarm a cada 10s (batch)
const swarmDataBuffer: Array<{ infoHash: string; peers: number; seeds: number; speed: number; videoId: string }> = [];

// ðŸ”´ V2.4: Contador global de storage (evita I/O pesado)
let cachedStorageUsedMB = 0;
let lastStorageCalculation = 0;

// Contadores para controle de concorrÃªncia
let activeEncodings = 0;

// ðŸ’£ BOMBA B: Fila real de encoding (event-driven)
const encodingQueue: { videoId: string; inputPath: string; outputDir: string; downloadPath: string; resolve: () => void; reject: (err: any) => void }[] = [];
let isProcessingEncodingQueue = false;

// ðŸ’£ BOMBA A: Cache de Ãºltimo update para throttling
const lastUpdateCache = new Map<string, { progress: number; timestamp: number }>();
const lastProgressWarningCache = new Map<string, number>();

// ðŸ’£ BOMBA C: Seeds ativos
const activeSeeds = new Map<string, { torrent: any; startedAt: Date }>();
const attemptedFallbackHashes = new Map<string, Set<string>>();

// Cliente WebTorrent global (carregado dinamicamente)
let client: any = null;
const isPrismaBusyTimeout = (error: any) => {
    const message = String(error?.message || '').toLowerCase();
    return error?.code === 'P2024'
        || message.includes('operations timed out')
        || message.includes('database failed to respond')
        || message.includes('database is locked')
        || message.includes('sqlite');
};

async function updateQueueProgressSafely(videoId: string, data: {
    progress: number;
    downloadSpeed: number;
    uploadSpeed: number;
    peers: number;
    seeds: number;
    eta: number | null;
}, timestamp: number) {
    try {
        await prisma.downloadQueue.update({
            where: { videoId },
            data
        });
        lastUpdateCache.set(videoId, { progress: data.progress, timestamp });
    } catch (error: any) {
        if (isPrismaBusyTimeout(error)) {
            const lastWarning = lastProgressWarningCache.get(videoId) || 0;
            if (timestamp - lastWarning >= 30000) {
                console.warn(`Ã¢Å¡Â Ã¯Â¸Â [Queue] SQLite ocupado ao atualizar progresso de ${videoId}. Vou tentar de novo sem derrubar o stream.`);
                lastProgressWarningCache.set(videoId, timestamp);
            }
            return;
        }

        throw error;
    }
}
let isShuttingDown = false; // ðŸ›¡ï¸ Flag de parada global

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
        client.on('error', (err: any) => console.error('ðŸ”´ [WebTorrent] Error:', err.message));
        client.on('warning', (err: any) => console.warn('ðŸŸ  [WebTorrent] Warning:', err.message));
    }
    return client;
}

// ðŸ›¡ï¸ V3.0: FSM & RESILIENCY (INDUSTRIAL GRADE)
export enum DownloadState {
    QUEUED = 'QUEUED',
    CONNECTING = 'CONNECTING', // Buscando peers/metadata
    DOWNLOADING = 'DOWNLOADING', // Baixando payload
    PAUSED = 'PAUSED',
    PROCESSING = 'PROCESSING', // PÃ³s-download (move vari)
    TRANSCODING = 'TRANSCODING', // FFmpeg HLS
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
    READY = 'READY' // Final state in Video model
}

/**
 * ðŸ›¡ï¸ INICIALIZAÃ‡ÃƒO INDUSTRIAL
 * Verifica integridade, limpa zumbis e prepara o terreno.
 */
export async function initDownloader() {
    console.log('ðŸ­ [Init] Inicializando Torrent Downloader V2.4 (Industrial)...');

    try {
        // await recoverZombieJobs();
        await recoverZombieJobsEnterprise(); // V3.0 Industrial Recovery
        await fs.mkdir(path.join(process.cwd(), 'downloads'), { recursive: true });
        await fs.mkdir(path.join(process.cwd(), 'uploads', 'hls'), { recursive: true });

        // Iniciar loop de processamento
        scheduleProcessQueue();

        console.log('âœ… [Init] Sistema pronto e blindado.');
    } catch (error) {
        console.error('âŒ [Init] Falha crÃ­tica na inicializaÃ§Ã£o:', error);
        process.exit(1); // Fail fast
    }
}

/**
 * ðŸ§Ÿ RECOVERY DE JOBS ZUMBIS
 * Detecta downloads que morreram no meio (ex: crash do servidor) e os recupera.
 */
async function recoverZombieJobs() {
    console.log('ðŸš‘ [Recovery] Buscando jobs zumbis...');

    // Buscar jobs que nÃ£o estÃ£o terminais
    const zombies = await prisma.downloadQueue.findMany({
        where: {
            status: {
                notIn: ['COMPLETED', 'FAILED', 'QUEUED', 'READY']
            }
        }
    });

    if (zombies.length === 0) {
        console.log('âœ¨ [Recovery] Nenhum job zumbi encontrado. Sistema limpo.');
        return;
    }

    console.log(`âš ï¸ [Recovery] Encontrados ${zombies.length} jobs inconsistentes.`);

    for (const job of zombies) {
        // LÃ³gica de DecisÃ£o de Recovery
        console.log(`ðŸ”„ [Recovery] Recuperando job ${job.id} (Status anterior: ${job.status})...`);

        // Se estava transcodificando, o arquivo temporÃ¡rio pode estar corrompido.
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

    console.log('âœ… [Recovery] Todos os jobs foram resetados para QUEUED.');
}

// ==========================================
// ðŸ› ï¸ FUNÃ‡Ã•ES AUXILIARES
// ==========================================

// Cache de torrents ativos (apenas para performance, nÃ£o Ã© fonte de verdade)
const activeTorrents = new Map<string, any>();
const claimedQueueIds = new Set<string>();
const startingQueueIds = new Set<string>();
const rarityBoostedQueueIds = new Set<string>();
let isProcessingQueue = false;
let pendingProcessQueueRun = false;
let queueRecoveryBackoffUntil = 0;

function clearQueueRuntimeState(queueId?: string | null, videoId?: string | null) {
    if (queueId) {
        claimedQueueIds.delete(queueId);
        startingQueueIds.delete(queueId);
        rarityBoostedQueueIds.delete(queueId);
    }

    if (videoId) {
        attemptedFallbackHashes.delete(videoId);
    }
}

function scheduleProcessQueue(delayMs = 0) {
    if (isShuttingDown) return;

    const runner = async () => {
        if (Date.now() < queueRecoveryBackoffUntil) return;
        if (isProcessingQueue) {
            pendingProcessQueueRun = true;
            SystemTelemetry.trackQueueSerializedSkip();
            return;
        }

        isProcessingQueue = true;
        try {
            await processQueue();
            queueRecoveryBackoffUntil = 0;
        } catch (err: any) {
            if (isPrismaBusyTimeout(err)) {
                queueRecoveryBackoffUntil = Date.now() + 3000;
                SystemTelemetry.trackQueueBusyBackoff();
                console.warn('âš ï¸ [Queue] SQLite ocupado no processQueue. Aplicando backoff de 3s.');
                setTimeout(() => scheduleProcessQueue(), 3000);
                return;
            }

            console.error('âŒ [Queue] Erro:', err);
        } finally {
            isProcessingQueue = false;
            if (pendingProcessQueueRun && !isShuttingDown) {
                pendingProcessQueueRun = false;
                queueMicrotask(() => scheduleProcessQueue());
            }
        }
    };

    if (delayMs > 0) {
        setTimeout(runner, delayMs);
        return;
    }

    queueMicrotask(runner);
}

interface DownloadRequest {
    magnetURI: string;
    userId: string;
    title: string;
    videoId?: string; // Opcional: usar vÃ­deo jÃ¡ existente no banco
    description?: string;
    category?: string;
    priority?: number;
    fileIndex?: number; // V2.5: Permite escolher o arquivo especÃ­fico (para sÃ©ries)
}

/**
 * ðŸŽ¯ ADICIONA DOWNLOAD Ã€ FILA (nÃ£o inicia imediatamente)
 */
export async function queueDownload(request: DownloadRequest): Promise<{ videoId: string; position: number }> {
    const { magnetURI, userId, title, description, category, priority = 0 } = request;

    // Extrair infoHash do magnet
    const infoHash = extractInfoHash(magnetURI);

    // Verificar se jÃ¡ existe na fila
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

    // Criar vÃ­deo no banco se nÃ£o fornecido
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

    // Adicionar Ã  fila stateful
    await prisma.downloadQueue.create({
        data: {
            videoId: video.id,
            magnetURI,
            infoHash,
            status: DownloadState.QUEUED,
            priority,
            fileIndex: request.fileIndex // V2.5: Persistir Ã­ndice do arquivo
        }
    });

    const position = await getQueuePosition(video.id);

    console.log(`ðŸ“‹ [Queue] Adicionado: ${title} (posiÃ§Ã£o ${position})`);

    // Processar fila (nÃ£o-bloqueante)
    scheduleProcessQueue();

    return { videoId: video.id, position };
}

/**
 * ðŸ”„ PROCESSA FILA (roda continuamente)
 */
async function processQueue() {
    if (Date.now() < queueRecoveryBackoffUntil) return;
    if (isShuttingDown) return; // abort if shutting down

    // Contar downloads ativos
    const activeCount = await prisma.downloadQueue.count({
        where: { status: DownloadState.DOWNLOADING }
    });

    // ðŸ”´ V2.4: Backpressure control - reduzir downloads se encoding queue cheia
    if (encodingQueue.length > MAX_ENCODING_QUEUE_BEFORE_THROTTLE) {
        dynamicMaxDownloads = Math.max(1, MAX_CONCURRENT_DOWNLOADS - 1);
        console.log(`âš ï¸ [Backpressure] Encoding queue cheia (${encodingQueue.length}), reduzindo downloads para ${dynamicMaxDownloads}`);
    } else {
        dynamicMaxDownloads = MAX_CONCURRENT_DOWNLOADS;
    }

    if (activeCount >= dynamicMaxDownloads) {
        // console.log(`â¸ï¸  [Queue] Limite atingido (${activeCount}/${dynamicMaxDownloads})`);
        return;
    }

    // Pegar prÃ³ximo da fila (maior prioridade + mais antigo), respeitando Backoff
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
    if (claimedQueueIds.has(next.id) || startingQueueIds.has(next.id)) return;

    // ðŸ”´ V2.5: Rarity-Based Prioritization
    if (next.infoHash && !rarityBoostedQueueIds.has(next.id)) {
        try {
            const health = await prisma.swarmHealth.findUnique({ where: { contentHash: next.infoHash } });
            if (health && health.healthScore < 20) {
                rarityBoostedQueueIds.add(next.id);
                SystemTelemetry.trackQueueRarityBoostApplied();
                console.log(`💎 [Rarity] Conteúdo raro detectado para ${next.videoId}. Boosting priority uma vez.`);
                await prisma.downloadQueue.update({
                    where: { id: next.id },
                    data: { priority: { increment: 50 } }
                });
                pendingProcessQueueRun = true;
                return;
            }
        } catch (_) { }
    }

    // Marcar como CONNECTING (TransiÃ§Ã£o de Estado 1)
    const claimResult = await prisma.downloadQueue.updateMany({
        where: {
            id: next.id,
            status: DownloadState.QUEUED,
        },
        data: {
            status: DownloadState.CONNECTING,
            startedAt: new Date()
        }
    });

    if (!claimResult.count) {
        return;
    }
    claimedQueueIds.add(next.id);

    console.log(`ðŸš€ [Process] Iniciando job ${next.videoId}...`);

    // Iniciar download
    startDownload(next.id)
        .catch(err => console.error('Error starting download wrapper', err))
        .finally(() => {
            claimedQueueIds.delete(next.id);
            scheduleProcessQueue(1000);
        });
}

/**
 * ðŸ“¥ INICIA DOWNLOAD (chamado pela fila)
 */
async function startDownload(queueId: string) {
    if (startingQueueIds.has(queueId)) return;
    startingQueueIds.add(queueId);

    const download = await prisma.downloadQueue.findUnique({
        where: { id: queueId }
    });

    if (!download) {
        startingQueueIds.delete(queueId);
        return;
    }

    // Atualizar status
    const startResult = await prisma.downloadQueue.updateMany({
        where: {
            id: queueId,
            status: DownloadState.CONNECTING,
        },
        data: {
            status: DownloadState.DOWNLOADING,
            startedAt: new Date()
        }
    });

    if (!startResult.count) {
        startingQueueIds.delete(queueId);
        return;
    }

    // ðŸ“Š TELEMETRY START
    SystemTelemetry.trackDownloadStart();

    try {
        await downloadAndProcess(download);
    } catch (err: any) {
        // ðŸ›¡ï¸ SMART RETRY LOGIC
        console.error(`âŒ [Download] Erro ${download.videoId}:`, err);

        const currentRetry = download.retryCount || 0;
        const maxRetries = download.maxRetries || 3;

        // Se ainda tem tentativas, agenda retry
        if (currentRetry < maxRetries) {
            // Exponential Backoff: 30s, 60s, 120s...
            const delayMs = Math.pow(2, currentRetry) * 30000;
            const nextRetry = new Date(Date.now() + delayMs);

            console.warn(`â™»ï¸ [Retry] Job ${download.videoId} falhou. Tentativa ${currentRetry + 1}/${maxRetries}. Reagendando para ${nextRetry.toISOString()}`);
            SystemTelemetry.trackRetry(); // ðŸ“Š TELEMETRY RETRY

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
            VideoSelectionTelemetry.markOutcome(download.videoId, 'retry', err?.message || 'retry-scheduled').catch(() => {
                // telemetry is opportunistic
            });
        } else {
            // Falha Definitiva (Give Up)
            console.error(`ðŸ’€ [GiveUp] Job ${download.videoId} excedeu limites de retry (${maxRetries}). Marcando como FAILED.`);
            SystemTelemetry.trackDownloadFail(); // ðŸ“Š TELEMETRY FAIL

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
            VideoSelectionTelemetry.markOutcome(download.videoId, 'failed', err?.message || 'max-retries-reached').catch(() => {
                // telemetry is opportunistic
            });
            clearQueueRuntimeState(queueId, download.videoId);
        }
    } finally {
        startingQueueIds.delete(queueId);
    }

    // Processar prÃ³ximo da fila
    scheduleProcessQueue();
}

/**
 * ðŸŽ¬ BAIXA E PROCESSA TORRENT
 */
async function downloadAndProcess(download: any) {
    const { videoId, magnetURI } = download;

    const downloadPath = path.join(process.cwd(), 'downloads', videoId);
    const uploadsPath = path.join(process.cwd(), 'uploads');
    const hlsPath = path.join(uploadsPath, 'hls', videoId);
    const episodeSelectionContext = await getEpisodeSelectionContext(videoId);
    const adaptivePatternPolicies = await VideoSelectionTelemetry.getAdaptivePatternPolicies();

    // Criar diretÃ³rios (BOMBA 3: async)
    await fs.mkdir(downloadPath, { recursive: true });
    await fs.mkdir(hlsPath, { recursive: true });

    const wtClient = await getWebTorrentClient();
    return new Promise<void>((resolve, reject) => {
        console.log(`ðŸ“¥ [Download] Iniciando: ${videoId}`);

        if (activeTorrents.has(videoId)) {
            reject(new Error(`Download duplicado detectado para ${videoId}`));
            return;
        }
        activeTorrents.set(videoId, { pending: true, magnetURI });

        wtClient.add(magnetURI, { path: downloadPath }, async (torrent: any) => {
            console.log(`âœ… [Torrent] Adicionado: ${torrent.name}`);

            // FSM: Atualizar para DOWNLOADING
            try {
                await prisma.downloadQueue.update({
                    where: { id: download.id },
                    data: { status: DownloadState.DOWNLOADING }
                });
            } catch (err) { console.error('Error updating status to DOWNLOADING', err); }

            // ðŸ”´ V2.5: OtimizaÃ§Ã£o de Banda (Selective Download)
            if (download.fileIndex !== undefined && download.fileIndex !== null) {
                // Se temos um arquivo alvo, DESMARCA tudo primeiro
                console.log(`ðŸŽ¯ [Selective] Modo episÃ³dio Ãºnico ativado. Desmarcando outros arquivos.`);
                torrent.files.forEach((file: any) => file.deselect());

                // Seleciona APENAS o arquivo alvo
                const targetFile = torrent.files[download.fileIndex];
                if (targetFile && isCandidateVideoFile(targetFile)) {
                    console.log(`ðŸŽ¯ [Target] Baixando APENAS: ${targetFile.name}`);
                    targetFile.select();
                } else {
                    console.warn(`Ã¢Å¡Â Ã¯Â¸Â [Selective] fileIndex ${download.fileIndex} nÃƒÂ£o aponta para um vÃƒÂ­deo vÃƒÂ¡lido. Vou procurar o melhor arquivo automaticamente.`);
                    const smartTarget: any = selectBestTorrentVideoFile(torrent.files, episodeSelectionContext, adaptivePatternPolicies);
                    if (smartTarget) {
                        console.log(`ðŸ§  [Selective] Melhor alvo detectado automaticamente: ${smartTarget.name}`);
                        smartTarget.select();
                    } else {
                        torrent.files.forEach((file: any) => {
                            if (isCandidateVideoFile(file)) {
                                file.select(0);
                            }
                        });
                    }
                }
            } else {
                // Comportamento legado: Prioriza inÃ­cio de todos os vÃ­deos
                torrent.files.forEach((file: any) => {
                    if (isCandidateVideoFile(file)) {
                        file.select(0);
                    }
                });
            }

            // Salvar referÃªncia
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

            // Encontrar arquivo de vÃ­deo
            const rankedVideoCandidates = rankTorrentVideoFiles(torrent.files, episodeSelectionContext, adaptivePatternPolicies);
            let videoFile;

            if (download.fileIndex !== undefined && download.fileIndex !== null) {
                const indexedFile = torrent.files[download.fileIndex];
                if (indexedFile && isCandidateVideoFile(indexedFile)) {
                    videoFile = indexedFile;
                }
            }

            if (!videoFile) {
                videoFile = rankedVideoCandidates[0]?.file || null;
            }

            if (!videoFile) {
                activeTorrents.delete(videoId);
                const visibleFiles = torrent.files
                    .slice(0, 8)
                    .map((file: any) => file?.name)
                    .filter(Boolean)
                    .join(', ');
                reject(new Error(`Nenhum arquivo de vÃ­deo utilizÃ¡vel encontrado no torrent${visibleFiles ? `: ${visibleFiles}` : ''}`));
                return;
            }

            console.log(`ðŸŽ¬ [Video] Arquivo: ${videoFile.name}`);

            const selectedCandidateTrace = rankedVideoCandidates.find((candidate) => candidate.file === videoFile);
            if (selectedCandidateTrace) {
                const topCandidates = rankedVideoCandidates
                    .slice(0, 3)
                    .map((candidate) => `${candidate.file.name} score=${candidate.score} [${candidate.reasons.join(',')}]`)
                    .join(' | ');
                console.log(`ðŸ§  [VideoSelection] ${videoId} escolhido=${videoFile.name} score=${selectedCandidateTrace.score} motivos=${selectedCandidateTrace.reasons.join(',')} top=${topCandidates}`);
                VideoSelectionTelemetry.record({
                    videoId,
                    selectedFile: String(videoFile.name || ''),
                    selectedScore: Number(selectedCandidateTrace.score || 0),
                    selectedReasons: selectedCandidateTrace.reasons,
                    sourceTorrentName: String(torrent.name || ''),
                    seasonNumber: episodeSelectionContext?.seasonNumber || null,
                    episodeNumber: episodeSelectionContext?.episodeNumber || null,
                    topCandidates: rankedVideoCandidates.slice(0, 3).map((candidate) => ({
                        file: String(candidate.file?.name || ''),
                        score: Number(candidate.score || 0),
                        reasons: candidate.reasons,
                    })),
                }).catch(() => {
                    // telemetry is opportunistic
                });
            }

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

                console.log(`âœ… [Download] Completo: ${videoId} (${reason})`);

                // Atualizar status antes da cÃ³pia para refletir pÃ³s-download imediato.
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
                    console.log(`ðŸ“ [File] Copiado: ${finalVideoPath}`);

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

                    clearQueueRuntimeState(queueData?.id ?? null, videoId);
                    console.log(`ðŸŽ‰ [Complete] VÃ­deo pronto: ${videoId} (${processingTime}s)`);
                    VideoSelectionTelemetry.markOutcome(videoId, 'completed', 'download-complete').catch(() => {
                        // telemetry is opportunistic
                    });

                    // ðŸš€ Sinalizar materializaÃ§Ã£o completa via EventBus
                    eventBus.emit(SystemEvents.MATERIALIZATION_COMPLETED, {
                        videoId,
                        title: videoFile.name || 'VÃ­deo Novo',
                        thumbnail: (await prisma.video.findUnique({ where: { id: videoId }, select: { thumbnailPath: true } }))?.thumbnailPath,
                        processingTime
                    });

                    MediaVerificationService.verifyVideo(videoId)
                        .then((result) => {
                            if (result.verified) {
                                console.log(`ðŸ§ª [MediaVerification] ${videoId} audioPTBR=${result.hasPortugueseAudio} subPTBR=${result.hasPortugueseSubtitle}`);
                            }
                        })
                        .catch((error: any) => {
                            console.warn(`âš ï¸ [MediaVerification] Falha ao verificar ${videoId}: ${error?.message || error}`);
                        });

                    await cleanupDownloadFolder(downloadPath);

                    const seedUntil = new Date(Date.now() + SEED_DURATION_MINUTES * 60 * 1000);

                    if (activeSeeds.size < MAX_ACTIVE_SEEDS) {
                        activeSeeds.set(videoId, { torrent, startedAt: new Date() });
                        console.log(`ðŸŒ± [Seed] Mantendo seed por ${SEED_DURATION_MINUTES} minutos: ${videoId}`);

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

                                console.log(`ðŸ›‘ [Seed] Finalizado apÃ³s ${SEED_DURATION_MINUTES}min: ${videoId}`);
                            }
                        }, SEED_DURATION_MINUTES * 60 * 1000);
                    } else {
                        torrent.destroy();
                        console.log(`âš ï¸ [Seed] Slots cheios, destruindo torrent: ${videoId}`);
                    }

                    activeTorrents.delete(videoId);
                    lastUpdateCache.delete(videoId);

                    if (processingTime) SystemTelemetry.trackDownloadSuccess(processingTime * 1000);

                    resolve();
                } catch (err: any) {
                    reject(err);
                }
            };

            // ðŸ“Š ATUALIZAR PROGRESSO (a cada 2s)
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

                // Contar peers reais (usando wires) - CORREÃ‡ÃƒO do agente
                const realPeers = torrent.wires.length;
                // Seeds reais = peers que nÃ£o estÃ£o choked
                const realSeeds = torrent.wires.filter((w: any) => !w.peerChoking).length;

                // ðŸ’£ BOMBA A: Throttling de escrita no banco
                const lastUpdate = lastUpdateCache.get(videoId);
                const now = Date.now();
                const shouldUpdate = !lastUpdate ||
                    (progress - lastUpdate.progress >= MIN_PROGRESS_DELTA) ||
                    (now - lastUpdate.timestamp >= MIN_UPDATE_INTERVAL);

                if (shouldUpdate) {
                    await updateQueueProgressSafely(videoId, {
                        progress,
                        downloadSpeed,
                        uploadSpeed,
                        peers: realPeers,
                        seeds: realSeeds,
                        eta
                    }, now);
                }

                // ðŸ”´ PROBLEMA INVISÃVEL #2: Buffer swarm data (nÃ£o await pesado no interval)
                swarmDataBuffer.push({
                    infoHash: torrent.infoHash,
                    peers: realPeers,
                    seeds: realSeeds,
                    speed: downloadSpeed,
                    videoId
                });

                console.log(
                    `ðŸ“Š [Progress] ${videoId}: ${progress}% | ` +
                    `â†“${(downloadSpeed / 1024).toFixed(2)} MB/s | ` +
                    `â†‘${(uploadSpeed / 1024).toFixed(2)} MB/s | ` +
                    `Peers: ${realPeers} | ETA: ${eta ? `${eta}s` : '?'}` 
                );

                if (download.fileIndex !== undefined && download.fileIndex !== null && await isTargetFileReady()) {
                    await finalizeDownload('target-file-ready');
                }
            }, PROGRESS_UPDATE_INTERVAL);

            // âœ… DOWNLOAD COMPLETO
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
 * ðŸ’£ BOMBA B: PROCESSADOR DE FILA DE ENCODING (event-driven)
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
        console.log(`ðŸŽ¬ [Encoding] Iniciando ${job.videoId} (${activeEncodings}/${MAX_CONCURRENT_ENCODINGS})`);

        try {
            await convertToHLSSafe(job.inputPath, job.outputDir);
            console.log(`âœ… [Encoding] Finalizado ${job.videoId} (${activeEncodings - 1}/${MAX_CONCURRENT_ENCODINGS})`);
            job.resolve();
        } catch (err: any) {
            console.error(`âŒ [Encoding] Erro ${job.videoId}:`, err.message);
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
 * ðŸ§¹ BOMBA 6: LIMPEZA AUTOMÃTICA DE DISCO
 */
async function cleanupDownloadFolder(downloadPath: string): Promise<void> {
    try {
        await fs.rm(downloadPath, { recursive: true, force: true });
        console.log(`ðŸ§¹ [Cleanup] Pasta removida: ${downloadPath}`);
    } catch (err: any) {
        console.warn(`âš ï¸ [Cleanup] Falha ao limpar: ${err.message}`);
    }
}

/**
 * ðŸ”„ CONVERTE PARA HLS (BOMBA 2: REENCODING SEGURO)
 */
function convertToHLSSafe(inputPath: string, outputDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
        console.log(`ðŸ”„ [HLS] Convertendo: ${inputPath}`);

        ffmpeg(inputPath)
            .outputOptions([
                // BOMBA 2 RESOLVIDA: Reencoding para compatibilidade universal
                '-c:v', 'libx264',      // Codec de vÃ­deo universal
                '-c:a', 'aac',          // Codec de Ã¡udio universal
                '-preset', 'veryfast',  // Velocidade vs qualidade
                '-crf', '23',           // Qualidade (18-28, menor = melhor)
                '-threads', String(FFMPEG_THREADS), // ðŸ’£ BOMBA E: Limitar threads
                '-start_number', '0',
                '-hls_time', '10',
                '-hls_list_size', '0',
                '-f', 'hls'
            ])
            .output(path.join(outputDir, 'index.m3u8'))
            .on('progress', (progress) => {
                if (progress.percent) {
                    console.log(`ðŸ”„ [HLS] Progresso: ${Math.round(progress.percent)}%`);
                }
            })
            .on('end', () => {
                console.log('âœ… [HLS] ConversÃ£o completa');
                resolve();
            })
            .on('error', (err) => {
                console.error('âŒ [HLS] Erro:', err);
                reject(err);
            })
            .run();
    });
}

/**
 * ðŸ“Š OBTÃ‰M STATUS DE DOWNLOAD (do banco, nÃ£o da RAM)
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
 * ðŸ“‹ LISTA TODOS OS DOWNLOADS (do banco)
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
 * ðŸ›‘ CANCELA DOWNLOAD
 */
export async function cancelDownload(videoId: string): Promise<void> {
    attemptedFallbackHashes.delete(videoId);
    const download = await prisma.downloadQueue.findUnique({
        where: { videoId }
    });

    if (!download) {
        throw new Error('Download nÃ£o encontrado');
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
            error: 'Cancelado pelo usuÃ¡rio'
        }
    });

    await prisma.video.update({
        where: { id: videoId },
        data: { status: 'FAILED' }
    });

    clearQueueRuntimeState(null, videoId);
    console.log(`ðŸ›‘ [Cancel] Download cancelado: ${videoId}`);
}

/**
 * ðŸŽ¯ PRIORIZA DOWNLOAD (move para frente da fila)
 */
export async function prioritizeDownload(videoId: string, priority: number = 100): Promise<void> {
    await prisma.downloadQueue.update({
        where: { videoId },
        data: { priority }
    });

    console.log(`â¬†ï¸ [Priority] ${videoId} â†’ ${priority}`);
}

/**
 * ðŸ§  BOOST DE DEMANDA (Netflix thinking)
 * Quando um usuÃ¡rio tenta assistir algo que ainda estÃ¡ baixando,
 * aumentamos a prioridade automaticamente.
 */
export async function boostDemand(videoId: string, demandType: 'PLAY_ATTEMPT' | 'SEARCH' | 'FAVORITE' = 'PLAY_ATTEMPT'): Promise<void> {
    const download = await prisma.downloadQueue.findUnique({
        where: { videoId }
    });

    if (!download || download.status === 'COMPLETED') return;

    // Boost baseado no tipo de demanda
    const boostValues = {
        'PLAY_ATTEMPT': 50,  // UsuÃ¡rio tentou assistir
        'SEARCH': 10,        // Apareceu em busca
        'FAVORITE': 30       // UsuÃ¡rio favoritou
    };

    const newPriority = Math.min(100, download.priority + boostValues[demandType]);

    await prisma.downloadQueue.update({
        where: { videoId },
        data: { priority: newPriority }
    });

    console.log(`ðŸ”¥ [Demand] ${demandType} boost: ${videoId} â†’ ${newPriority}`);
}

/**
 * ðŸŽžï¸ VERIFICA SE Ã‰ ARQUIVO DE VÃDEO
 */
function isVideoFile(filename: string): boolean {
    const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm'];
    return videoExtensions.some(ext => filename.toLowerCase().endsWith(ext));
}

function isLikelyJunkVideoFile(filename: string): boolean {
    const normalized = String(filename || '').toLowerCase();
    return /(^|[ ._\-])(sample|trailer|extras?|featurette|behind[ ._\-]?the[ ._\-]?scenes|proof|preview)([ ._\-]|$)/i.test(normalized);
}

function isCandidateVideoFile(file: { name?: string | null; length?: number | null }): boolean {
    if (!file?.name || !isVideoFile(file.name) || isLikelyJunkVideoFile(file.name)) {
        return false;
    }

    return Number(file.length || 0) >= 50 * 1024 * 1024;
}

function normalizeTitleTokens(value?: string | null): string[] {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .map((token) => token.trim())
        .filter((token) => token.length >= 3);
}

function buildEpisodePatterns(seasonNumber?: number | null, episodeNumber?: number | null): RegExp[] {
    if (!Number.isInteger(seasonNumber) || !Number.isInteger(episodeNumber)) {
        return [];
    }

    const season = String(seasonNumber).padStart(2, '0');
    const episode = String(episodeNumber).padStart(2, '0');
    return [
        new RegExp(`s${season}e${episode}`, 'i'),
        new RegExp(`${Number(seasonNumber)}x${String(Number(episodeNumber)).padStart(2, '0')}`, 'i'),
        new RegExp(`season[ ._-]?${Number(seasonNumber)}[ ._-]?episode[ ._-]?${Number(episodeNumber)}`, 'i'),
        new RegExp(`temporada[ ._-]?${Number(seasonNumber)}[ ._-]?(episodio|ep)[ ._-]?${Number(episodeNumber)}`, 'i'),
    ];
}

async function getEpisodeSelectionContext(videoId: string): Promise<{
    title?: string | null;
    originalTitle?: string | null;
    seasonNumber?: number | null;
    episodeNumber?: number | null;
} | null> {
    try {
        const episode = await (prisma as any).episode.findFirst({
            where: { videoId },
            include: { series: true },
        });

        if (!episode?.series) {
            return null;
        }

        return {
            title: episode.series.title || null,
            originalTitle: episode.series.originalTitle || null,
            seasonNumber: episode.seasonNumber || null,
            episodeNumber: episode.episodeNumber || null,
        };
    } catch {
        return null;
    }
}

function selectBestTorrentVideoFile(
    files: Array<{ name?: string | null; path?: string | null; length?: number | null }>,
    context?: {
        title?: string | null;
        originalTitle?: string | null;
        seasonNumber?: number | null;
        episodeNumber?: number | null;
    } | null,
    adaptivePatternPolicies: Array<{ pattern: string; samples: number; scoreBias: number; audioPtBrRate?: number; subtitlePtBrRate?: number }> = []
) {
    return rankTorrentVideoFiles(files, context, adaptivePatternPolicies)[0]?.file || null;
}

function rankTorrentVideoFiles(
    files: Array<{ name?: string | null; path?: string | null; length?: number | null }>,
    context?: {
        title?: string | null;
        originalTitle?: string | null;
        seasonNumber?: number | null;
        episodeNumber?: number | null;
    } | null,
    adaptivePatternPolicies: Array<{ pattern: string; samples: number; scoreBias: number; audioPtBrRate?: number; subtitlePtBrRate?: number }> = []
) {
    const candidateFiles = files.filter((file) => isCandidateVideoFile(file));
    if (!candidateFiles.length) {
        return [];
    }

    const titleTokens = Array.from(new Set([
        ...normalizeTitleTokens(context?.title),
        ...normalizeTitleTokens(context?.originalTitle),
    ]));
    const episodePatterns = buildEpisodePatterns(context?.seasonNumber, context?.episodeNumber);

    return candidateFiles
        .map((file) => {
            const label = `${file.path || ''} ${file.name || ''}`.toLowerCase();
            let score = 0;
            const reasons: string[] = [];

            if (episodePatterns.some((pattern) => pattern.test(label))) {
                score += 120;
                reasons.push('episode-match');
            }

            const matchedTokens = titleTokens.filter((token) => label.includes(token)).length;
            if (matchedTokens > 0) {
                score += matchedTokens * 8;
                reasons.push(`title-tokens:${matchedTokens}`);
            }

            if (/complete season|season pack|temporada completa|collection/i.test(label)) {
                score -= 15;
                reasons.push('season-pack-penalty');
            }

            if (/2160|4k/i.test(label)) {
                score += 12;
                reasons.push('quality:2160p');
            } else if (/1080/i.test(label)) {
                score += 9;
                reasons.push('quality:1080p');
            } else if (/720/i.test(label)) {
                score += 6;
                reasons.push('quality:720p');
            }

            const sizeBoost = Math.min(30, Math.round(Number(file.length || 0) / (700 * 1024 * 1024) * 10));
            score += sizeBoost;
            reasons.push(`size:${sizeBoost}`);

            const adaptiveBias = adaptivePatternPolicies
                .filter((policy) => policy.samples >= 3 && matchesAdaptiveVideoPattern(label, policy.pattern))
                .reduce((sum, policy) => sum + Number(policy.scoreBias || 0), 0);
            if (adaptiveBias !== 0) {
                score += adaptiveBias;
                reasons.push(`adaptive:${adaptiveBias > 0 ? '+' : ''}${Number(adaptiveBias.toFixed(2))}`);
            }

            const adaptiveLanguageBias = adaptivePatternPolicies
                .filter((policy) => policy.samples >= 3 && matchesAdaptiveVideoPattern(label, policy.pattern))
                .reduce((sum, policy) => sum + ((Number(policy.audioPtBrRate || 0) * 0.06) + (Number(policy.subtitlePtBrRate || 0) * 0.03)), 0);
            if (adaptiveLanguageBias !== 0) {
                score += adaptiveLanguageBias;
                reasons.push(`lang-adaptive:${adaptiveLanguageBias > 0 ? '+' : ''}${Number(adaptiveLanguageBias.toFixed(2))}`);
            }

            return { file, score, reasons };
        })
        .sort((a, b) => b.score - a.score || Number(b.file.length || 0) - Number(a.file.length || 0));
}

function matchesAdaptiveVideoPattern(label: string, pattern: string) {
    switch (pattern) {
        case 'episode-code:sxxexx':
            return /s\d{2}e\d{2}/i.test(label);
        case 'episode-code:1x01':
            return /\d{1,2}x\d{2}/i.test(label);
        case 'shape:season-pack':
            return /complete season|season pack|temporada completa|collection/i.test(label);
        case 'quality:2160p':
            return /2160|4k/i.test(label);
        case 'quality:1080p':
            return /1080/i.test(label);
        case 'quality:720p':
            return /720/i.test(label);
        case 'language:ptbr-signal':
            return /dual|dublado|pt-br/i.test(label);
        case 'container:mkv':
            return /\.mkv$/i.test(label);
        case 'container:mp4':
            return /\.mp4$/i.test(label);
        default:
            return false;
    }
}

/**
 * ðŸ“ POSIÃ‡ÃƒO NA FILA
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
 * ðŸ” EXTRAI INFOHASH DO MAGNET
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
        console.warn(`âš ï¸ [Stall] Falha ao destruir torrent ativo ${videoId}: ${error?.message || error}`);
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
    const matches = [...haystack.matchAll(/(?:ðŸ‘¤|seed(?:s|ers?)?|peer(?:s)?)[^\d]{0,6}(\d{1,5})/gi)];
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

async function chooseFallbackStream(streams: any[], attemptedInfoHashes: Set<string>, titleHint: string, ref: {
    title: string;
    originalTitle?: string | null;
    imdbId?: string | number | null;
    tmdbId?: string | number | null;
    seasonNumber?: number | null;
    episodeNumber?: number | null;
    networkProfile?: 'stable' | 'degraded' | 'constrained' | 'unknown' | null;
}) {
    const sourcePolicyEntries = await Promise.all(
        Array.from(new Set(
            streams.map((stream: any) => String(stream?.addonName || stream?.provider || 'addon'))
        )).map(async (sourceName) => [sourceName, await SearchRankingTelemetry.getAdaptivePolicyForSource(sourceName)] as const)
    );
    const sourcePolicyMap = new Map(sourcePolicyEntries);
    const sourceCooldownEntries = await Promise.all(
        Array.from(new Set(
            streams.map((stream: any) => String(stream?.addonName || stream?.provider || 'addon'))
        )).map(async (sourceName) => [sourceName, await SearchRankingTelemetry.isSourceCoolingDown(sourceName)] as const)
    );
    const sourceCooldownMap = new Map(sourceCooldownEntries);

    const rankedByHeuristic = [...streams].sort((a: any, b: any) => {
        const specificityDelta = getEpisodeSpecificityScore(b, titleHint) - getEpisodeSpecificityScore(a, titleHint);
        if (specificityDelta !== 0) return specificityDelta;

        const aPolicy = sourcePolicyMap.get(String(a?.addonName || a?.provider || 'addon'));
        const bPolicy = sourcePolicyMap.get(String(b?.addonName || b?.provider || 'addon'));
        const aCooldown = sourceCooldownMap.get(String(a?.addonName || a?.provider || 'addon'));
        const bCooldown = sourceCooldownMap.get(String(b?.addonName || b?.provider || 'addon'));
        if (Boolean(aCooldown?.coolingDown) !== Boolean(bCooldown?.coolingDown)) {
            return aCooldown?.coolingDown ? 1 : -1;
        }
        const aAdaptiveBoost = Math.max(0, 8 - (Number(aPolicy?.minSeeds || 3) - 2) * 3);
        const bAdaptiveBoost = Math.max(0, 8 - (Number(bPolicy?.minSeeds || 3) - 2) * 3);
        if (aAdaptiveBoost !== bAdaptiveBoost) return bAdaptiveBoost - aAdaptiveBoost;

        const swarmDelta = getSwarmScore(b) - getSwarmScore(a);
        if (swarmDelta !== 0) return swarmDelta;

        return 0;
    });

    const availableCandidates = rankedByHeuristic
        .map((stream: any) => {
            const candidateMagnet = buildEnrichedMagnetURI({
                magnetURI: typeof stream?.url === 'string' && stream.url.startsWith('magnet:') ? stream.url : null,
                infoHash: stream?.infoHash,
                sources: stream?.sources,
            });
            const candidateInfoHash = extractInfoHash(candidateMagnet || '') || String(stream?.infoHash || '').toLowerCase();
            const sourcePolicy = sourcePolicyMap.get(String(stream?.addonName || stream?.provider || 'addon'));
            const sourceCooldown = sourceCooldownMap.get(String(stream?.addonName || stream?.provider || 'addon'));
            const streamTitle = `${stream?.title || ''} ${stream?.description || ''}`;
            const hasPortugueseSignal = /dublado|dual|pt-br|legendado/i.test(streamTitle);
            if (!candidateMagnet || !candidateInfoHash || attemptedInfoHashes.has(candidateInfoHash)) {
                return null;
            }
            if (sourceCooldown?.coolingDown && !hasPortugueseSignal) {
                return null;
            }
            if (getSwarmScore(stream) < Number(sourcePolicy?.minSeeds || 3) && !hasPortugueseSignal) {
                return null;
            }

            return {
                stream,
                magnetURI: candidateMagnet,
                infoHash: candidateInfoHash,
                fallbackScore: getEpisodeSpecificityScore(stream, titleHint) + getSwarmScore(stream),
            };
        })
        .filter(Boolean) as Array<{ stream: any; magnetURI: string; infoHash: string; fallbackScore: number }>;

    if (!availableCandidates.length) {
        return null;
    }

    const bestCandidate = await SourceIntelligence.chooseBestCandidate({
        title: ref.title,
        originalTitle: ref.originalTitle || null,
        imdbId: ref.imdbId || null,
        tmdbId: ref.tmdbId || null,
        preferredQuality: '1080p',
        preferredLanguage: /dublado|dual|pt-br|legendado/i.test(titleHint) ? 'pt-BR' : 'und',
    }, availableCandidates.map(({ stream, magnetURI, fallbackScore }) => ({
        magnetURI,
        sourceSite: String(stream?.addonName || stream?.provider || 'addon'),
        quality: String(stream?.title || stream?.name || '').match(/2160|4k/i)
            ? '2160p'
            : String(stream?.title || stream?.name || '').match(/1080/i)
                ? '1080p'
                : String(stream?.title || stream?.name || '').match(/720/i)
                    ? '720p'
                    : null,
        language: /dublado|dual|pt-br/i.test(`${stream?.title || ''} ${stream?.description || ''}`)
            ? 'pt-BR'
            : /legendado|sub/i.test(`${stream?.title || ''} ${stream?.description || ''}`)
                ? 'pt-BR-sub'
                : null,
        seeds: getSwarmScore(stream),
        title: `${stream?.title || ''} ${stream?.name || ''}`.trim() || titleHint,
        size: String(fallbackScore),
    })));

    if (bestCandidate) {
        return availableCandidates.find((candidate) =>
            candidate.magnetURI === bestCandidate.magnetURI
            && normalizeInfoHash(candidate.infoHash) === normalizeInfoHash(extractInfoHash(bestCandidate.magnetURI) || '')
        ) || availableCandidates[0];
    }

    return availableCandidates[0];
}

function normalizeInfoHash(value?: string | null) {
    return String(value || '').trim().toLowerCase();
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
    const ptBrPlan = PtBrQueryPlanner.build({
        title: episode.series.title,
        originalTitle: episode.series.originalTitle || episode.series.title,
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        preferPortugueseAudio: true,
    });
    const currentInfoHash = String(download.infoHash || extractInfoHash(download.magnetURI) || '').toLowerCase();
    const persistedAttempts = parseAttemptedHashesFromError(download.error);
    const attemptedInfoHashes = attemptedFallbackHashes.get(download.videoId) || persistedAttempts;
    for (const hash of persistedAttempts) {
        attemptedInfoHashes.add(hash);
    }
    if (currentInfoHash) attemptedInfoHashes.add(currentInfoHash);
    const streams = await AddonService.getStreamsFromAllAddons('series', streamId, {
        title: titleHint,
        titleAliases: ptBrPlan.aliases,
        searchVariants: ptBrPlan.searchVariants,
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        preferSeasonPack: ptBrPlan.preferSeasonPack,
        preferPortugueseAudio: true,
        acceptPortugueseSubtitles: true,
    });
    const fallbackStreamChoice = await chooseFallbackStream(streams, attemptedInfoHashes, titleHint, {
        title: titleHint,
        originalTitle: episode.series.title || null,
        imdbId: episode.series.imdbId || null,
        tmdbId: episode.series.tmdbId || null,
        seasonNumber: episode.seasonNumber || null,
        episodeNumber: episode.episodeNumber || null,
        networkProfile: 'unknown',
    });

    if (!fallbackStreamChoice) {
        return false;
    }

    const fallbackStream = fallbackStreamChoice.stream;
    const fallbackMagnet = fallbackStreamChoice.magnetURI;
    const fallbackInfoHash = fallbackStreamChoice.infoHash || String(fallbackStream.infoHash || '').toLowerCase();
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
    rarityBoostedQueueIds.delete(download.id);

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

    await SourceIntelligence.rememberWarmSuccess({
        title: titleHint,
        originalTitle: episode.series.title || null,
        imdbId: episode.series.imdbId || null,
        tmdbId: episode.series.tmdbId || null,
        preferredQuality: '1080p',
        preferredLanguage: /dublado|dual|pt-br|legendado/i.test(titleHint) ? 'pt-BR' : 'und',
        seasonNumber: episode.seasonNumber || null,
        episodeNumber: episode.episodeNumber || null,
        networkProfile: 'unknown',
    }, {
        magnetURI: fallbackMagnet,
        sourceSite: String(fallbackStream.addonName || fallbackStream.provider || 'addon'),
        quality: String(fallbackStream?.title || fallbackStream?.name || '').match(/2160|4k/i)
            ? '2160p'
            : String(fallbackStream?.title || fallbackStream?.name || '').match(/1080/i)
                ? '1080p'
                : String(fallbackStream?.title || fallbackStream?.name || '').match(/720/i)
                    ? '720p'
                    : null,
        language: /dublado|dual|pt-br/i.test(`${fallbackStream?.title || ''} ${fallbackStream?.description || ''}`)
            ? 'pt-BR'
            : /legendado|sub/i.test(`${fallbackStream?.title || ''} ${fallbackStream?.description || ''}`)
                ? 'pt-BR-sub'
                : null,
        seeds: getSwarmScore(fallbackStream),
        title: `${fallbackStream?.title || ''} ${fallbackStream?.name || ''}`.trim() || titleHint,
    });

    lastUpdateCache.delete(download.videoId);
    console.log(`ðŸ” [Fallback] ${download.videoId} trocado para ${fallbackStream.addonName || 'addon'} (${fallbackInfoHash || 'sem infoHash'})`);
    VideoSelectionTelemetry.markOutcome(download.videoId, 'fallback', String(fallbackStream.addonName || fallbackStream.provider || 'addon')).catch(() => {
        // telemetry is opportunistic
    });
    scheduleProcessQueue();
    return true;
}

/**
 * ðŸš€ INICIA PROCESSADOR DE FILA (chamar no server.ts)
 */
export async function startQueueProcessor() {
    console.log('ðŸš€ [Queue] Processador iniciado');

    // ðŸ”¥ BOMBA 8: Recovery on startup
    await recoverInterruptedDownloads();

    // ðŸ”´ V2.4: Cleanup de seeds expirados e recovery de seeds vÃ¡lidos
    await cleanupExpiredSeeds();

    // Processar fila periodicamente
    setInterval(() => {
        scheduleProcessQueue();
    }, PROCESSING_INTERVAL);

    // ðŸ”¥ BOMBA 7: Detectar torrents STALLED periodicamente
    setInterval(() => {
        detectStalledDownloads().catch(err => console.error('âŒ [Stall] Erro:', err));
    }, PROCESSING_INTERVAL * 12); // A cada 1 minuto

    // ðŸ”´ PROBLEMA INVISÃVEL #2: Iniciar batch processor de swarm
    startSwarmBatchProcessor();

    // ðŸ”´ PROBLEMA INVISÃVEL #1: Iniciar polÃ­tica de armazenamento
    startStoragePolicyEnforcer();

    // Verificar uso de disco no startup
    const storageUsage = await getStorageUsage();
    console.log(`ðŸ’¾ [Storage] Uso atual: ${storageUsage.usedGB}GB / ${storageUsage.maxGB}GB (${storageUsage.percentage}%)`);
}

/**
 * ðŸ”´ V2.4: CLEANUP DE SEEDS EXPIRADOS NO STARTUP
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
        console.log(`ðŸ§¹ [Seed] Limpando ${expiredSeeds.length} seeds expirados...`);

        // Marcar todos como inativos
        await prisma.seedState.updateMany({
            where: {
                id: { in: expiredSeeds.map((s: any) => s.id) }
            },
            data: { isActive: false }
        });
    }

    // Buscar seeds ainda vÃ¡lidos (opcional: re-attach para continuar seeding)
    const validSeeds = await prisma.seedState.findMany({
        where: {
            isActive: true,
            seedUntil: { gt: now }
        }
    });

    if (validSeeds.length > 0) {
        console.log(`ðŸŒ± [Seed] ${validSeeds.length} seeds vÃ¡lidos encontrados (nÃ£o reconectando nesta versÃ£o)`);
        // TODO: Implementar re-attach de torrents para continuar seeding apÃ³s restart
        // Por ora, apenas limpamos os seeds Ã³rfÃ£os
        await prisma.seedState.updateMany({
            where: {
                id: { in: validSeeds.map((s: any) => s.id) }
            },
            data: { isActive: false }
        });
    }

    console.log('âœ… [Seed] Cleanup de seeds concluÃ­do');
}

/**
 * ðŸ”¥ BOMBA 7: DETECTA TORRENTS STALLED (mortos)
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
        console.log(`âš ï¸ [Stall] Detectado torrent travado: ${candidate.videoId}`);

        try {
            const recovered = await tryEpisodeFallback(candidate);
            if (recovered) {
                fallbackRecovered += 1;
                continue;
            }
        } catch (error: any) {
            console.warn(`âš ï¸ [Fallback] Falhou para ${candidate.videoId}: ${error?.message || error}`);
        }

        if (!candidate.shouldFailIfUnrecoverable) {
            continue;
        }

        destroyActiveTorrent(candidate.videoId);

        console.log(`âš ï¸ [Stall] Detectado torrent travado: ${candidate.videoId}`);

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

        clearQueueRuntimeState(candidate.id, candidate.videoId);
    }

    const failedCount = [...fallbackCandidates.values()].filter((candidate) => candidate.shouldFailIfUnrecoverable).length - fallbackRecovered;
    if (fallbackCandidates.size > 0) {
        console.log(`ðŸ” [Stall] ${fallbackRecovered} fallback(s) aplicados, ${Math.max(0, failedCount)} download(s) marcados como STALLED`);
    }
}

/**
 * ðŸ”¥ BOMBA 8: RECOVERY ON STARTUP
 */
async function recoverInterruptedDownloads(): Promise<void> {
    console.log('ðŸ”„ [Recovery] Verificando downloads interrompidos...');

    // Buscar downloads que estavam em andamento quando o servidor caiu
    const interrupted = await prisma.downloadQueue.findMany({
        where: {
            status: { in: ['DOWNLOADING', 'PROCESSING'] }
        }
    });

    if (interrupted.length === 0) {
        console.log('âœ… [Recovery] Nenhum download interrompido encontrado');
        return;
    }

    console.log(`ðŸ”„ [Recovery] Encontrados ${interrupted.length} download(s) interrompidos`);

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

        console.log(`ðŸ”„ [Recovery] Resetado: ${download.videoId}`);
    }

    console.log('âœ… [Recovery] Downloads interrompidos serÃ£o reprocessados');
}

// ðŸ§  ESTATÃSTICAS DO SISTEMA
export async function getSystemStats() {
    const [queued, downloading, processing, completed, failed] = await Promise.all([
        prisma.downloadQueue.count({ where: { status: 'QUEUED' } }),
        prisma.downloadQueue.count({ where: { status: 'DOWNLOADING' } }),
        prisma.downloadQueue.count({ where: { status: 'PROCESSING' } }),
        prisma.downloadQueue.count({ where: { status: 'COMPLETED' } }),
        prisma.downloadQueue.count({ where: { status: 'FAILED' } })
    ]);

    // Tempo mÃ©dio de processamento
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
 * ðŸ§  ÃNDICE DE RARIDADE (IDEIA PIONEIRA)
 * Formula: rarityScore = (peers * speed) / size
 * Quanto MENOR o score, MAIS raro Ã© o conteÃºdo
 */
export function calculateRarityScore(peers: number, speedKB: number, sizeMB: number): number {
    if (sizeMB === 0) return 0;
    const score = (peers * speedKB) / sizeMB;
    // Normalizar para escala 0-100 (invertida: maior = mais raro)
    const normalizedScore = Math.max(0, 100 - Math.min(100, score * 10));
    return Math.round(normalizedScore * 100) / 100;
}

/**
 * ðŸ—‘ï¸ LIMPAR DOWNLOADS ANTIGOS COMPLETOS (manutenÃ§Ã£o de disco)
 */
export async function cleanupOldDownloads(daysOld: number = 30): Promise<number> {
    const threshold = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

    const result = await prisma.downloadQueue.deleteMany({
        where: {
            status: 'COMPLETED',
            completedAt: { lt: threshold }
        }
    });

    console.log(`ðŸ—‘ï¸ [Cleanup] Removidos ${result.count} registros antigos da fila`);
    return result.count;
}

// ============================================================
// ðŸ”´ PROBLEMA INVISÃVEL #1: GESTÃƒO INTELIGENTE DE ARMAZENAMENTO
// ============================================================

/**
 * ðŸ“Š Calcula uso atual de disco em GB
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
        console.warn('âš ï¸ [Storage] Erro ao calcular uso de disco');
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
 * ðŸ§¹ CDN CACHE POLICY: Remove vÃ­deos menos assistidos quando disco cheio
 */
export async function enforceStoragePolicy(): Promise<{ removedCount: number; freedGB: number }> {
    const usage = await getStorageUsage();

    if (usage.percentage < 90) {
        console.log(`âœ… [Storage] Uso: ${usage.percentage}% - Dentro do limite`);
        return { removedCount: 0, freedGB: 0 };
    }

    console.log(`âš ï¸ [Storage] Uso: ${usage.percentage}% - Iniciando limpeza inteligente`);

    // ðŸ”´ V2.4: PolÃ­tica de retenÃ§Ã£o inteligente (views + recÃªncia)
    const unwatchedThreshold = new Date(Date.now() - MAX_AGE_DAYS_UNWATCHED * 24 * 60 * 60 * 1000);

    // Buscar vÃ­deos candidatos para remoÃ§Ã£o:
    // 1. Menos de MIN_VIEWS_TO_KEEP views
    // 2. OU nÃ£o assistido hÃ¡ mais de MAX_AGE_DAYS_UNWATCHED dias
    const candidates = await prisma.video.findMany({
        where: {
            status: 'READY',
            OR: [
                // CondiÃ§Ã£o 1: Poucos views E nÃ£o foi assistido recentemente
                {
                    views: { lt: MIN_VIEWS_TO_KEEP },
                    lastViewedAt: { lt: unwatchedThreshold }
                },
                // CondiÃ§Ã£o 2: Nunca foi assistido
                {
                    lastViewedAt: null,
                    createdAt: { lt: unwatchedThreshold }
                },
                // ðŸ”´ V2.5: Limpeza agressiva de prefetch preditivo (Autobot)
                // Se baixamos automaticamente e ninguÃ©m viu em 3 dias, tchau.
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
            // Remover arquivos fÃ­sicos
            const hlsPath = path.join(process.cwd(), 'uploads', 'hls', video.id);
            const videoPath = path.join(process.cwd(), 'uploads', `${video.id}.mp4`);

            const hlsSize = await getDirectorySize(hlsPath).catch(() => 0);
            const videoSize = await fs.stat(videoPath).then(s => s.size).catch(() => 0);

            await fs.rm(hlsPath, { recursive: true, force: true }).catch(() => { });
            await fs.rm(videoPath, { force: true }).catch(() => { });

            // Atualizar status no banco (nÃ£o deletar, apenas marcar como removido)
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

            console.log(`ðŸ—‘ï¸ [CDN] Removido: ${video.title} (${((hlsSize + videoSize) / 1024 / 1024).toFixed(2)}MB)`);
        } catch (err) {
            console.warn(`âš ï¸ [CDN] Erro ao remover ${video.id}`);
        }
    }

    const freedGB = freedBytes / 1024 / 1024 / 1024;
    console.log(`âœ… [CDN] Limpeza concluÃ­da: ${removedCount} vÃ­deos, ${freedGB.toFixed(2)}GB liberados`);

    return { removedCount, freedGB };
}

// ============================================================
// ðŸ”´ PROBLEMA INVISÃVEL #2: BATCH PROCESSING PARA SWARM DATA
// ============================================================

/**
 * ðŸ”„ Processa buffer de swarm data em batch (nÃ£o bloqueia event loop)
 */
async function flushSwarmDataBuffer(): Promise<void> {
    if (swarmDataBuffer.length === 0) return;

    const dataToProcess = [...swarmDataBuffer];
    swarmDataBuffer.length = 0; // Limpar buffer

    // Agrupar por videoId (pegar Ãºltimo valor de cada)
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
        console.log(`ðŸ“¡ [Swarm] Batch processado: ${latestData.size} torrents`);
    }
}

/**
 * ðŸš€ Inicia batch processor de swarm data
 */
export function startSwarmBatchProcessor(): void {
    setInterval(() => {
        flushSwarmDataBuffer().catch(err => console.error('âŒ [Swarm Batch] Erro:', err));
    }, SWARM_BATCH_INTERVAL);

    console.log(`ðŸ“¡ [Swarm] Batch processor iniciado (interval: ${SWARM_BATCH_INTERVAL}ms)`);
}

/**
 * ðŸš€ Inicia polÃ­tica de armazenamento periÃ³dica
 */
export function startStoragePolicyEnforcer(): void {
    // Verificar a cada 1 hora
    setInterval(() => {
        enforceStoragePolicy().catch(err => console.error('âŒ [Storage Policy] Erro:', err));
    }, 60 * 60 * 1000);

    console.log(`ðŸ’¾ [Storage] Policy enforcer iniciado (check: 1h)`);
}

/**
 * ðŸ“ˆ V2.6: CÃLCULO DE PRECISÃƒO DE PREDIÃ‡ÃƒO (Feedback Loop)
 * Mede quÃ£o bem o Arconte estÃ¡ antecipando o desejo dos usuÃ¡rios.
 */
export async function getPredictionAccuracy(): Promise<{ accuracy: number; total: number; successful: number }> {
    const predictiveVideos = await prisma.video.findMany({
        where: { isPredictive: true },
        select: { views: true }
    });

    if (predictiveVideos.length === 0) {
        return { accuracy: 100, total: 0, successful: 0 }; // Neutro se nÃ£o houver dados
    }

    const successful = predictiveVideos.filter(v => v.views > 0).length;
    const accuracy = (successful / predictiveVideos.length) * 100;

    return {
        accuracy,
        total: predictiveVideos.length,
        successful
    };
}

// ðŸ”¥ AUTO-INIT (BOMBA 8: Recovery & FSM)
// Inicia o sistema de orquestraÃ§Ã£o automaticamente ao carregar o mÃ³dulo
setTimeout(() => {
    initDownloader().catch(err => console.error('Failed to auto-init downloader:', err));
}, 2000);

// ðŸ›¡ï¸ ZOMBIE RECOVERY V2 (Enterprise Grade)
async function recoverZombieJobsEnterprise() {
    console.log('ðŸš‘ [Recovery V2] Buscando jobs zumbis...');

    // Buscar jobs ativos (DOWNLOADING/TRANSCODING/CONNECTING)
    const activeJobs = await prisma.downloadQueue.findMany({
        where: {
            status: { in: [DownloadState.DOWNLOADING, DownloadState.TRANSCODING, DownloadState.CONNECTING, 'PROCESSING'] }
        }
    });

    const ZOMBIE_THRESHOLD = 2 * 60 * 1000; // 2 min tolerÃ¢ncia
    const now = Date.now();
    let recoveredCount = 0;

    for (const job of activeJobs) {
        // Se updateAt for nulo (nÃ£o deveria), usa queuedAt
        const lastUpdate = new Date(job.updatedAt || job.queuedAt).getTime();

        if (now - lastUpdate > ZOMBIE_THRESHOLD) {
            console.log(`ðŸ§Ÿ [Recovery] Job ${job.videoId} detectado como zumbi (last update: ${job.updatedAt?.toISOString()}). Resetando...`);

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
        console.log(`âœ… [Recovery] ${recoveredCount} jobs zumbis recuperados.`);
        SystemTelemetry.trackZombieRecovery(recoveredCount);
    }
    else console.log('âœ¨ [Recovery] Nenhum job zumbi encontrado.');
}

// ðŸ›¡ï¸ GRACEFUL SHUTDOWN (Industrial standard)
export async function shutdownDownloader() {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log('ðŸ›‘ [Shutdown] Iniciando parada graciosa do Torrent Downloader...');

    // 1. Pausar aceitaÃ§Ã£o de novos jobs (feito via flag)

    // 2. Destruir cliente WebTorrent (para conexÃµes P2P)
    if (client) {
        try {
            client.destroy((err: any) => {
                if (err) console.error('Error destroying client:', err);
                else console.log('âœ… [Shutdown] WebTorrent client destroyed.');
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
            console.log(`ðŸ’¾ [Shutdown] Salvando estado de ${activeJobs} jobs ativos...`);
            await prisma.downloadQueue.updateMany({
                where: { status: { in: [DownloadState.DOWNLOADING, DownloadState.TRANSCODING, DownloadState.CONNECTING] } },
                data: { status: DownloadState.QUEUED }
            });
        }
    } catch (e) {
        console.error('Error saving shutdown state:', e);
    }

    console.log('âœ… [Shutdown] Downloader parado com seguranÃ§a.');
}

