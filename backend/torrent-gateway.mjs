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

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        torrents: activeTorrents.size,
        downloadSpeed: client.downloadSpeed,
        uploadSpeed: client.uploadSpeed,
        ratio: client.ratio
    });
});

/**
 * Adiciona um torrent e retorna informações dos arquivos
 */
app.post('/api/torrent/add', async (req, res) => {
    const { magnetURI } = req.body;

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
            console.log('⚡ Metadata já disponível:', torrent.name);
            return res.json(formatTorrentInfo(torrent));
        }

        // Se não existe, adicionar novo
        if (!torrent) {
            console.log('🆕 Adicionando novo torrent...');

            try {
                torrent = client.add(magnetURI, {
                    path: path.join(__dirname, 'downloads')
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
            activeTorrents.set(torrent.infoHash, torrent);
        }

        // Se já tem metadata, retorna direto
        if (torrent.metadata) {
            console.log('⚡ Metadata já disponível:', torrent.name);
            return res.json(formatTorrentInfo(torrent));
        }

        // Aguardar metadata
        console.log('⏳ Aguardando metadata...');
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error('Timeout aguardando metadata (45s)'));
            }, 45000);

            const onMetadata = () => {
                cleanup();
                console.log('💎 Metadata recebida:', torrent.name);
                if (torrent.infoHash) activeTorrents.set(torrent.infoHash, torrent);
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
        res.status(500).json({ error: error.message });
    }
});

/**
 * Lista todos os torrents ativos
 */
app.get('/api/torrent/list', (req, res) => {
    const torrents = Array.from(activeTorrents.values()).map(formatTorrentInfo);
    res.json(torrents);
});

/**
 * Informações de um torrent específico
 */
app.get('/api/torrent/:infoHash', (req, res) => {
    const torrent = activeTorrents.get(req.params.infoHash);
    if (!torrent) {
        return res.status(404).json({ error: 'Torrent não encontrado' });
    }
    res.json(formatTorrentInfo(torrent));
});

/**
 * Metadados (Faixas de áudio/legenda)
 */
app.get('/api/metadata/:infoHash/:fileIndex', async (req, res) => {
    const { infoHash, fileIndex } = req.params;
    const torrent = activeTorrents.get(infoHash);
    if (!torrent) return res.status(404).json({ error: 'Torrent não encontrado' });

    const file = torrent.files[parseInt(fileIndex)];
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
        const filePath = path.join(__dirname, 'downloads', file.path);

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
app.get('/api/stream/:infoHash/:fileIndex', (req, res) => {
    const { infoHash, fileIndex } = req.params;
    const { audioIndex } = req.query; // Index sequencial (0, 1, 2...) da faixa de áudio
    const torrent = activeTorrents.get(infoHash);

    if (!torrent) return res.status(404).json({ error: 'Torrent não encontrado' });

    const file = torrent.files[parseInt(fileIndex)];
    if (!file) return res.status(404).json({ error: 'Arquivo não encontrado' });

    file.select();

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
        });

        return;
    }

    // Comportamento original (Stream direto sem transcoding)
    console.log(`📺 Streaming direto: ${file.name}`);

    const range = req.headers.range;
    const fileSize = file.length;

    if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = end - start + 1;

        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': getMimeType(file.name),
        });

        const stream = file.createReadStream({ start, end });
        stream.pipe(res);
        stream.on('error', () => res.end());
    } else {
        res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': getMimeType(file.name),
        });
        const stream = file.createReadStream();
        stream.pipe(res);
        stream.on('error', () => res.end());
    }
});

/**
 * Remove um torrent
 */
app.delete('/api/torrent/:infoHash', (req, res) => {
    const torrent = activeTorrents.get(req.params.infoHash);
    if (!torrent) {
        return res.status(404).json({ error: 'Torrent não encontrado' });
    }

    torrent.destroy();
    activeTorrents.delete(req.params.infoHash);
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
