/**
 * NEON-FLUX // IPTV MODULE
 * ========================
 * Backend routes for IPTV functionality:
 * - M3U Parser
 * - Channel Management  
 * - HLS Stream Proxy (CORS Bypass)
 * 
 * Uses JSON file storage for simplicity (no additional dependencies)
 */

import express from 'express';
import axios from 'axios';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// ==========================================
// JSON FILE STORAGE
// ==========================================

interface Channel {
    id: string;
    extId: string | null;
    name: string;
    logo: string | null;
    groupTitle: string;
    streamUrl: string;
    playlistId: string;
    isActive: boolean;
    views: number;
    createdAt: string;
}

interface Playlist {
    id: string;
    name: string;
    url: string;
    createdAt: string;
    updatedAt: string;
}

interface PlaylistHistory {
    id: string;
    name: string;
    url: string;
    channelCount: number;
    archivedAt: string;
}

interface IPTVData {
    playlists: Playlist[];
    channels: Channel[];
    history: PlaylistHistory[];
}

const dataPath = path.join(__dirname, '../data/iptv.json');
const dataDir = path.dirname(dataPath);

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

function loadData(): IPTVData {
    try {
        if (fs.existsSync(dataPath)) {
            const content = fs.readFileSync(dataPath, 'utf-8');
            return JSON.parse(content);
        }
    } catch (e) {
        console.error('Error loading IPTV data:', e);
    }
    return { playlists: [], channels: [], history: [] };
}

function saveData(data: IPTVData): void {
    try {
        fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
        console.error('Error saving IPTV data:', e);
    }
}

// Helper to generate UUID
function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// ==========================================
// M3U PARSER ENGINE
// ==========================================

interface ParsedChannel {
    extId: string | null;
    name: string;
    logo: string | null;
    groupTitle: string;
    streamUrl: string;
}

function parseM3U(content: string): ParsedChannel[] {
    const lines = content.split('\n');
    const channels: ParsedChannel[] = [];
    let currentChannel: Partial<ParsedChannel> | null = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line.startsWith('#EXTINF:')) {
            // Parse channel info
            const extIdMatch = line.match(/tvg-id="([^"]*)"/);
            const logoMatch = line.match(/tvg-logo="([^"]*)"/);
            const groupMatch = line.match(/group-title="([^"]*)"/);
            const nameMatch = line.match(/,(.+)$/);

            currentChannel = {
                extId: extIdMatch?.[1] || null,
                logo: logoMatch?.[1] || null,
                groupTitle: groupMatch?.[1] || 'Geral',
                name: nameMatch?.[1]?.trim() || 'Canal Desconhecido',
            };
        } else if (line && !line.startsWith('#') && currentChannel) {
            // This line is the stream URL
            currentChannel.streamUrl = line;
            channels.push(currentChannel as ParsedChannel);
            currentChannel = null;
        }
    }

    return channels;
}

// ==========================================
// ROUTES
// ==========================================

// GET /api/iptv/recommended - Lista playlists recomendadas
router.get('/recommended', (_req, res) => {
    try {
        const recommendedPath = path.join(__dirname, '../data/iptv-recommended-lists.json');
        if (fs.existsSync(recommendedPath)) {
            const content = fs.readFileSync(recommendedPath, 'utf-8');
            const data = JSON.parse(content);
            res.json(data);
        } else {
            res.json({ recommendedLists: [], categories: [] });
        }
    } catch (error) {
        console.error('Erro ao buscar listas recomendadas:', error);
        res.status(500).json({ error: 'Falha ao buscar listas recomendadas' });
    }
});

// GET /api/iptv/groups - Lista todos os grupos de canais
router.get('/groups', (_req, res) => {
    try {
        const data = loadData();
        const activeChannels = data.channels.filter(c => c.isActive);
        const groups = [...new Set(activeChannels.map(c => c.groupTitle))].sort();
        res.json(groups);
    } catch (error) {
        console.error('Erro ao buscar grupos:', error);
        res.status(500).json({ error: 'Falha ao buscar grupos' });
    }
});

// GET /api/iptv/channels - Lista canais (com filtros)
router.get('/channels', (req, res) => {
    try {
        const { group, search, limit = '100' } = req.query;
        const data = loadData();

        let channels = data.channels.filter(c => c.isActive);

        // Marcar canais padrão (playlist "default" ou primeiros 55 canais)
        const defaultPlaylistId = data.playlists.find(p => p.name === 'IPTV Brasil - Canais Fechados')?.id;
        channels = channels.map(c => ({
            ...c,
            isDefault: c.playlistId === defaultPlaylistId || data.channels.indexOf(c) < 55
        }));

        if (group && group !== 'All') {
            channels = channels.filter(c => c.groupTitle === group);
        }

        if (search) {
            const searchLower = (search as string).toLowerCase();
            channels = channels.filter(c => c.name.toLowerCase().includes(searchLower));
        }

        channels = channels.slice(0, parseInt(limit as string));
        channels.sort((a, b) => a.name.localeCompare(b.name));

        res.json(channels);
    } catch (error) {
        console.error('Erro ao buscar canais:', error);
        res.status(500).json({ error: 'Falha ao buscar canais' });
    }
});

// POST /api/iptv/playlist/upload - Importa playlist M3U (substitui a anterior e arquiva no histórico)
router.post('/playlist/upload', async (req, res) => {
    try {
        const { playlistUrl, name } = req.body;

        if (!playlistUrl) {
            return res.status(400).json({ error: 'URL da playlist é obrigatória' });
        }

        console.log(`📡 Baixando playlist: ${playlistUrl}`);

        // Baixar conteúdo da playlist
        const response = await axios.get(playlistUrl, {
            timeout: 60000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            responseType: 'text'
        }) as any;

        const m3uContent = String(response.data || '');
        const parsedChannels = parseM3U(m3uContent);

        if (parsedChannels.length === 0) {
            return res.status(400).json({ error: 'Nenhum canal encontrado na playlist' });
        }

        console.log(`📺 ${parsedChannels.length} canais encontrados`);

        const data = loadData();
        const now = new Date().toISOString();

        // ARQUIVAR PLAYLISTS ANTERIORES NO HISTÓRICO
        if (data.playlists.length > 0) {
            console.log(`📦 Arquivando ${data.playlists.length} playlist(s) anterior(es) no histórico...`);
            
            data.playlists.forEach(oldPlaylist => {
                const channelCount = data.channels.filter(c => c.playlistId === oldPlaylist.id).length;
                
                // Adicionar ao histórico
                data.history.push({
                    id: oldPlaylist.id,
                    name: oldPlaylist.name,
                    url: oldPlaylist.url,
                    channelCount,
                    archivedAt: now
                });
            });

            // Remover todos os canais antigos
            console.log(`🗑️ Removendo ${data.channels.length} canais antigos...`);
            data.channels = [];
            
            // Limpar playlists ativas
            data.playlists = [];
        }

        // CRIAR NOVA PLAYLIST
        const playlistId = generateUUID();
        const playlist: Playlist = {
            id: playlistId,
            name: name || 'Lista Importada',
            url: playlistUrl,
            createdAt: now,
            updatedAt: now
        };

        const newChannels: Channel[] = parsedChannels.map(ch => ({
            id: generateUUID(),
            extId: ch.extId,
            name: ch.name,
            logo: ch.logo,
            groupTitle: ch.groupTitle,
            streamUrl: ch.streamUrl,
            playlistId,
            isActive: true,
            views: 0,
            createdAt: now
        }));

        data.playlists.push(playlist);
        data.channels.push(...newChannels);
        saveData(data);

        console.log(`✅ Nova playlist importada: ${parsedChannels.length} canais`);
        console.log(`📚 Histórico agora tem ${data.history.length} playlist(s) arquivada(s)`);

        res.json({
            status: 'SUCCESS',
            count: parsedChannels.length,
            playlistId,
            archivedCount: data.history.length
        });
    } catch (error: unknown) {
        const err = error as Error;
        console.error('❌ Erro ao importar playlist:', err.message);
        res.status(500).json({ error: 'Falha ao importar playlist', details: err.message });
    }
});

// GET /api/iptv/stream/proxy - Proxy de streaming (CORS bypass + Manifest Rewriting)
router.get('/stream/proxy', async (req, res) => {
    try {
        const { url } = req.query;

        if (!url || typeof url !== 'string') {
            return res.status(400).json({ error: 'URL do stream é obrigatória' });
        }

        // Determinar tipo de conteúdo
        const isM3U8 = url.includes('.m3u8') || url.includes('.m3u');

        const headers: any = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': '*/*',
            'Connection': 'keep-alive'
        };

        if (isM3U8) {
            // Se for m3u8, precisamos ler o conteúdo e reescrever as URLs relativas
            const response = await axios.get(url, { headers, timeout: 15000 }) as any;
            let content = String(response.data || '');

            // Extrair a URL base (sem o nome do arquivo .m3u8)
            const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);

            // RegEx para encontrar linhas que não são comentários e reescrevê-las como URLs do proxy
            const lines = content.split('\n');
            const rewrittenLines = lines.map((line: string) => {
                line = line.trim();
                if (line && !line.startsWith('#')) {
                    let fullUrl = line;
                    if (!line.startsWith('http')) {
                        fullUrl = baseUrl + line;
                    }
                    // Retorna a URL apontando para este próprio proxy
                    return `${req.protocol}://${req.get('host')}${req.baseUrl}/stream/proxy?url=${encodeURIComponent(fullUrl)}`;
                }
                return line;
            });

            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.setHeader('Access-Control-Allow-Origin', '*');
            return res.send(rewrittenLines.join('\n'));
        } else {
            // Se for segmento (.ts, etc), apenas faz o pipe direto
            const response = await axios({
                method: 'GET',
                url: url,
                responseType: 'stream',
                timeout: 30000,
                headers
            }) as any;

            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp2t');
            response.data.pipe(res);
        }

    } catch (error: unknown) {
        const err = error as Error;
        console.error('❌ Erro no proxy:', err.message);
        // Silencioso para não poluir o log em caso de segmentos quebrados
        if (!res.headersSent) {
            res.status(500).json({ error: 'Falha no proxy de stream' });
        }
    }
});

// GET /api/iptv/stats - Estatísticas do sistema IPTV
router.get('/stats', (_req, res) => {
    try {
        const data = loadData();
        const activeChannels = data.channels.filter(c => c.isActive);
        const groups = [...new Set(activeChannels.map(c => c.groupTitle))];

        res.json({
            totalChannels: activeChannels.length,
            totalGroups: groups.length,
            totalPlaylists: data.playlists.length
        });
    } catch (error) {
        res.status(500).json({ error: 'Falha ao buscar estatísticas' });
    }
});

// GET /api/iptv/history - Lista histórico de playlists arquivadas
router.get('/history', (_req, res) => {
    try {
        const data = loadData();
        // Ordenar por data de arquivamento (mais recente primeiro)
        const sortedHistory = [...data.history].sort((a, b) => 
            new Date(b.archivedAt).getTime() - new Date(a.archivedAt).getTime()
        );
        res.json(sortedHistory);
    } catch (error) {
        console.error('Erro ao buscar histórico:', error);
        res.status(500).json({ error: 'Falha ao buscar histórico' });
    }
});

// POST /api/iptv/history/restore/:id - Restaura uma playlist do histórico
router.post('/history/restore/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const data = loadData();
        
        const historyItem = data.history.find(h => h.id === id);
        if (!historyItem) {
            return res.status(404).json({ error: 'Playlist não encontrada no histórico' });
        }

        console.log(`🔄 Restaurando playlist do histórico: ${historyItem.name}`);

        // Reimportar a playlist usando a URL original
        const response = await axios.get(historyItem.url, {
            timeout: 60000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            responseType: 'text'
        }) as any;

        const m3uContent = String(response.data || '');
        const parsedChannels = parseM3U(m3uContent);

        if (parsedChannels.length === 0) {
            return res.status(400).json({ error: 'Nenhum canal encontrado na playlist' });
        }

        const now = new Date().toISOString();

        // Arquivar playlist atual
        if (data.playlists.length > 0) {
            data.playlists.forEach(oldPlaylist => {
                const channelCount = data.channels.filter(c => c.playlistId === oldPlaylist.id).length;
                data.history.push({
                    id: oldPlaylist.id,
                    name: oldPlaylist.name,
                    url: oldPlaylist.url,
                    channelCount,
                    archivedAt: now
                });
            });
            data.channels = [];
            data.playlists = [];
        }

        // Restaurar playlist
        const playlist: Playlist = {
            id: historyItem.id,
            name: historyItem.name,
            url: historyItem.url,
            createdAt: now,
            updatedAt: now
        };

        const newChannels: Channel[] = parsedChannels.map(ch => ({
            id: generateUUID(),
            extId: ch.extId,
            name: ch.name,
            logo: ch.logo,
            groupTitle: ch.groupTitle,
            streamUrl: ch.streamUrl,
            playlistId: historyItem.id,
            isActive: true,
            views: 0,
            createdAt: now
        }));

        data.playlists.push(playlist);
        data.channels.push(...newChannels);
        
        // Remover do histórico
        data.history = data.history.filter(h => h.id !== id);
        
        saveData(data);

        console.log(`✅ Playlist restaurada: ${parsedChannels.length} canais`);

        res.json({
            status: 'SUCCESS',
            count: parsedChannels.length,
            playlistId: historyItem.id
        });
    } catch (error: unknown) {
        const err = error as Error;
        console.error('❌ Erro ao restaurar playlist:', err.message);
        res.status(500).json({ error: 'Falha ao restaurar playlist', details: err.message });
    }
});

// DELETE /api/iptv/channels/purge - Limpa todos os canais
router.delete('/channels/purge', (_req, res) => {
    try {
        saveData({ playlists: [], channels: [], history: [] });
        res.json({ message: 'Todos os canais foram removidos' });
    } catch (error) {
        res.status(500).json({ error: 'Falha ao limpar canais' });
    }
});

export default router;
