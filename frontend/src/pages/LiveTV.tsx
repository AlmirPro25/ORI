import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, Radio, Upload, Tv, X, Loader2,
    Signal, Play, RefreshCw, WifiOff,
    Volume2, VolumeX, RotateCw, History, Clock,
    Star, Sparkles, TrendingUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Hls from 'hls.js';
import { cn } from '@/lib/utils';

const API_URL = 'http://localhost:3000/api/iptv';

interface Channel {
    id: string;
    name: string;
    logo: string | null;
    groupTitle: string;
    streamUrl: string;
    isDefault?: boolean; // Marca canais padrão do sistema
}

interface PlaylistHistory {
    id: string;
    name: string;
    url: string;
    channelCount: number;
    archivedAt: string;
}

interface RecommendedList {
    id: string;
    name: string;
    description: string;
    url: string;
    category: string;
    estimatedChannels: number;
    quality: string;
    reliability: string;
    tags: string[];
    icon: string;
}

interface RecommendedCategory {
    id: string;
    name: string;
    icon: string;
    description: string;
}

export function LiveTV() {
    const [channels, setChannels] = useState<Channel[]>([]);
    const [groups, setGroups] = useState<string[]>([]);
    const [selectedGroup, setSelectedGroup] = useState('All');
    const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [showUpload, setShowUpload] = useState(false);
    const [playlistUrl, setPlaylistUrl] = useState('');
    const [uploading, setUploading] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isBuffering, setIsBuffering] = useState(false);
    const [stats, setStats] = useState({ totalChannels: 0, totalGroups: 0 });
    const [showHistory, setShowHistory] = useState(false);
    const [history, setHistory] = useState<PlaylistHistory[]>([]);
    const [restoring, setRestoring] = useState<string | null>(null);
    const [showRecommended, setShowRecommended] = useState(false);
    const [recommendedLists, setRecommendedLists] = useState<RecommendedList[]>([]);
    const [recommendedCategories, setRecommendedCategories] = useState<RecommendedCategory[]>([]);
    const [selectedRecommendedCategory, setSelectedRecommendedCategory] = useState<string>('all');

    const videoRef = useRef<HTMLVideoElement>(null);
    const hlsRef = useRef<Hls | null>(null);

    // Fetch groups
    useEffect(() => {
        fetchGroups();
        fetchStats();
        fetchHistory();
        fetchRecommended();
    }, []);

    // Fetch channels when group or search changes
    useEffect(() => {
        fetchChannels();
    }, [selectedGroup, searchQuery]);

    const fetchGroups = async () => {
        try {
            const res = await fetch(`${API_URL}/groups`);
            const data = await res.json();
            setGroups(['All', ...data]);
        } catch (e) {
            console.error('Failed to fetch groups', e);
        }
    };

    const fetchChannels = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (selectedGroup !== 'All' && selectedGroup !== '⭐ PADRÃO') {
                params.set('group', selectedGroup);
            }
            if (searchQuery) params.set('search', searchQuery);
            params.set('limit', '200');

            const res = await fetch(`${API_URL}/channels?${params}`);
            let data = await res.json();

            // Filtrar apenas canais padrão se selecionado
            if (selectedGroup === '⭐ PADRÃO') {
                data = data.filter((ch: Channel) => ch.isDefault);
            }

            setChannels(data);
        } catch (e) {
            console.error('Failed to fetch channels', e);
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            const res = await fetch(`${API_URL}/stats`);
            const data = await res.json();
            setStats(data);
        } catch (e) {
            console.error('Failed to fetch stats', e);
        }
    };

    const fetchHistory = async () => {
        try {
            const res = await fetch(`${API_URL}/history`);
            const data = await res.json();
            setHistory(data);
        } catch (e) {
            console.error('Failed to fetch history', e);
        }
    };

    const fetchRecommended = async () => {
        try {
            const res = await fetch(`${API_URL}/recommended`);
            const data = await res.json();
            setRecommendedLists(data.recommendedLists || []);
            setRecommendedCategories(data.categories || []);
        } catch (e) {
            console.error('Failed to fetch recommended lists', e);
        }
    };

    const handleUploadPlaylist = async () => {
        if (!playlistUrl) return;
        setUploading(true);

        try {
            const res = await fetch(`${API_URL}/playlist/upload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playlistUrl })
            });

            const data = await res.json();

            if (data.status === 'SUCCESS') {
                setShowUpload(false);
                setPlaylistUrl('');
                fetchGroups();
                fetchChannels();
                fetchStats();
                fetchHistory();

                if (data.archivedCount > 0) {
                    alert(`✅ Playlist importada com sucesso!\n📦 ${data.archivedCount} playlist(s) anterior(es) arquivada(s) no histórico.`);
                }
            } else {
                alert('Erro: ' + (data.error || 'Falha desconhecida'));
            }
        } catch (e) {
            alert('Erro de conexão com o servidor');
        } finally {
            setUploading(false);
        }
    };

    const handleRestorePlaylist = async (id: string) => {
        setRestoring(id);
        try {
            const res = await fetch(`${API_URL}/history/restore/${id}`, {
                method: 'POST'
            });

            const data = await res.json();

            if (data.status === 'SUCCESS') {
                setShowHistory(false);
                fetchGroups();
                fetchChannels();
                fetchStats();
                fetchHistory();
                alert(`✅ Playlist restaurada com sucesso!\n📺 ${data.count} canais carregados.`);
            } else {
                alert('Erro: ' + (data.error || 'Falha desconhecida'));
            }
        } catch (e) {
            alert('Erro de conexão com o servidor');
        } finally {
            setRestoring(null);
        }
    };

    const handleImportRecommended = async (list: RecommendedList) => {
        setUploading(true);
        try {
            const res = await fetch(`${API_URL}/playlist/upload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    playlistUrl: list.url,
                    name: list.name
                })
            });

            const data = await res.json();

            if (data.status === 'SUCCESS') {
                setShowRecommended(false);
                fetchGroups();
                fetchChannels();
                fetchStats();
                fetchHistory();
                alert(`✅ ${list.name} importada com sucesso!\n📺 ${data.count} canais carregados.`);
            } else {
                alert('Erro: ' + (data.error || 'Falha desconhecida'));
            }
        } catch (e) {
            alert('Erro de conexão com o servidor');
        } finally {
            setUploading(false);
        }
    };

    const reloadStream = () => {
        if (selectedChannel) playChannel(selectedChannel);
    };

    const playChannel = (channel: Channel) => {
        setSelectedChannel(channel);
        setIsBuffering(true);

        const video = videoRef.current;
        if (!video) return;

        // Use proxy URL to bypass CORS
        const proxyUrl = `${API_URL}/stream/proxy?url=${encodeURIComponent(channel.streamUrl)}`;

        if (Hls.isSupported()) {
            if (hlsRef.current) hlsRef.current.destroy();

            const hls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
                backBufferLength: 60,
                manifestLoadingMaxRetry: 10,
                levelLoadingMaxRetry: 10
            });

            hls.loadSource(proxyUrl);
            hls.attachMedia(video);
            hlsRef.current = hls;

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                video.play().catch(console.error);
                setIsBuffering(false);
            });

            hls.on(Hls.Events.BUFFER_APPENDING, () => setIsBuffering(true));
            hls.on(Hls.Events.BUFFER_APPENDED, () => setIsBuffering(false));

            hls.on(Hls.Events.ERROR, (_event: string, data: any) => {
                if (data.fatal) {
                    console.warn('⚠️ [TV] Sinal Interrompido:', data.type, data.details);
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            console.error('Falha na rede ao carregar sinal.');
                            hls.startLoad();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            console.error('Erro de decodificação de mídia.');
                            hls.recoverMediaError();
                            break;
                        default:
                            hls.destroy();
                            break;
                    }
                    setIsBuffering(false);
                }
            });
        }
    };

    const toggleMute = () => {
        if (videoRef.current) {
            videoRef.current.muted = !videoRef.current.muted;
            setIsMuted(!isMuted);
        }
    };

    return (
        <div className="min-h-screen bg-background pt-20 flex">

            {/* SIDEBAR */}
            <aside className="hidden md:flex w-72 bg-black/40 backdrop-blur-xl border-r border-white/5 flex-col h-[calc(100vh-5rem)] fixed left-0 top-20 z-30">

                {/* Header */}
                <div className="p-4 border-b border-white/5 bg-gradient-to-r from-cyan-500/10 to-purple-500/10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-cyan-500/20 rounded-xl border border-cyan-500/30">
                            <Tv className="text-cyan-400" size={20} />
                        </div>
                        <div>
                            <h2 className="font-display text-lg font-bold text-white tracking-wider">
                                TV <span className="text-cyan-400">AO VIVO</span>
                            </h2>
                            <p className="text-[10px] text-gray-500 flex items-center gap-1">
                                <Signal size={10} className="text-green-500 animate-pulse" />
                                {stats.totalChannels} CANAIS • {stats.totalGroups} GRUPOS
                            </p>
                            <p className="text-[9px] text-yellow-400/70 flex items-center gap-1 mt-0.5">
                                <span>⭐</span>
                                {channels.filter(c => c.isDefault).length} CANAIS PADRÃO DO SISTEMA
                            </p>
                        </div>
                    </div>
                </div>

                {/* Search */}
                <div className="p-3">
                    <div className="relative group">
                        <Search className="absolute left-3 top-2.5 text-gray-500 group-focus-within:text-cyan-400 transition-colors" size={16} />
                        <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Buscar canal..."
                            className="pl-10 pr-10 bg-black/50 border-white/10 text-sm h-9 focus:border-cyan-500/50 transition-all"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-2.5 text-gray-500 hover:text-white"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Groups */}
                <nav className="flex-1 overflow-y-auto p-2 space-y-1">
                    {/* Filtro Especial: Canais Padrão */}
                    <button
                        onClick={() => setSelectedGroup('⭐ PADRÃO')}
                        className={cn(
                            "w-full text-left px-3 py-2 text-xs uppercase tracking-wider transition-all rounded-lg flex items-center gap-2 mb-2",
                            selectedGroup === '⭐ PADRÃO'
                                ? "bg-gradient-to-r from-yellow-500/20 to-orange-500/20 text-yellow-400 border-l-2 border-yellow-500"
                                : "text-yellow-400/60 hover:text-yellow-400 hover:bg-yellow-500/5 border border-yellow-500/20"
                        )}
                    >
                        <span className="text-sm">⭐</span>
                        <span className="truncate font-bold">CANAIS PADRÃO</span>
                    </button>

                    <div className="h-px bg-white/10 my-2"></div>

                    {groups.map(group => (
                        <button
                            key={group}
                            onClick={() => setSelectedGroup(group)}
                            className={cn(
                                "w-full text-left px-3 py-2 text-xs uppercase tracking-wider transition-all rounded-lg flex items-center gap-2",
                                selectedGroup === group
                                    ? "bg-cyan-500/20 text-cyan-400 border-l-2 border-cyan-500"
                                    : "text-gray-400 hover:text-white hover:bg-white/5"
                            )}
                        >
                            <Radio size={12} />
                            <span className="truncate">{group}</span>
                        </button>
                    ))}
                </nav>

                {/* Actions */}
                <div className="p-3 border-t border-white/5 space-y-2">
                    <Button
                        onClick={() => setShowRecommended(true)}
                        variant="outline"
                        className="w-full h-10 text-xs border-green-500/30 text-green-400 hover:bg-green-500/10"
                    >
                        <Star size={14} className="mr-2" />
                        LISTAS RECOMENDADAS
                    </Button>
                    <Button
                        onClick={() => setShowUpload(true)}
                        variant="outline"
                        className="w-full h-10 text-xs border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
                    >
                        <Upload size={14} className="mr-2" />
                        IMPORTAR M3U
                    </Button>
                    <Button
                        onClick={() => setShowHistory(true)}
                        variant="outline"
                        className="w-full h-10 text-xs border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                    >
                        <History size={14} className="mr-2" />
                        HISTÓRICO ({history.length})
                    </Button>
                    <Button
                        onClick={() => fetchChannels()}
                        variant="ghost"
                        className="w-full h-8 text-xs text-gray-500 hover:text-white"
                    >
                        <RefreshCw size={12} className="mr-2" />
                        Atualizar
                    </Button>
                </div>
            </aside>

            {/* MAIN CONTENT */}
            <main className="flex-1 ml-0 md:ml-72 flex flex-col">

                {/* VIDEO PLAYER */}
                <div className="h-[55vh] bg-black relative group">
                    <video
                        ref={videoRef}
                        className="w-full h-full object-contain"
                        controls
                        autoPlay
                        playsInline
                    />

                    {/* Buffering Indicator */}
                    {isBuffering && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[2px] z-20">
                            <Loader2 className="w-12 h-12 text-cyan-400 animate-spin" />
                        </div>
                    )}

                    {/* Player Overlay */}
                    {selectedChannel ? (
                        <div className="absolute top-4 left-4 z-10 pointer-events-none">
                            <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10">
                                <h3 className="text-white font-bold text-lg">{selectedChannel.name}</h3>
                                <div className="flex items-center gap-2 text-xs text-cyan-400">
                                    <Signal size={12} className="animate-pulse" />
                                    <span className="uppercase tracking-widest">AO VIVO</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 to-black text-center p-6">
                            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6 border border-white/10">
                                <WifiOff size={40} className="text-gray-500" />
                            </div>
                            <h2 className="text-2xl font-black text-white uppercase italic tracking-widest mb-2">
                                Sistema de TV <span className="text-cyan-400">Offline</span>
                            </h2>
                            <p className="text-gray-500 text-sm max-w-md">
                                Selecione um canal da lista lateral ou importe uma nova playlist M3U para iniciar a transmissão.
                            </p>
                            <Button
                                onClick={() => setShowUpload(true)}
                                className="mt-8 bg-cyan-500 hover:bg-cyan-400 text-black font-bold h-12 px-8 rounded-2xl"
                            >
                                <Upload size={18} className="mr-2" />
                                Importar Playlist
                            </Button>
                        </div>
                    )}

                    {/* Custom Controls */}
                    <div className="absolute bottom-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <button
                            onClick={reloadStream}
                            title="Recarregar Sinal"
                            className="p-3 bg-black/60 hover:bg-black/80 rounded-xl border border-white/10 text-white transition-all hover:text-cyan-400"
                        >
                            <RotateCw size={18} />
                        </button>
                        <button
                            onClick={toggleMute}
                            className="p-3 bg-black/60 hover:bg-black/80 rounded-xl border border-white/10 text-white transition-all"
                        >
                            {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                        </button>
                    </div>
                </div>

                {/* CHANNEL GRID */}
                <div className="flex-1 overflow-hidden flex flex-col bg-gradient-to-b from-black to-background">

                    {/* Category Header */}
                    <div className="px-6 py-3 border-b border-white/5 flex justify-between items-center bg-black/40">
                        <h3 className="font-display text-white text-sm uppercase tracking-wider flex items-center gap-2">
                            <Radio size={14} className="text-cyan-400" />
                            {selectedGroup === 'All' ? 'TODOS OS CANAIS' : selectedGroup}
                        </h3>
                        <span className="text-xs text-gray-500">
                            {channels.length} canais encontrados
                        </span>
                    </div>

                    {/* Grid */}
                    <div className="flex-1 overflow-y-auto p-4">
                        {loading ? (
                            <div className="flex items-center justify-center h-40">
                                <Loader2 className="animate-spin text-cyan-400" size={32} />
                            </div>
                        ) : channels.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-40 text-gray-500 bg-white/5 rounded-3xl border border-white/5 m-4">
                                <Tv size={48} className="mb-3 opacity-30" />
                                <p className="text-sm font-bold uppercase tracking-widest text-white/40">Nenhum canal encontrado</p>
                                <p className="text-xs mt-1 text-white/20">Tente outra busca ou mude de grupo</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-3">
                                {channels.map(channel => (
                                    <motion.div
                                        key={channel.id}
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        whileHover={{ scale: 1.05, borderColor: 'rgba(0, 243, 255, 0.5)' }}
                                        onClick={() => playChannel(channel)}
                                        className={cn(
                                            "cursor-pointer bg-black/40 border rounded-xl p-3 transition-all group/card overflow-hidden relative",
                                            selectedChannel?.id === channel.id
                                                ? "border-cyan-500 bg-cyan-500/10 ring-1 ring-cyan-500/30"
                                                : channel.isDefault
                                                    ? "border-yellow-500/30 bg-gradient-to-br from-yellow-500/5 to-orange-500/5 hover:border-yellow-500/50"
                                                    : "border-white/5 hover:border-white/20"
                                        )}
                                    >
                                        {/* Badge de Canal Padrão */}
                                        {channel.isDefault && (
                                            <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-gradient-to-r from-yellow-500 to-orange-500 text-black text-[7px] font-black rounded uppercase z-10 shadow-lg">
                                                ⭐ PADRÃO
                                            </div>
                                        )}

                                        {/* Logo */}
                                        <div className="aspect-video bg-black/60 rounded-lg flex items-center justify-center mb-2 overflow-hidden relative">
                                            {channel.logo ? (
                                                <img
                                                    src={channel.logo}
                                                    alt={channel.name}
                                                    className="max-h-full max-w-full object-contain p-2"
                                                    onError={(e) => {
                                                        (e.target as HTMLImageElement).style.display = 'none';
                                                    }}
                                                />
                                            ) : (
                                                <div className="flex flex-col items-center gap-1 opacity-20">
                                                    <Tv size={24} />
                                                    <span className="text-[8px] font-black tracking-tighter uppercase">No Signal</span>
                                                </div>
                                            )}

                                            {/* Play overlay */}
                                            <div className="absolute inset-0 bg-cyan-500/20 opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center justify-center">
                                                <Play className="text-cyan-400 fill-cyan-400" size={24} />
                                            </div>

                                            {/* Live indicator */}
                                            {selectedChannel?.id === channel.id && (
                                                <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-red-500 text-white text-[8px] font-bold rounded uppercase animate-pulse">
                                                    LIVE
                                                </div>
                                            )}
                                        </div>

                                        {/* Name */}
                                        <p className={cn(
                                            "text-[10px] font-medium text-center truncate group-hover/card:text-cyan-400 transition-colors",
                                            channel.isDefault ? "text-yellow-300" : "text-gray-300"
                                        )}>
                                            {channel.name}
                                        </p>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* RECOMMENDED LISTS MODAL */}
            <AnimatePresence>
                {showRecommended && (
                    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-[#0a0a0b] rounded-2xl p-6 w-full max-w-5xl border border-white/10 shadow-2xl max-h-[85vh] flex flex-col"
                        >
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h3 className="font-display text-2xl text-white font-bold flex items-center gap-3">
                                        <Sparkles className="text-green-400" size={28} />
                                        Listas <span className="text-green-400">Recomendadas</span>
                                    </h3>
                                    <p className="text-xs text-gray-500 uppercase tracking-widest mt-1">
                                        {recommendedLists.length} listas curadas • Importe com 1 clique
                                    </p>
                                </div>
                                <button onClick={() => setShowRecommended(false)} className="text-gray-500 hover:text-white">
                                    <X size={24} />
                                </button>
                            </div>

                            {/* Category Filter */}
                            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                                <button
                                    onClick={() => setSelectedRecommendedCategory('all')}
                                    className={cn(
                                        "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap",
                                        selectedRecommendedCategory === 'all'
                                            ? "bg-green-500 text-black"
                                            : "bg-white/5 text-gray-400 hover:bg-white/10"
                                    )}
                                >
                                    🌟 Todas
                                </button>
                                {recommendedCategories.map(cat => (
                                    <button
                                        key={cat.id}
                                        onClick={() => setSelectedRecommendedCategory(cat.id)}
                                        className={cn(
                                            "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap",
                                            selectedRecommendedCategory === cat.id
                                                ? "bg-green-500 text-black"
                                                : "bg-white/5 text-gray-400 hover:bg-white/10"
                                        )}
                                    >
                                        {cat.icon} {cat.name}
                                    </button>
                                ))}
                            </div>

                            {/* Lists Grid */}
                            <div className="flex-1 overflow-y-auto">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {recommendedLists
                                        .filter(list => selectedRecommendedCategory === 'all' || list.category.toLowerCase() === selectedRecommendedCategory)
                                        .map(list => (
                                            <motion.div
                                                key={list.id}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="bg-gradient-to-br from-black/60 to-black/40 border border-white/10 rounded-xl p-4 hover:border-green-500/30 transition-all group"
                                            >
                                                <div className="flex items-start gap-3 mb-3">
                                                    <div className="text-3xl">{list.icon}</div>
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="text-white font-bold text-sm truncate">{list.name}</h4>
                                                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">{list.category}</p>
                                                    </div>
                                                </div>

                                                <p className="text-xs text-gray-400 mb-3 line-clamp-2">{list.description}</p>

                                                <div className="flex flex-wrap gap-1 mb-3">
                                                    {list.tags.slice(0, 3).map(tag => (
                                                        <span key={tag} className="px-2 py-0.5 bg-white/5 text-[9px] text-gray-500 rounded uppercase tracking-wider">
                                                            {tag}
                                                        </span>
                                                    ))}
                                                </div>

                                                <div className="grid grid-cols-3 gap-2 mb-3 text-[10px]">
                                                    <div className="bg-black/40 rounded p-1.5 text-center">
                                                        <div className="text-cyan-400 font-bold">{list.estimatedChannels}+</div>
                                                        <div className="text-gray-600">Canais</div>
                                                    </div>
                                                    <div className="bg-black/40 rounded p-1.5 text-center">
                                                        <div className="text-purple-400 font-bold">{list.quality}</div>
                                                        <div className="text-gray-600">Qualidade</div>
                                                    </div>
                                                    <div className="bg-black/40 rounded p-1.5 text-center">
                                                        <div className={cn(
                                                            "font-bold",
                                                            list.reliability === 'Alta' ? "text-green-400" : "text-yellow-400"
                                                        )}>
                                                            {list.reliability}
                                                        </div>
                                                        <div className="text-gray-600">Confiança</div>
                                                    </div>
                                                </div>

                                                <Button
                                                    onClick={() => handleImportRecommended(list)}
                                                    disabled={uploading}
                                                    className="w-full bg-green-500 hover:bg-green-400 text-black font-bold h-9 text-xs"
                                                >
                                                    {uploading ? (
                                                        <>
                                                            <Loader2 className="animate-spin mr-2" size={14} />
                                                            Importando...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <TrendingUp size={14} className="mr-2" />
                                                            Importar Lista
                                                        </>
                                                    )}
                                                </Button>
                                            </motion.div>
                                        ))}
                                </div>
                            </div>

                            <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-xs text-green-300">
                                <strong>💡 Dica:</strong> Estas são listas públicas curadas pela comunidade. A disponibilidade dos canais pode variar. Experimente diferentes listas para encontrar a melhor para você!
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* HISTORY MODAL */}
            <AnimatePresence>
                {showHistory && (
                    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-[#0a0a0b] rounded-2xl p-6 w-full max-w-2xl border border-white/10 shadow-2xl max-h-[80vh] flex flex-col"
                        >
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h3 className="font-display text-xl text-white font-bold flex items-center gap-2">
                                        <History className="text-purple-400" size={24} />
                                        Histórico de <span className="text-purple-400">Playlists</span>
                                    </h3>
                                    <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">
                                        {history.length} playlist(s) arquivada(s)
                                    </p>
                                </div>
                                <button onClick={() => setShowHistory(false)} className="text-gray-500 hover:text-white">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto space-y-3">
                                {history.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-40 text-gray-500 bg-white/5 rounded-xl border border-white/5">
                                        <History size={48} className="mb-3 opacity-30" />
                                        <p className="text-sm font-bold uppercase tracking-widest text-white/40">Histórico Vazio</p>
                                        <p className="text-xs mt-1 text-white/20">Nenhuma playlist foi arquivada ainda</p>
                                    </div>
                                ) : (
                                    history.map(item => (
                                        <motion.div
                                            key={item.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="bg-black/40 border border-white/10 rounded-xl p-4 hover:border-purple-500/30 transition-all"
                                        >
                                            <div className="flex justify-between items-start gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="text-white font-bold text-sm truncate">{item.name}</h4>
                                                    <p className="text-xs text-gray-500 truncate mt-1">{item.url}</p>
                                                    <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
                                                        <span className="flex items-center gap-1">
                                                            <Tv size={10} />
                                                            {item.channelCount} canais
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            <Clock size={10} />
                                                            {new Date(item.archivedAt).toLocaleDateString('pt-BR', {
                                                                day: '2-digit',
                                                                month: '2-digit',
                                                                year: 'numeric',
                                                                hour: '2-digit',
                                                                minute: '2-digit'
                                                            })}
                                                        </span>
                                                    </div>
                                                </div>
                                                <Button
                                                    onClick={() => handleRestorePlaylist(item.id)}
                                                    disabled={restoring === item.id}
                                                    size="sm"
                                                    className="bg-purple-500 hover:bg-purple-400 text-white font-bold h-9 px-4 shrink-0"
                                                >
                                                    {restoring === item.id ? (
                                                        <>
                                                            <Loader2 className="animate-spin mr-2" size={14} />
                                                            Restaurando...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <RotateCw size={14} className="mr-2" />
                                                            Restaurar
                                                        </>
                                                    )}
                                                </Button>
                                            </div>
                                        </motion.div>
                                    ))
                                )}
                            </div>

                            <div className="mt-4 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg text-xs text-purple-300">
                                <strong>ℹ️ Info:</strong> Ao importar uma nova playlist, a atual será automaticamente arquivada aqui. Você pode restaurar qualquer playlist anterior a qualquer momento.
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* UPLOAD MODAL */}
            <AnimatePresence>
                {showUpload && (
                    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-[#0a0a0b] rounded-2xl p-6 w-full max-w-lg border border-white/10 shadow-2xl"
                        >
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h3 className="font-display text-xl text-white font-bold">
                                        Importar <span className="text-cyan-400">Playlist M3U</span>
                                    </h3>
                                    <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">
                                        Cole a URL de uma lista IPTV
                                    </p>
                                </div>
                                <button onClick={() => setShowUpload(false)} className="text-gray-500 hover:text-white">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <Input
                                    value={playlistUrl}
                                    onChange={(e) => setPlaylistUrl(e.target.value)}
                                    placeholder="https://exemplo.com/playlist.m3u"
                                    className="bg-black/50 border-white/10 h-12 text-sm"
                                />

                                <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-xs text-cyan-300">
                                    <strong>Dica:</strong> Use listas públicas como{' '}
                                    <code className="bg-black/30 px-1 rounded">
                                        https://iptv-org.github.io/iptv/index.m3u
                                    </code>
                                </div>

                                <div className="flex gap-3 pt-2">
                                    <Button
                                        onClick={() => setShowUpload(false)}
                                        variant="ghost"
                                        className="flex-1 h-12"
                                    >
                                        Cancelar
                                    </Button>
                                    <Button
                                        onClick={handleUploadPlaylist}
                                        disabled={!playlistUrl || uploading}
                                        className="flex-1 h-12 bg-cyan-500 hover:bg-cyan-400 text-black font-bold"
                                    >
                                        {uploading ? (
                                            <>
                                                <Loader2 className="animate-spin mr-2" size={16} />
                                                Importando...
                                            </>
                                        ) : (
                                            <>
                                                <Upload size={16} className="mr-2" />
                                                Importar
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
