/**
 * TORRENT GATEWAY - Streaming Server
 * 
 * Este serviço baixa torrents via TCP/UDP (muito mais rápido que WebRTC)
 * e serve os arquivos via HTTP streaming para o frontend.
 * 
 * Arquitetura:
 * Frontend → HTTP Request → Gateway → TCP/UDP Swarm → Arquivo
 */

const WebTorrent = require('webtorrent');
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3333;

// Cliente WebTorrent do servidor (usa TCP/UDP - muito mais rápido!)
const client = new WebTorrent();

// Cache de torrents ativos
const activeTorrents = new Map();

app.use(cors());
app.use(express.json());

// Middleware de tratamento de erros global
app.use((err, req, res, next) => {
    console.error('❌ Erro não tratado:', err);
    if (!res.headersSent) {
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Tratamento de erros não capturados
process.on('uncaughtException', (err) => {
    console.error('❌ Exceção não capturada:', err);
    // Não encerrar o processo, apenas logar
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promise rejeitada não tratada:', reason);
    // Não encerrar o processo, apenas logar
});

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
 * POST /api/torrent/add
 * Body: { magnetURI: string }
 */
app.post('/api/torrent/add', async (req, res) => {
    const { magnetURI } = req.body;

    if (!magnetURI) {
        return res.status(400).json({ error: 'magnetURI é obrigatório' });
    }

    console.log('📥 Adicionando torrent:', magnetURI.substring(0, 60) + '...');

    // Verificar se já existe
    const existing = client.get(magnetURI);
    if (existing) {
        console.log('♻️ Torrent já existe no cache');
        return res.json(formatTorrentInfo(existing));
    }

    try {
        const torrent = await new Promise((resolve, reject) => {
            const t = client.add(magnetURI, {
                path: path.join(__dirname, 'downloads')
            });

            t.on('metadata', () => {
                console.log('💎 Metadata recebida:', t.name);
                resolve(t);
            });

            t.on('error', (err) => {
                console.error('❌ Erro no torrent:', err);
                reject(err);
            });

            // Timeout de 30 segundos para metadata
            setTimeout(() => {
                if (!t.metadata) {
                    reject(new Error('Timeout aguardando metadata'));
                }
            }, 30000);
        });

        activeTorrents.set(torrent.infoHash, torrent);

        // Monitoramento
        torrent.on('download', () => {
            // Log periódico
        });

        torrent.on('done', () => {
            console.log('🏁 Download completo:', torrent.name);
        });

        res.json(formatTorrentInfo(torrent));
    } catch (error) {
        console.error('❌ Falha ao adicionar torrent:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Lista todos os torrents ativos
 * GET /api/torrent/list
 */
app.get('/api/torrent/list', (req, res) => {
    const torrents = Array.from(activeTorrents.values()).map(formatTorrentInfo);
    res.json(torrents);
});

/**
 * Informações de um torrent específico
 * GET /api/torrent/:infoHash
 */
app.get('/api/torrent/:infoHash', (req, res) => {
    const torrent = activeTorrents.get(req.params.infoHash);
    if (!torrent) {
        return res.status(404).json({ error: 'Torrent não encontrado' });
    }
    res.json(formatTorrentInfo(torrent));
});

/**
 * Metadados de um arquivo específico (Audio Tracks, Subtitles, etc)
 * GET /api/metadata/:infoHash/:fileIndex
 */
app.get('/api/metadata/:infoHash/:fileIndex', async (req, res) => {
    const { infoHash, fileIndex } = req.params;
    const torrent = activeTorrents.get(infoHash);

    if (!torrent) {
        return res.status(404).json({ error: 'Torrent não encontrado' });
    }

    const file = torrent.files[parseInt(fileIndex)];
    if (!file) {
        return res.status(404).json({ error: 'Arquivo não encontrado' });
    }

    // Retornar metadados básicos
    // Em uma implementação completa, você usaria ffprobe aqui
    res.json({
        name: file.name,
        size: file.length,
        mimeType: getMimeType(file.name),
        audioTracks: [], // Placeholder - requer ffprobe
        subtitles: []    // Placeholder - requer ffprobe
    });
});

/**
 * Stream de um arquivo específico
 * GET /api/stream/:infoHash/:fileIndex
 */
app.get('/api/stream/:infoHash/:fileIndex', (req, res) => {
    const { infoHash, fileIndex } = req.params;
    const torrent = activeTorrents.get(infoHash);

    if (!torrent) {
        console.error(`❌ Torrent não encontrado: ${infoHash}`);
        return res.status(404).json({ error: 'Torrent não encontrado' });
    }

    const file = torrent.files[parseInt(fileIndex)];
    if (!file) {
        console.error(`❌ Arquivo não encontrado: index ${fileIndex}`);
        return res.status(404).json({ error: 'Arquivo não encontrado' });
    }

    console.log(`📺 Streaming: ${file.name}`);

    // Priorizar este arquivo
    file.select();

    const range = req.headers.range;
    const fileSize = file.length;

    if (range) {
        // Range request (streaming com seek)
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
        
        // Tratamento de erros no stream
        stream.on('error', (err) => {
            console.error('❌ Erro no stream:', err);
            if (!res.headersSent) {
                res.status(500).end();
            }
        });
        
        stream.pipe(res);
    } else {
        // Request completo
        res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': getMimeType(file.name),
        });

        const stream = file.createReadStream();
        
        // Tratamento de erros no stream
        stream.on('error', (err) => {
            console.error('❌ Erro no stream:', err);
            if (!res.headersSent) {
                res.status(500).end();
            }
        });
        
        stream.pipe(res);
    }
});

/**
 * Remove um torrent
 * DELETE /api/torrent/:infoHash
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
    return {
        infoHash: torrent.infoHash,
        name: torrent.name,
        progress: Math.round(torrent.progress * 100),
        downloadSpeed: torrent.downloadSpeed,
        uploadSpeed: torrent.uploadSpeed,
        numPeers: torrent.numPeers,
        downloaded: torrent.downloaded,
        uploaded: torrent.uploaded,
        files: torrent.files.map((f, i) => ({
            index: i,
            name: f.name,
            path: f.path,
            size: f.length,
            progress: Math.round(f.progress * 100),
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

// Cleanup ao fechar
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
