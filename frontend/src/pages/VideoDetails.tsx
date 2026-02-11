import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useVideo, useVideoFeed } from '@/hooks/useVideos';
import { PlayerComponent } from '@/components/PlayerComponent';
import { TorrentPlayer } from '@/components/TorrentPlayer';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Calendar, Clock, Share2, ThumbsUp, ThumbsDown, MessageSquare, Plus, Send, User as UserIcon, Loader2, CheckCircle, Trash2, Database } from 'lucide-react';
import { AddonStreamDialog } from '@/components/AddonStreamDialog';
import { STORAGE_BASE_URL } from '@/lib/axios';
import apiClient from '@/lib/axios';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/lib/utils';
import VideoService from '@/services/api/video.service';

import { SynergyMonitor } from '@/components/SynergyMonitor';

export const VideoDetailsPage: React.FC = () => {
    const [streamDialog, setStreamDialog] = useState(false);
    const { id } = useParams<{ id: string }>();
    const { video, loading: videoLoading, error } = useVideo(id);
    const { videos: allVideos } = useVideoFeed();
    const { user, isAuthenticated } = useAuthStore();

    const readyVideos = allVideos.filter(v => v.status === 'READY');
    const loading = videoLoading;

    // 🧠 V2.5: Boost de Demanda ao abrir a página
    useEffect(() => {
        if (id && video && video.status !== 'READY') {
            console.log(`🧠 [Demand] Boosting demand for ${video.title} (Status: ${video.status})`);
            VideoService.boostDemand(id, 'PLAY_ATTEMPT');
        }
    }, [id, video]);

    // Social States
    const [stats, setStats] = useState({ likesCount: 0, dislikesCount: 0, comments: [] as any[], likes: [] as any[] });
    const [commentText, setCommentText] = useState('');
    const [userInteraction, setUserInteraction] = useState<{ isLike: boolean | null }>({ isLike: null });
    const [isPosting, setIsPosting] = useState(false);

    // UI States
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

    // Telemetria P2P
    const [torrentStats, setTorrentStats] = useState({ progress: 0, downloadSpeed: 0, peers: 0, status: 'CONNECTING' });

    // My List & Share States
    const [isInMyList, setIsInMyList] = useState(false);
    const [justShared, setJustShared] = useState(false);

    // Memoized Handlers to prevent infinite loops
    const handleProgress = React.useCallback((s: any) => {
        setTorrentStats(s);
    }, []);

    const handleTorrentReady = React.useCallback(() => {
        console.log('Torrent Ready');
    }, []);

    useEffect(() => {
        if (id && user) {
            fetchStats();
            // Check My List via Backend
            checkFavoriteStatus();
        }
    }, [id, user]);

    const checkFavoriteStatus = async () => {
        if (!id || !user) return;
        try {
            const res = await apiClient.get(`/users/${user.id}/favorites/${id}/status`);
            setIsInMyList(res.data.favorited);
        } catch (e) {
            console.error('Failed to check favorite status');
        }
    };

    const toggleMyList = async () => {
        if (!id || !user) return alert('Faça login para salvar no cofre!');

        try {
            const res = await apiClient.post(`/users/${user.id}/favorites/${id}`);
            setIsInMyList(res.data.favorited);

            // 🧠 V2.5: Boost de demanda ao favoritar
            if (res.data.favorited) {
                VideoService.boostDemand(id, 'FAVORITE');
            }
        } catch (e) {
            console.error('Failed to toggle favorite');
        }
    };

    const handleShare = () => {
        navigator.clipboard.writeText(window.location.href);
        setJustShared(true);
        setTimeout(() => setJustShared(false), 2000);
    };

    const fetchStats = async () => {
        try {
            const res = await apiClient.get(`/videos/${id}/stats`);
            setStats({
                likesCount: res.data.likesCount || 0,
                dislikesCount: res.data.dislikesCount || 0,
                comments: res.data.comments || [],
                likes: res.data.likes || []
            });

            if (isAuthenticated && user) {
                const userLike = res.data.likes?.find((l: any) => l.userId === user.id);
                if (userLike) setUserInteraction({ isLike: userLike.isLike });
            }
        } catch (e) {
            console.error('Failed to fetch stats');
        }
    };

    const handleInteraction = async (isLike: boolean) => {
        if (!isAuthenticated) return alert('Faça login para avaliar!');
        try {
            await apiClient.post(`/videos/${id}/like`, { userId: user?.id, isLike });
            fetchStats();
        } catch (e) {
            console.error('Failed to interact');
        }
    };

    const handlePostComment = async () => {
        if (!commentText.trim() || !isAuthenticated) return;
        setIsPosting(true);
        try {
            await apiClient.post(`/videos/${id}/comments`, {
                content: commentText,
                userId: user?.id
            });
            setCommentText('');
            fetchStats();
        } catch (e) {
            console.error('Failed to post comment');
        } finally {
            setIsPosting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center space-y-6">
                <div className="relative">
                    <div className="absolute inset-0 bg-primary blur-2xl opacity-20 animate-pulse" />
                    <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin relative" />
                </div>
                <div className="text-center space-y-2">
                    <p className="text-white font-black uppercase tracking-[0.4em] text-xs">Sincronizando Nexus</p>
                    <p className="text-white/20 font-mono text-[10px] uppercase">Retrieving HLS Segment Stream...</p>
                </div>
            </div>
        );
    }

    if (error || !video) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 space-y-8">
                <div className="text-center space-y-2">
                    <h1 className="text-5xl font-black text-red-500 uppercase italic tracking-tighter">Sinal Perdido</h1>
                    <p className="text-white/40 uppercase tracking-widest text-xs">Uplink Interrupted or Resource Offline</p>
                </div>
                <Link to="/">
                    <Button className="h-14 px-10 rounded-2xl bg-white text-black font-black uppercase text-xs tracking-widest group">
                        <ChevronLeft className="mr-2 group-hover:-translate-x-1 transition-transform" /> Retornar ao Núcleo
                    </Button>
                </Link>
            </div>
        );
    }

    const hlsFullUrl = video.hlsPath ? `${STORAGE_BASE_URL}/${video.hlsPath}` : null;

    return (
        <div className="min-h-screen bg-background text-foreground pb-20 pt-32 relative overflow-hidden">
            {/* Ambient Background Glows */}
            <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[150px] -z-10" />

            {/* Header / Back Navigation */}
            <div className="fixed top-24 left-0 w-full z-[60] px-6 pointer-events-none">
                <Link to="/" className="pointer-events-auto">
                    <button className="flex items-center justify-center w-12 h-12 rounded-2xl bg-white/5 backdrop-blur-3xl border border-white/10 text-white hover:text-primary hover:border-primary/50 transition-all shadow-2xl">
                        <ChevronLeft size={24} />
                    </button>
                </Link>
            </div>

            {/* Cinematic Player Section */}
            <div className="relative w-full aspect-video md:h-[85vh] bg-black overflow-hidden group">
                <div className="absolute inset-0 flex items-center justify-center">
                    {(video.status === 'READY' || video.status === 'NEXUS') && video.storageKey ? (
                        // Vídeo local com streaming direto ou via Torrent Gateway
                        <video
                            controls
                            className="w-full h-full"
                            src={`http://localhost:3000/api/v1/videos/${video.id}/stream`}
                            onTimeUpdate={(e) => {
                                const currentTime = (e.target as HTMLVideoElement).currentTime;
                                handleProgress(currentTime);
                            }}
                        />
                    ) : video.status === 'CATALOG' ? (
                        // CLIQUE PARA INICIAR STREAMING (CATÁLOGO)
                        <div className="w-full h-full relative group">
                            <img
                                src={video.thumbnailPath ? `${STORAGE_BASE_URL}/${video.thumbnailPath}` : ''}
                                className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-40 transition-opacity duration-700"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />

                            <div className="relative z-20 flex flex-col items-center justify-center h-full space-y-8">
                                <motion.button
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={async () => {
                                        try {
                                            // Trigger Play/Materialization
                                            await apiClient.post(`/videos/${video.id}/play`);
                                            // Como o ID é mantido, apenas recarregamos para pegar o novo status (PROCESSING)
                                            window.location.reload();
                                        } catch (e) {
                                            alert('Erro ao iniciar streaming.');
                                        }
                                    }}
                                    className="w-24 h-24 rounded-full bg-primary text-black flex items-center justify-center shadow-[0_0_50px_rgba(var(--primary),0.6)] group-hover:shadow-[0_0_80px_rgba(var(--primary),0.8)] transition-all duration-500"
                                >
                                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 ml-1">
                                        <path d="M8 5v14l11-7z" />
                                    </svg>
                                </motion.button>
                                <div className="text-center">
                                    <h3 className="text-2xl font-black text-white uppercase italic tracking-tight">Iniciar Transmissão</h3>
                                    <p className="text-[10px] font-black text-primary uppercase tracking-[0.3em] mt-2">Clique para materializar do Nexus</p>
                                </div>
                            </div>
                        </div>
                    ) : video.status === 'READY' && hlsFullUrl ? (
                        <PlayerComponent hlsUrl={hlsFullUrl} />
                    ) : video.status === 'NEXUS' && video.hlsPath ? (
                        // ... antigo player P2P ...
                        <div className="w-full h-full relative">
                            <TorrentPlayer
                                magnetURI={video.hlsPath}
                                videoId={video.id}
                                onReady={handleTorrentReady}
                                onProgress={handleProgress}
                            />
                        </div>
                    ) : (
                        // Processing UI
                        <div className="w-full h-full flex flex-col items-center justify-center bg-black relative">
                            {/* ... Processing UI ... */}
                            <div className="relative z-10 text-center space-y-8 max-w-xl px-6">
                                <h2 className="text-4xl md:text-5xl font-black tracking-tighter uppercase italic leading-none">
                                    Nexus <span className="text-gradient-primary">Processing</span>
                                </h2>
                                <p className="text-white/40 text-sm leading-relaxed font-medium uppercase tracking-wide">
                                    Aguarde... o ativo está sendo preparado.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Vignette FX */}
                <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-background via-transparent to-transparent opacity-80" />
            </div>

            {/* Content Details */}
            <div className="container mx-auto px-6 md:px-12 mt-12 grid grid-cols-1 lg:grid-cols-12 gap-16">
                <div className="lg:col-span-8 space-y-12">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8 }}
                        className="space-y-6"
                    >
                        <div className="flex flex-wrap items-center gap-6">
                            <span className="text-primary font-black text-lg italic tracking-tight flex items-center gap-2">
                                <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                                98% Match
                            </span>
                            <span className="text-white/40 font-black text-xs uppercase tracking-[0.2em]">{new Date(video.createdAt).getFullYear()}</span>
                            <span className="bg-white/5 border border-white/10 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest text-white/60">UHD 4K HDR</span>
                            <span className="text-accent font-black uppercase tracking-[0.3em] text-[10px] bg-accent/5 border border-accent/20 px-3 py-1 rounded-full">{video.category || 'General'}</span>
                        </div>

                        <h1 className="text-3xl md:text-5xl font-black tracking-[-0.05em] uppercase italic leading-[0.9] text-white break-words">
                            {video.title}
                        </h1>

                        {/* Telemetria Premium */}
                        {video.status === 'NEXUS' && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="pt-4"
                            >
                                <SynergyMonitor
                                    progress={torrentStats.progress}
                                    downloadSpeed={torrentStats.downloadSpeed}
                                    peers={torrentStats.peers}
                                    status={torrentStats.status}
                                />
                            </motion.div>
                        )}

                        <div
                            className="relative cursor-pointer group/desc"
                            onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                        >
                            <p className={cn(
                                "text-lg md:text-xl text-white/50 leading-relaxed max-w-4xl font-medium transition-all duration-500",
                                !isDescriptionExpanded && "line-clamp-3"
                            )}>
                                {video.description || "Nenhuma especificação técnica disponível para este ativo. A transmissão segue os protocolos de criptografia e distribuição Nexus Forge."}
                            </p>
                            {!isDescriptionExpanded && video.description && video.description.length > 200 && (
                                <span className="text-primary text-xs font-black uppercase tracking-widest mt-2 block group-hover/desc:translate-x-1 transition-transform">
                                    [+] EXPANDIR DADOS TÁTICOS
                                </span>
                            )}
                        </div>

                        {/* Tags Section Evolution */}
                        {video.tags && (
                            <div className="flex flex-wrap gap-3 pt-4">
                                {video.tags.split(',').map((tag, i) => (
                                    <span key={i} className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/40 bg-primary/5 hover:bg-primary/10 hover:text-primary transition-colors border border-primary/10 px-3 py-1.5 rounded-xl cursor-default">
                                        #{tag.trim()}
                                    </span>
                                ))}
                            </div>
                        )}
                    </motion.div>

                    {/* Interaction Buttons Evolution */}
                    <div className="flex flex-wrap items-center gap-6 p-1 rounded-[2.5rem] bg-white/5 border border-white/10 backdrop-blur-xl">
                        <Button
                            onClick={() => setStreamDialog(true)}
                            className="flex-1 md:flex-none h-16 px-6 rounded-[2.2rem] bg-white/5 hover:bg-white/10 text-white font-black uppercase text-[10px] tracking-[0.2em] transition-all duration-500 shadow-glow flex items-center gap-2 border border-white/5 group"
                        >
                            <Database size={16} className="text-cyan-400 group-hover:scale-110 transition-transform" />
                            Addons
                        </Button>

                        <Button
                            onClick={toggleMyList}
                            className={cn(
                                "flex-1 md:flex-none h-16 px-10 rounded-[2.2rem] text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-500",
                                isInMyList
                                    ? "bg-green-500 text-black hover:bg-green-400 shadow-[0_0_30px_-5px_rgba(34,197,94,0.5)]"
                                    : "bg-white text-black hover:bg-white/90 shadow-glow"
                            )}
                        >
                            {isInMyList ? <CheckCircle size={20} className="mr-3" /> : <Plus size={20} className="mr-3" />}
                            {isInMyList ? "Node Reserved" : "Save to My List"}
                        </Button>

                        <div className="flex items-center gap-1 bg-black/40 rounded-[2.2rem] p-1.5 border border-white/5">
                            <button
                                onClick={() => handleInteraction(true)}
                                className={cn(
                                    "flex items-center gap-3 px-6 py-4 rounded-[2rem] transition-all",
                                    userInteraction.isLike === true
                                        ? "text-primary bg-primary/10 shadow-inner"
                                        : "text-white/40 hover:text-white hover:bg-white/5"
                                )}
                            >
                                <ThumbsUp size={22} fill={userInteraction.isLike === true ? "currentColor" : "none"} />
                                <span className="text-xs font-black">{stats.likesCount}</span>
                            </button>
                            <div className="w-px h-8 bg-white/5 mx-1" />
                            <button
                                onClick={() => handleInteraction(false)}
                                className={cn(
                                    "flex items-center gap-3 px-6 py-4 rounded-[2rem] transition-all",
                                    userInteraction.isLike === false
                                        ? "text-red-500 bg-red-500/10 shadow-inner"
                                        : "text-white/40 hover:text-white hover:bg-white/5"
                                )}
                            >
                                <ThumbsDown size={22} fill={userInteraction.isLike === false ? "currentColor" : "none"} />
                                <span className="text-xs font-black">{stats.dislikesCount}</span>
                            </button>
                        </div>

                        <button
                            onClick={handleShare}
                            className="flex items-center gap-3 px-8 h-16 text-white/40 hover:text-primary transition-all ml-auto group"
                        >
                            {justShared
                                ? <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary animate-pulse">Link Copied</span>
                                : <><Share2 size={20} className="group-hover:scale-110 transition-transform" /> <span className="text-[10px] font-black uppercase tracking-[0.3em] hidden sm:inline">Uplink Code</span></>}
                        </button>

                        {user?.role === 'ADMIN' && (
                            <button
                                onClick={async () => {
                                    if (!id) return;
                                    if (window.confirm('🚨 PERIGO: Apagar este ativo permanentemente? Isso removerá todos os arquivos do servidor.')) {
                                        try {
                                            await VideoService.delete(id);
                                            alert('Ativo purgado com sucesso.');
                                            window.location.href = '/';
                                        } catch (e) {
                                            alert('Falha crítica na purga.');
                                        }
                                    }
                                }}
                                className="h-16 w-16 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-[2.2rem] transition-all border border-red-500/20 flex items-center justify-center mr-4 shadow-lg hover:shadow-red-500/40 group"
                                title="PURGAR ATIVO"
                            >
                                <Trash2 size={20} className="group-hover:scale-110 transition-transform" />
                            </button>
                        )}
                    </div>

                    {/* Comments Section Evolution */}
                    <div className="space-y-10 pt-10">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-primary/10 rounded-2xl border border-primary/20">
                                    <MessageSquare className="text-primary" size={24} />
                                </div>
                                <div>
                                    <h2 className="text-3xl font-black tracking-tight uppercase italic text-white">Nexus Intelligence Feed</h2>
                                    <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.4em] mt-1 ml-0.5">Distributed Transmission Report</p>
                                </div>
                            </div>
                            <span className="text-primary font-black text-2xl font-mono opacity-40">{stats.comments.length}</span>
                        </div>

                        {/* Comment Input Evolution */}
                        {isAuthenticated ? (
                            <div className="flex gap-6 items-start bg-white/5 p-8 rounded-[2.5rem] border border-white/5 shadow-2xl relative group overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div className="w-14 h-14 rounded-2xl bg-primary text-black flex items-center justify-center font-black text-xl shadow-glow flex-shrink-0">
                                    {user?.name?.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 space-y-5">
                                    <textarea
                                        value={commentText}
                                        onChange={(e) => setCommentText(e.target.value)}
                                        placeholder="Submeter relatório técnico de transmissão..."
                                        className="w-full bg-black/40 border border-white/10 rounded-2xl p-6 text-sm font-medium focus:border-primary/50 focus:ring-4 focus:ring-primary/10 outline-none transition-all min-h-[140px] resize-none text-white placeholder:text-white/20"
                                    />
                                    <div className="flex justify-end">
                                        <Button
                                            onClick={handlePostComment}
                                            disabled={!commentText.trim() || isPosting}
                                            className="h-14 px-10 rounded-2xl bg-primary text-black font-black uppercase text-[10px] tracking-widest shadow-glow hover:scale-[1.05] transition-all flex items-center gap-3"
                                        >
                                            {isPosting ? <Loader2 className="animate-spin" size={18} /> : <><Send size={18} /> Submit Transmission</>}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white/5 border border-white/10 p-10 rounded-[2.5rem] text-center space-y-6">
                                <p className="text-white/40 uppercase tracking-[0.2em] text-[10px] font-black">Authentication Node Required for Communication</p>
                                <Link to="/login">
                                    <Button className="h-12 px-8 rounded-xl bg-white/10 border border-white/10 text-white hover:bg-white/20 font-black uppercase text-[10px] tracking-widest">Connect Identity</Button>
                                </Link>
                            </div>
                        )}

                        {/* Comment List Evolution */}
                        <div className="space-y-8">
                            <AnimatePresence>
                                {stats.comments.map((comment, index) => (
                                    <motion.div
                                        key={comment.id}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: index * 0.1 }}
                                        className="flex gap-6 group"
                                    >
                                        <div className="w-12 h-12 rounded-[1.2rem] bg-white/5 border border-white/10 flex items-center justify-center text-white/20 font-black text-lg flex-shrink-0 group-hover:border-primary/40 transition-colors">
                                            {comment.user?.name?.charAt(0).toUpperCase() || <UserIcon size={20} />}
                                        </div>
                                        <div className="flex-1 bg-white/5 p-6 rounded-[1.8rem] rounded-tl-none border border-white/5 group-hover:border-white/20 transition-all shadow-xl">
                                            <div className="flex justify-between items-center mb-3">
                                                <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">{comment.user?.name || 'Anon Operator'}</span>
                                                <span className="text-[10px] text-white/20 font-black uppercase italic">{new Date(comment.createdAt).toLocaleDateString()}</span>
                                            </div>
                                            <p className="text-sm text-white/70 leading-relaxed font-medium">{comment.content}</p>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                            {stats.comments.length === 0 && (
                                <div className="text-center py-20 opacity-10 text-[10px] font-black uppercase tracking-[0.5em]">No data records found in this sequence.</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Sidebar Evolution */}
                <aside className="lg:col-span-4 space-y-10">
                    <div className="glass-card p-10 rounded-[3rem] border border-white/5 space-y-8 sticky top-28">
                        <div className="space-y-6">
                            <h3 className="text-white/30 text-[10px] font-black uppercase tracking-[0.5em] border-b border-white/5 pb-4">Nexus Stats Panel</h3>

                            <div className="space-y-6">
                                <div className="flex items-center gap-5">
                                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-primary border border-white/5 shadow-inner">
                                        <Calendar size={18} />
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em] mb-1">Upload timestamp</p>
                                        <p className="text-sm font-black text-white italic">{new Date(video.createdAt).toLocaleDateString('pt-BR')}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-5">
                                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-primary border border-white/5 shadow-inner">
                                        <Clock size={18} />
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em] mb-1">Ingestion Pipeline</p>
                                        <p className="text-sm font-black text-white italic flex items-center gap-2">
                                            <span className={`w-2 h-2 rounded-full ${video.status === 'READY' ? 'bg-green-500 animate-pulse' : 'bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]'}`} />
                                            {video.status}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="pt-8 border-t border-white/5 space-y-6">
                            <h3 className="text-white/30 text-[10px] font-black uppercase tracking-[0.5em]">Neural Recommendations</h3>
                            <div className="grid grid-cols-1 gap-6">
                                {readyVideos.filter(v => v.id !== id).slice(0, 4).map(v => (
                                    <Link key={v.id} to={`/videos/${v.id}`} className="flex gap-4 group/item">
                                        <div className="w-24 aspect-video rounded-xl overflow-hidden flex-shrink-0 border border-white/10 relative">
                                            <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover/item:opacity-100 transition-opacity z-10 flex items-center justify-center">
                                                <div className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center shadow-glow">
                                                    <ChevronRight size={16} fill="black" />
                                                </div>
                                            </div>
                                            <img
                                                src={v.thumbnailPath ? `${STORAGE_BASE_URL}/${v.thumbnailPath}` : 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=200'}
                                                className="w-full h-full object-cover group-hover/item:scale-110 transition-transform duration-700"
                                            />
                                        </div>
                                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                                            <h4 className="text-xs font-black truncate text-white/70 group-hover/item:text-primary transition-colors uppercase italic tracking-tight">{v.title}</h4>
                                            <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em] mt-1">{v.category || 'General'}</p>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </div>
                </aside>
            </div>
            {/* Addon Stream Dialog */}
            <AddonStreamDialog
                isOpen={streamDialog}
                onClose={() => setStreamDialog(false)}
                type={(video?.category === 'series' || video?.tags?.includes('tv')) ? 'series' : 'movie'}
                id={video?.imdbId || video?.tmdbId || video?.title || ''}
                title={video?.title || ''}
            />
        </div>
    );
};
