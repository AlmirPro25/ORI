/**
 * TORRENT DOWNLOADER - Download completo para servidor
 * 
 * Baixa torrents completos, processa para HLS e salva no banco
 */

// import WebTorrent from 'webtorrent';
// @ts-ignore
let client: any = null;

async function getClient() {
    if (!client) {
        const { default: WebTorrent } = await (new Function('return import("webtorrent")')());
        client = new WebTorrent();
    }
    return client;
}
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
// @ts-ignore
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import { updateSwarmHealth } from './intelligence-engine';

const prisma = new PrismaClient();

ffmpeg.setFfmpegPath(ffmpegPath.path);

interface DownloadProgress {
    videoId: string;
    progress: number;
    downloadSpeed: number;
    status: 'downloading' | 'processing' | 'ready' | 'error';
    error?: string;
}

// Cache de downloads em progresso
const activeDownloads = new Map<string, DownloadProgress>();

// Cliente WebTorrent para downloads (removido para inicialização tardia)
// const client = new WebTorrent();

/**
 * Inicia download de um torrent para o servidor
 */
// Interface unificada para o novo contrato de Materialização
interface TorrentDownloadParams {
    magnetURI: string;
    userId?: string;
    videoId?: string; // Se fornecido, é uma materialização de catálogo
    title: string;
    description?: string;
    category?: string;
}

/**
 * Inicia download de um torrent para o servidor
 */
export async function downloadTorrentToServer({
    magnetURI,
    userId = 'system',
    videoId = undefined,
    title,
    description,
    category
}: TorrentDownloadParams): Promise<{ videoId: string; message: string }> {

    let video;
    let finalVideoId: string;

    if (videoId) {
        // MODO MATERIALIZAÇÃO (CATALOG -> PROCESSING)
        // Usamos o registro existente e apenas mudamos o estado
        console.log(`[DOWNLOADER] 🔄 Materializando vídeo existente: ${videoId}`);

        video = await prisma.video.update({
            where: { id: videoId },
            data: {
                status: 'PROCESSING',
                materializationRequestedAt: new Date(), // Analytics & Queue management
                // Opcional: Atualizar storageKey se não tiver, mas geralmente o catálogo já tem o magnet lá.
                // Mas aqui o storageKey vai virar o caminho do arquivo depois.
            } as any
        });
        finalVideoId = videoId;

    } else {
        // MODO LEGADO / UPLOAD DIRETO
        // Cria novo registro do zero
        console.log(`[DOWNLOADER] ✨ Criando novo download para: ${title}`);

        video = await prisma.video.create({
            data: {
                title,
                description: description || '',
                category: category || 'Geral',
                originalFilename: 'torrent-download',
                status: 'PROCESSING',
                userId: userId || undefined
            } as any
        });
        finalVideoId = video.id;
    }

    // Iniciar download
    activeDownloads.set(finalVideoId, {
        videoId: finalVideoId,
        progress: 0,
        downloadSpeed: 0,
        status: 'downloading'
    });

    // Download assíncrono (mantém o mesmo ID)
    downloadAndProcess(magnetURI, finalVideoId).catch(async (err) => {
        console.error(`❌ Erro no download ${finalVideoId}:`, err);
        activeDownloads.set(finalVideoId, {
            videoId: finalVideoId,
            progress: 0,
            downloadSpeed: 0,
            status: 'error',
            error: err.message
        });

        await prisma.video.update({
            where: { id: finalVideoId },
            data: { status: 'FAILED' }
        });
    });

    return {
        videoId: finalVideoId,
        message: 'Download iniciado! Acompanhe o progresso via /api/v1/downloads/:videoId'
    };
}

/**
 * Baixa e processa o torrent
 */
async function downloadAndProcess(magnetURI: string, videoId: string) {
    const downloadPath = path.join(process.cwd(), 'downloads', videoId);
    const uploadsPath = path.join(process.cwd(), 'uploads');
    const hlsPath = path.join(uploadsPath, 'hls', videoId);

    // Criar diretórios
    if (!fs.existsSync(downloadPath)) fs.mkdirSync(downloadPath, { recursive: true });
    if (!fs.existsSync(hlsPath)) fs.mkdirSync(hlsPath, { recursive: true });

    const client = await getClient();
    return new Promise<void>((resolve, reject) => {
        console.log(`📥 Iniciando download: ${videoId}`);

        client.add(magnetURI, { path: downloadPath }, async (torrent: any) => {
            console.log(`✅ Torrent adicionado: ${torrent.name}`);

            // Encontrar arquivo de vídeo
            const videoFile = torrent.files.find((f: any) =>
                f.name.match(/\.(mp4|mkv|webm|avi|mov)$/i)
            ) || torrent.files.reduce((prev: any, curr: any) =>
                prev.length > curr.length ? prev : curr
            );

            if (!videoFile) {
                reject(new Error('Nenhum arquivo de vídeo encontrado no torrent'));
                return;
            }

            console.log(`🎬 Arquivo de vídeo: ${videoFile.name}`);

            // Atualizar progresso e coletar dados do swarm
            const progressInterval = setInterval(async () => {
                const progress = Math.round(torrent.progress * 100);
                activeDownloads.set(videoId, {
                    videoId,
                    progress,
                    downloadSpeed: torrent.downloadSpeed,
                    status: 'downloading'
                });

                // 🧠 COLETA DE INTELIGÊNCIA DO SWARM
                await updateSwarmHealth(
                    torrent.infoHash,
                    torrent.numPeers,
                    torrent.numPeers, // WebTorrent não separa seeds/peers facilmente
                    torrent.downloadSpeed / 1024, // KB/s
                    videoId
                );

                console.log(`📊 Download ${videoId}: ${progress}% - ${(torrent.downloadSpeed / 1024 / 1024).toFixed(2)} MB/s - Peers: ${torrent.numPeers}`);
            }, 2000);

            // Aguardar download completo
            torrent.on('done', async () => {
                clearInterval(progressInterval);
                console.log(`✅ Download completo: ${videoId}`);

                activeDownloads.set(videoId, {
                    videoId,
                    progress: 100,
                    downloadSpeed: 0,
                    status: 'processing'
                });

                try {
                    // Caminho do arquivo baixado
                    const videoFilePath = path.join(downloadPath, videoFile.path);
                    const finalVideoPath = path.join(uploadsPath, `${videoId}.mp4`);

                    // Copiar para uploads
                    fs.copyFileSync(videoFilePath, finalVideoPath);
                    console.log(`📁 Arquivo copiado para: ${finalVideoPath}`);

                    // Processar para HLS
                    await convertToHLS(finalVideoPath, hlsPath);

                    // Atualizar banco de dados
                    await prisma.video.update({
                        where: { id: videoId },
                        data: {
                            status: 'READY',
                            originalFilename: videoFile.name,
                            storageKey: finalVideoPath,
                            hlsPath: path.join('hls', videoId, 'index.m3u8')
                        }
                    });

                    activeDownloads.set(videoId, {
                        videoId,
                        progress: 100,
                        downloadSpeed: 0,
                        status: 'ready'
                    });

                    console.log(`🎉 Vídeo pronto: ${videoId}`);

                    // Limpar torrent
                    torrent.destroy();

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
 * Converte vídeo para HLS
 */
function convertToHLS(inputPath: string, outputDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
        console.log(`🔄 Convertendo para HLS: ${inputPath}`);

        ffmpeg(inputPath)
            .outputOptions([
                '-codec copy',
                '-start_number 0',
                '-hls_time 10',
                '-hls_list_size 0',
                '-f hls'
            ])
            .output(path.join(outputDir, 'index.m3u8'))
            .on('end', () => {
                console.log('✅ Conversão HLS completa');
                resolve();
            })
            .on('error', (err) => {
                console.error('❌ Erro na conversão HLS:', err);
                reject(err);
            })
            .run();
    });
}

/**
 * Obtém progresso de um download
 */
export function getDownloadProgress(videoId: string): DownloadProgress | null {
    return activeDownloads.get(videoId) || null;
}

/**
 * Lista todos os downloads ativos
 */
export function listActiveDownloads(): DownloadProgress[] {
    return Array.from(activeDownloads.values());
}

/**
 * Cancela um download
 */
export async function cancelDownload(videoId: string): Promise<void> {
    const download = activeDownloads.get(videoId);
    if (!download) {
        throw new Error('Download não encontrado');
    }

    // Remover do cache
    activeDownloads.delete(videoId);

    // Atualizar banco
    await prisma.video.update({
        where: { id: videoId },
        data: { status: 'FAILED' }
    });

    console.log(`🛑 Download cancelado: ${videoId}`);
}
