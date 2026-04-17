/**
 * TORRENT GATEWAY - Streaming Server
 * 
 * Este serviço baixa torrents via TCP/UDP (muito mais rápido que WebRTC)
 * e serve os arquivos via HTTP streaming para o frontend.
 */

import WebTorrent from 'webtorrent';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ffmpegPath = require('@ffmpeg-installer/ffmpeg');
const ffprobePath = require('@ffprobe-installer/ffprobe');
const ffmpeg = require('fluent-ffmpeg');

ffmpeg.setFfmpegPath(ffmpegPath.path);
ffmpeg.setFfprobePath(ffprobePath.path);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3333;
const PREVIEW_METADATA_TIMEOUT_MS = 12000;
const SHORT_SESSION_CLEANUP_MS = 30 * 1000;
const LONG_SESSION_CACHE_MS = 5 * 60 * 1000;
const LONG_WATCH_THRESHOLD_SECONDS = 10 * 60;
const REWIND_AFTER_LONG_WATCH_SECONDS = 5 * 60;
const MAX_STREAMS_PER_TORRENT = 3;
const HIGH_PRESSURE_ACTIVE_STREAMS = 8;
const PRESSURED_CACHE_MS = 60 * 1000;

// Cliente WebTorrent do servidor (usa TCP/UDP - muito mais rápido!)
const client = new WebTorrent({
    tracker: {
        wrtc: false, // Desabilita WebRTC no servidor
        announce: [
            'udp://tracker.opentrackr.org:1337/announce',
            'udp://open.stealth.si:80/announce',
            'udp://tracker.torrent.eu.org:451/announce',
            'udp://exodus.desync.com:6969/announce',
            'udp://tracker.moeking.me:6969/announce',
            'udp://explodie.org:6969/announce',
            'udp://tracker.openbittorrent.com:6969/announce',
            'udp://tracker.internetwarriors.net:1337/announce'
        ]
    },
    dht: true,
    lsd: true
});

// Cache de torrents ativos
const activeTorrents = new Map();

function getTorrentDownloadDir(infoHash) {
    return path.join(__dirname, 'downloads', infoHash);
}

function getTorrentSession(infoHash, torrent = null) {
    const existing = activeTorrents.get(infoHash);
    if (existing) {
        if (torrent) existing.torrent = torrent;
        return existing;
    }

    const session = {
        infoHash,
        torrent,
        activeStreams: 0,
        cleanupTimer: null,
        lastActivityAt: Date.now(),
        lastPlaybackPosition: 0,
        highestPlaybackPosition: 0,
        downloadPath: getTorrentDownloadDir(infoHash),
    };

    activeTorrents.set(infoHash, session);
    return session;
}

function normalizeInfoHash(value) {
    return String(value || '').trim().toLowerCase();
}

function findClientTorrent(infoHash) {
    const normalized = normalizeInfoHash(infoHash);
    if (!normalized) return null;
    return client.torrents.find((torrent) => normalizeInfoHash(torrent?.infoHash) === normalized) || null;
}

function ensureTorrentSession(infoHash) {
    const normalized = normalizeInfoHash(infoHash);
    if (!normalized) return null;

    const existing = activeTorrents.get(normalized);
    if (existing) {
        if (!existing.torrent) {
            const clientTorrent = findClientTorrent(normalized);
            if (clientTorrent) {
                existing.torrent = clientTorrent;
            }
        }
        return existing;
    }

    const clientTorrent = findClientTorrent(normalized);
    if (!clientTorrent) return null;
    return getTorrentSession(normalized, clientTorrent);
}

function clearCleanupTimer(session) {
    if (session?.cleanupTimer) {
        clearTimeout(session.cleanupTimer);
        session.cleanupTimer = null;
    }
}

function getTotalActiveStreams() {
    let total = 0;
    for (const session of activeTorrents.values()) {
        total += Number(session?.activeStreams || 0);
    }
    return total;
}

function shouldUsePressureMode() {
    return getTotalActiveStreams() >= HIGH_PRESSURE_ACTIVE_STREAMS;
}

function tryAcquireStreamSlot(session) {
    if (!session) {
        return { ok: false, status: 404, error: 'SessÃ£o do torrent nÃ£o encontrada' };
    }

    if (session.activeStreams >= MAX_STREAMS_PER_TORRENT) {
        return {
            ok: false,
            status: 429,
            error: 'Limite de streams simultÃ¢neos para este torrent atingido',
        };
    }

    clearCleanupTimer(session);
    session.activeStreams += 1;
    session.lastActivityAt = Date.now();

    return { ok: true };
}

function releaseStreamSlot(session, infoHash) {
    if (!session) return;

    session.activeStreams = Math.max(0, session.activeStreams - 1);
    session.lastActivityAt = Date.now();
    scheduleTorrentCleanup(infoHash);
}

function selectOnlyFile(torrent, fileIndex) {
    torrent.files.forEach((file, index) => {
        if (index === fileIndex) {
            return;
        }

        try {
            file.deselect();
        } catch (_) { }
    });
}

async function finalizeTorrentSession(infoHash, { removePartialData }) {
    const session = activeTorrents.get(infoHash);
    if (!session) return;

    clearCleanupTimer(session);

    if (session.torrent) {
        try {
            session.torrent.files?.forEach((file) => {
                try { file.deselect(); } catch (_) { }
            });
        } catch (_) { }

        try {
            session.torrent.destroy();
        } catch (_) { }
    }

    activeTorrents.delete(infoHash);

    if (removePartialData) {
        await fs.rm(session.downloadPath, { recursive: true, force: true }).catch(() => { });
    }
}

function scheduleTorrentCleanup(infoHash) {
    const session = activeTorrents.get(infoHash);
    if (!session || session.activeStreams > 0) return;

    clearCleanupTimer(session);

    const keepPartialBuffer =
        session.highestPlaybackPosition >= LONG_WATCH_THRESHOLD_SECONDS ||
        session.lastPlaybackPosition >= LONG_WATCH_THRESHOLD_SECONDS;

    const cleanupDelay = shouldUsePressureMode()
        ? Math.min(PRESSURED_CACHE_MS, keepPartialBuffer ? PRESSURED_CACHE_MS : SHORT_SESSION_CLEANUP_MS)
        : (keepPartialBuffer ? LONG_SESSION_CACHE_MS : SHORT_SESSION_CLEANUP_MS);

    session.cleanupTimer = setTimeout(() => {
        const latest = activeTorrents.get(infoHash);
        if (!latest || latest.activeStreams > 0) return;

        void finalizeTorrentSession(infoHash, {
            removePartialData: !keepPartialBuffer,
        });
    }, cleanupDelay);
}

function normalizeRange(rangeHeader, fileSize) {
    if (!rangeHeader) return null;

    const parts = String(rangeHeader).replace(/bytes=/, '').split('-');
    let start = Number.parseInt(parts[0], 10);
    let end = parts[1] ? Number.parseInt(parts[1], 10) : fileSize - 1;

    if (Number.isNaN(start)) {
        return null;
    }

    if (Number.isNaN(end) || end >= fileSize) {
        end = fileSize - 1;
    }

    if (start < 0) start = 0;
    if (start >= fileSize || end < start) {
        return null;
    }

    return {
        start,
        end,
        chunkSize: end - start + 1,
    };
}

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        torrents: activeTorrents.size,
        activeStreams: getTotalActiveStreams(),
        pressureMode: shouldUsePressureMode(),
        downloadSpeed: client.downloadSpeed,
        uploadSpeed: client.uploadSpeed,
        ratio: client.ratio
    });
});

/**
 * Adiciona um torrent e retorna informações dos arquivos
 */
app.post('/api/torrent/add', async (req, res) => {
    const { magnetURI, preview = false } = req.body;

    if (!magnetURI) {
        return res.status(400).json({ error: 'magnetURI é obrigatório' });
    }

    console.log('📥 Adicionando torrent:', magnetURI.substring(0, 60) + '...');

    try {
        // Extrair infoHash do magnet
        const hashMatch = magnetURI.match(/btih:([a-zA-Z0-9]+)/i);
        const infoHash = hashMatch ? hashMatch[1].toLowerCase() : null;

        console.log('🔑 InfoHash extraído:', infoHash);

        // Verificar se já existe (síncrono)
        let torrent = null;

        if (infoHash) {
            const existingTorrent = client.torrents.find(t => t.infoHash === infoHash);
            if (existingTorrent) {
                torrent = existingTorrent;
                console.log('♻️ Torrent já existe:', torrent.infoHash);
            }
        }

        // Se já tem metadata, retorna direto
        if (torrent && torrent.metadata) {
            if (torrent.infoHash) {
                getTorrentSession(torrent.infoHash, torrent);
                scheduleTorrentCleanup(torrent.infoHash);
            }
            console.log('⚡ Metadata já disponível:', torrent.name);
            return res.json(formatTorrentInfo(torrent));
        }

        // Se não existe, adicionar novo
        if (!torrent) {
            console.log('🆕 Adicionando novo torrent...');

            try {
                torrent = client.add(magnetURI, {
                    path: getTorrentDownloadDir(infoHash || 'shared')
                });
                console.log('📦 Torrent adicionado, tipo:', typeof torrent, torrent?.constructor?.name);
            } catch (err) {
                // Se for erro de duplicata, tenta recuperar o existente
                if (err.message && err.message.includes('duplicate')) {
                    console.log('♻️ Detectado torrent duplicado (catch), recuperando...');
                    torrent = client.get(magnetURI);
                    if (torrent) {
                        console.log('✅ Torrent recuperado com sucesso:', torrent.infoHash);
                    } else {
                        console.error('❌ Erro: Torrent diz ser duplicado mas não foi encontrado.');
                        throw err;
                    }
                } else {
                    throw err;
                }
            }
        }

        // Aguardar se for Promise
        if (torrent && typeof torrent.then === 'function') {
            console.log('⏳ Aguardando Promise...');
            torrent = await torrent;
            console.log('✅ Promise resolvida:', torrent?.infoHash || 'sem infoHash');
        }

        // Validar torrent
        if (!torrent || typeof torrent.on !== 'function') {
            console.error('❌ Torrent inválido após todas tentativas');
            throw new Error('Falha ao inicializar torrent');
        }

        console.log('✅ Torrent válido:', torrent.infoHash || 'aguardando infoHash');

        // Registrar no cache
        if (torrent.infoHash) {
            getTorrentSession(torrent.infoHash, torrent);
        }

        // Se já tem metadata, retorna direto
        if (torrent.metadata) {
            if (torrent.infoHash) {
                scheduleTorrentCleanup(torrent.infoHash);
            }
            console.log('⚡ Metadata já disponível:', torrent.name);
            return res.json(formatTorrentInfo(torrent));
        }

        // Aguardar metadata
        console.log('⏳ Aguardando metadata...');
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error(`Timeout aguardando metadata (${preview ? PREVIEW_METADATA_TIMEOUT_MS / 1000 : 45}s)`));
            }, preview ? PREVIEW_METADATA_TIMEOUT_MS : 45000);

            const onMetadata = () => {
                cleanup();
                console.log('💎 Metadata recebida:', torrent.name);
                if (torrent.infoHash) {
                    getTorrentSession(torrent.infoHash, torrent);
                    scheduleTorrentCleanup(torrent.infoHash);
                }
                resolve(torrent);
            };

            const onError = (err) => {
                cleanup();
                console.error('❌ Erro no torrent durante metadata:', err.message);
                reject(err);
            };

            const cleanup = () => {
                torrent.removeListener('metadata', onMetadata);
                torrent.removeListener('error', onError);
                clearTimeout(timeout);
            };

            torrent.on('metadata', onMetadata);
            torrent.on('error', onError);

            // Double check
            if (torrent.metadata) onMetadata();
        });

        res.json(formatTorrentInfo(torrent));
    } catch (error) {
        console.error('❌ Falha ao processar torrent:', error.message);
        console.error('Stack:', error.stack);
        if (preview && /Timeout aguardando metadata/i.test(String(error.message || ''))) {
            return res.status(202).json({
                pending: true,
                error: error.message
            });
        }
        res.status(500).json({ error: error.message });
    }
});

/**
 * Lista todos os torrents ativos
 */
app.get('/api/torrent/list', (req, res) => {
    const torrents = Array.from(activeTorrents.values())
        .map((session) => formatTorrentInfo(session.torrent))
        .filter((item) => !item?.error);
    res.json(torrents);
});

app.get('/api/torrent/:infoHash', (req, res, next) => {
    const infoHash = normalizeInfoHash(req.params.infoHash);
    const session = ensureTorrentSession(infoHash);

    if (!session) {
        return next();
    }

    session.lastActivityAt = Date.now();
    clearCleanupTimer(session);

    if (!session.torrent) {
        return res.json({
            infoHash,
            name: 'Preparing torrent',
            progress: 0,
            downloadSpeed: 0,
            uploadSpeed: 0,
            numPeers: 0,
            downloaded: 0,
            uploaded: 0,
            files: [],
            sessionAlive: true,
            warmingUp: true
        });
    }

    return res.json({
        ...formatTorrentInfo(session.torrent),
        sessionAlive: true,
        warmingUp: false
    });
});

app.post('/api/torrent/:infoHash/session', (req, res, next) => {
    const session = ensureTorrentSession(req.params.infoHash);

    if (!session) {
        return next();
    }

    clearCleanupTimer(session);
    const currentTime = Math.max(0, Number(req.body?.currentTime || 0));
    session.lastActivityAt = Date.now();
    session.lastPlaybackPosition = currentTime;
    session.highestPlaybackPosition = Math.max(session.highestPlaybackPosition, currentTime);

    return res.json({
        success: true,
        resumeFrom: currentTime >= LONG_WATCH_THRESHOLD_SECONDS
            ? Math.max(0, currentTime - REWIND_AFTER_LONG_WATCH_SECONDS)
            : currentTime,
        sessionAlive: true
    });
});

/**
 * Informações de um torrent específico
 */
app.get('/api/torrent/:infoHash', (req, res) => {
    const torrent = activeTorrents.get(req.params.infoHash)?.torrent;
    if (!torrent) {
        return res.status(404).json({ error: 'Torrent não encontrado' });
    }
    res.json(formatTorrentInfo(torrent));
});

/**
 * Metadados (Faixas de áudio/legenda)
 */
app.post('/api/torrent/:infoHash/session', (req, res) => {
    const session = activeTorrents.get(req.params.infoHash);

    if (!session) {
        return res.status(404).json({ error: 'SessÃ£o do torrent nÃ£o encontrada' });
    }

    const currentTime = Math.max(0, Number(req.body?.currentTime || 0));
    session.lastActivityAt = Date.now();
    session.lastPlaybackPosition = currentTime;
    session.highestPlaybackPosition = Math.max(session.highestPlaybackPosition, currentTime);

    res.json({
        success: true,
        resumeFrom: currentTime >= LONG_WATCH_THRESHOLD_SECONDS
            ? Math.max(0, currentTime - REWIND_AFTER_LONG_WATCH_SECONDS)
            : currentTime
    });
});

app.get('/api/metadata/:infoHash/:fileIndex', async (req, res) => {
    const { infoHash, fileIndex } = req.params;
    const session = activeTorrents.get(infoHash);
    const torrent = session?.torrent;
    if (!torrent) return res.status(404).json({ error: 'Torrent não encontrado' });

    const numericFileIndex = parseInt(fileIndex, 10);
    const file = torrent.files[numericFileIndex];
    if (!file) return res.status(404).json({ error: 'Arquivo não encontrado' });

    console.log(`🔍 Analisando faixas de áudio: ${file.name}`);

    try {
        // Aguardar arquivo ter pelo menos 5MB baixado
        const waitForData = new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                if (file.downloaded > 5 * 1024 * 1024) {
                    clearInterval(checkInterval);
                    resolve(true);
                }
            }, 500);
            
            // Timeout de 10s
            setTimeout(() => {
                clearInterval(checkInterval);
                resolve(false);
            }, 10000);
        });

        await waitForData;

        // Criar caminho temporário do arquivo
        const filePath = path.join(session.downloadPath, file.path);

        // Usar ffprobe no arquivo físico
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) {
                console.error('❌ Erro no ffprobe:', err.message);
                // Fallback: retornar faixas padrão
                return res.json({
                    name: file.name,
                    size: file.length,
                    mimeType: getMimeType(file.name),
                    audioTracks: [
                        { index: 0, streamIndex: 0, codec: 'aac', language: 'und', title: 'Audio 1', channels: 2 }
                    ],
                    subtitles: []
                });
            }

            // Mapear streams de áudio
            const audioTracks = metadata.streams
                .filter(s => s.codec_type === 'audio')
                .map((s, i) => ({
                    index: s.index,
                    streamIndex: i,
                    codec: s.codec_name,
                    language: s.tags?.language || 'und',
                    title: s.tags?.title || `Audio ${i + 1}`,
                    channels: s.channels
                }));

            // Mapear legendas
            const subtitles = metadata.streams
                .filter(s => s.codec_type === 'subtitle')
                .map((s, i) => ({
                    index: s.index,
                    language: s.tags?.language || 'und',
                    title: s.tags?.title || `Subtitle ${i + 1}`,
                    codec: s.codec_name
                }));

            console.log(`✅ Encontradas ${audioTracks.length} faixas de áudio`);
            
            res.json({ 
                name: file.name,
                size: file.length,
                mimeType: getMimeType(file.name),
                audioTracks, 
                subtitles 
            });
        });
    } catch (error) {
        console.error('❌ Erro ao processar metadata:', error);
        res.json({
            name: file.name,
            size: file.length,
            mimeType: getMimeType(file.name),
            audioTracks: [
                { index: 0, streamIndex: 0, codec: 'aac', language: 'und', title: 'Audio 1', channels: 2 }
            ],
            subtitles: []
        });
    }
});

/**
 * Stream de um arquivo específico com suporte a Range Requests
 */
app.get('/api/stream-compatible/:infoHash/:fileIndex', (req, res) => {
    const { infoHash, fileIndex } = req.params;
    const session = activeTorrents.get(infoHash);
    const torrent = session?.torrent;

    if (!torrent) return res.status(404).json({ error: 'Torrent não encontrado' });

    const numericFileIndex = parseInt(fileIndex, 10);
    const file = torrent.files[numericFileIndex];
    if (!file) return res.status(404).json({ error: 'Arquivo não encontrado' });

    const slot = tryAcquireStreamSlot(session);
    if (!slot.ok) {
        return res.status(slot.status).json({ error: slot.error });
    }
    selectOnlyFile(torrent, numericFileIndex);
    console.log(`🎬 Transcoding compatível: ${file.name}`);

    res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Transfer-Encoding': 'chunked'
    });

    const stream = file.createReadStream();
    const command = ffmpeg(stream)
        .inputFormat(path.extname(file.name).substring(1) === 'mkv' ? 'matroska' : 'mp4')
        .outputOptions([
            '-map 0:v:0',
            '-map 0:a:0?',
            '-c:v libx264',
            '-preset veryfast',
            '-pix_fmt yuv420p',
            '-profile:v high',
            '-level 4.1',
            '-c:a aac',
            '-ac 2',
            '-b:a 192k',
            '-movflags frag_keyframe+empty_moov+default_base_moof',
            '-f mp4'
        ])
        .on('error', (err) => {
            if (!err.message.includes('Output stream closed')) {
                console.error('❌ Erro no transcoding compatível:', err.message);
            }
            stream.destroy();
        })
        .on('end', () => {
            console.log('✅ Stream compatível finalizado');
        });

    command.pipe(res, { end: true });

    req.on('close', () => {
        console.log('🛑 Cliente desconectou do stream compatível');
        command.kill();
        stream.destroy();
        releaseStreamSlot(session, infoHash);
    });
});

app.get('/api/stream/:infoHash/:fileIndex', (req, res) => {
    const { infoHash, fileIndex } = req.params;
    const { audioIndex } = req.query; // Index sequencial (0, 1, 2...) da faixa de áudio
    const session = activeTorrents.get(infoHash);
    const torrent = session?.torrent;

    if (!torrent) return res.status(404).json({ error: 'Torrent não encontrado' });

    const numericFileIndex = parseInt(fileIndex, 10);
    const file = torrent.files[numericFileIndex];
    if (!file) return res.status(404).json({ error: 'Arquivo não encontrado' });

    const slot = tryAcquireStreamSlot(session);
    if (!slot.ok) {
        return res.status(slot.status).json({ error: slot.error });
    }
    selectOnlyFile(torrent, numericFileIndex);

    // Se audioIndex estiver definido, faz transcoding/remuxing com FFmpeg
    if (audioIndex !== undefined) {
        console.log(`🎬 Transcoding para áudio stream #${audioIndex}: ${file.name}`);

        // Transcoding não suporta Range Requests facilmente, então stream contínuo
        res.writeHead(200, {
            'Content-Type': 'video/mp4', // WebM or MP4 fragmented
            'Transfer-Encoding': 'chunked'
        });

        const stream = file.createReadStream();

        // Mapeamento: Vídeo original (0:v:0) + Áudio escolhido (0:a:INDEX)
        const command = ffmpeg(stream)
            .inputFormat(path.extname(file.name).substring(1) === 'mkv' ? 'matroska' : 'mp4') // Hint format
            .outputOptions([
                '-map 0:v:0',           // 1º vídeo
                `-map 0:a:${audioIndex}`, // Áudio selecionado
                '-c:v copy',            // Copiar vídeo (rápido, sem re-encode)
                '-c:a aac',             // Áudio para AAC (compatibilidade máxima)
                '-movflags frag_keyframe+empty_moov+default_base_moof', // Fragmentado para streaming
                '-f mp4'                // Formato de saída
            ])
            .on('error', (err) => {
                // Erros de "pipe closed" são comuns quando o cliente desconecta
                if (!err.message.includes('Output stream closed')) {
                    console.error('❌ Erro no transcoding:', err.message);
                }
                stream.destroy();
            })
            .on('end', () => {
                console.log('✅ Stream transcodificado finalizado');
            });

        command.pipe(res, { end: true });

        req.on('close', () => {
            console.log('🛑 Cliente desconectou do stream transcodificado');
            command.kill();
            stream.destroy();
            releaseStreamSlot(session, infoHash);
        });

        return;
    }

    // Comportamento original (Stream direto sem transcoding)
    console.log(`📺 Streaming direto: ${file.name}`);

    const range = req.headers.range;
    const fileSize = file.length;

    if (range) {
        const normalizedRange = normalizeRange(range, fileSize);
        if (!normalizedRange) {
            res.writeHead(416, {
                'Content-Range': `bytes */${fileSize}`,
                'Accept-Ranges': 'bytes',
            });
            return res.end();
        }

        const { start, end, chunkSize } = normalizedRange;

        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': getMimeType(file.name),
        });

        const stream = file.createReadStream({ start, end });
        stream.pipe(res);
        stream.on('error', () => res.end());
        req.on('close', () => {
            stream.destroy();
            releaseStreamSlot(session, infoHash);
        });
    } else {
        res.writeHead(200, {
            'Content-Length': fileSize,
            'Accept-Ranges': 'bytes',
            'Content-Type': getMimeType(file.name),
        });
        const stream = file.createReadStream();
        stream.pipe(res);
        stream.on('error', () => res.end());
        req.on('close', () => {
            stream.destroy();
            releaseStreamSlot(session, infoHash);
        });
    }
});

/**
 * Remove um torrent
 */
app.delete('/api/torrent/:infoHash', (req, res) => {
    const session = activeTorrents.get(req.params.infoHash);
    if (!session?.torrent) {
        return res.status(404).json({ error: 'Torrent não encontrado' });
    }

    void finalizeTorrentSession(req.params.infoHash, { removePartialData: true });
    console.log('🗑️ Torrent removido:', req.params.infoHash);

    res.json({ success: true });
});

// Helpers
function formatTorrentInfo(torrent) {
    if (!torrent) {
        return { error: 'Torrent not available' };
    }

    return {
        infoHash: torrent.infoHash || '',
        name: torrent.name || 'Unknown',
        progress: Math.round((torrent.progress || 0) * 100),
        downloadSpeed: torrent.downloadSpeed || 0,
        uploadSpeed: torrent.uploadSpeed || 0,
        numPeers: torrent.numPeers || 0,
        downloaded: torrent.downloaded || 0,
        uploaded: torrent.uploaded || 0,
        files: (torrent.files || []).map((f, i) => ({
            index: i,
            name: f.name || 'Unknown',
            path: f.path || '',
            length: f.length || 0,
            size: f.length || 0,
            progress: Math.round((f.progress || 0) * 100),
            streamUrl: `/api/stream/${torrent.infoHash}/${i}`
        }))
    };
}

function getMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mkv': 'video/x-matroska',
        '.avi': 'video/x-msvideo',
        '.mov': 'video/quicktime',
        '.mp3': 'audio/mpeg',
        '.flac': 'audio/flac',
        '.srt': 'text/plain',
        '.vtt': 'text/vtt'
    };
    return mimeTypes[ext] || 'application/octet-stream';
}

// Cleanup
process.on('SIGINT', () => {
    console.log('\n🛑 Encerrando gateway...');
    client.destroy(() => {
        console.log('✅ WebTorrent client destruído');
        process.exit(0);
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀 TORRENT GATEWAY - Streaming Server                   ║
║                                                           ║
║   Porta: ${PORT}                                            ║
║   Endpoint: http://localhost:${PORT}                        ║
║                                                           ║
║   Rotas:                                                  ║
║   POST   /api/torrent/add     - Adicionar torrent         ║
║   GET    /api/torrent/list    - Listar torrents           ║
║   GET    /api/torrent/:hash   - Info do torrent           ║
║   GET    /api/stream/:hash/:i - Stream de arquivo         ║
║   DELETE /api/torrent/:hash   - Remover torrent           ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
});
