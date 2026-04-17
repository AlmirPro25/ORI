import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useVideo, useVideoFeed } from '@/hooks/useVideos';
import { useDiscoveryFeed } from '@/hooks/useDiscovery';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Calendar, Clock, Share2, ThumbsUp, ThumbsDown, MessageSquare, Plus, Send, User as UserIcon, Loader2, CheckCircle, Trash2, Database } from 'lucide-react';
import { FeatureErrorBoundary } from '@/components/FeatureErrorBoundary';
import { API_BASE_URL, STORAGE_BASE_URL } from '@/lib/axios';
import apiClient from '@/lib/axios';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/lib/utils';
import VideoService from '@/services/api/video.service';
import { addonService } from '@/services/addon.service';
import { usePlaybackPreferencesStore } from '@/stores/playbackPreferences.store';
import { ExperienceLoader } from '@/components/ExperienceLoader';
import { useFavorites } from '@/hooks/useFavorites';
import { getPtbrSignalSummary } from '@/lib/ptbr-coverage';

const PlayerComponent = React.lazy(() => import('@/components/PlayerComponent').then((module) => ({ default: module.PlayerComponent })));
const TorrentPlayer = React.lazy(() => import('@/components/TorrentPlayer').then((module) => ({ default: module.TorrentPlayer })));
const AddonStreamDialog = React.lazy(() => import('@/components/AddonStreamDialog').then((module) => ({ default: module.AddonStreamDialog })));
const SynergyMonitor = React.lazy(() => import('@/components/SynergyMonitor').then((module) => ({ default: module.SynergyMonitor })));


interface AddonRadarStream {
    title?: string;
    name?: string;
    description?: string;
    addonName?: string;
    url?: string;
    infoHash?: string;
    fileIdx?: number;
    sources?: string[];
    behaviorHints?: {
        filename?: string;
    };
    arconteSignal?: {
        trustLevel?: 'high' | 'medium' | 'low' | null;
        label?: string | null;
    } | null;
}

const normalizeRadarText = (value?: string) =>
    String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

const getRadarText = (stream: AddonRadarStream) =>
    normalizeRadarText([stream.title, stream.name, stream.description, stream.addonName].filter(Boolean).join(' '));

const getRadarPortugueseAudioScore = (stream: AddonRadarStream) => {
    const haystack = getRadarText(stream);
    let score = 0;

    if (/\bdublado\b|\bpt-br\b|\bptbr\b|\bportugues\b|\bportuguese\b|\baudio pt\b|\baudio br\b/.test(haystack)) {
        score += 100;
    }

    if (/\blat\b/.test(haystack)) {
        score += 10;
    }

    if (/\benglish\b|\beng\b|\bjapanese\b|\bjap\b/.test(haystack) && score === 0) {
        score -= 20;
    }

    return score;
};

const getRadarPortugueseSubtitleScore = (stream: AddonRadarStream) => {
    const haystack = getRadarText(stream);
    if (/\blegenda pt\b|\blegenda pt-br\b|\bsub pt\b|\bsub pt-br\b|\bsubtitle pt\b|\bsubtitle pt-br\b|\bsubs pt\b|\bsubs pt-br\b/.test(haystack)) {
        return 60;
    }

    if (/\bpt-br\b|\bptbr\b|\bportugues\b|\bportuguese\b/.test(haystack) && /\blegenda\b|\blegendado\b|\bsub\b|\bsubtitle\b|\bsubs\b/.test(haystack)) {
        return 40;
    }

    return 0;
};

export const VideoDetailsPage: React.FC = () => {
    const [streamDialog, setStreamDialog] = useState(false);
    const [streamDialogManualMode, setStreamDialogManualMode] = useState(false);
    const [showPtbrSignalDetails, setShowPtbrSignalDetails] = useState(false);
    const { id } = useParams<{ id: string }>();
    const { video, loading: videoLoading, error } = useVideo(id);
    const { videos: allVideos } = useVideoFeed();
    const { feed } = useDiscoveryFeed();
    const { user, isAuthenticated } = useAuthStore();
    const { preferPortugueseAudio, acceptPortugueseSubtitles } = usePlaybackPreferencesStore();
    const { isFavorited, toggleFavorite } = useFavorites();

    const readyVideos = allVideos.filter(v => v.status === 'READY');
    const loading = videoLoading;
    const [trustedSourceHint, setTrustedSourceHint] = useState<{
        label: string;
        tone: 'emerald' | 'sky' | 'amber';
        addonName: string;
    } | null>(null);
    const [isEvaluatingTrustedSource, setIsEvaluatingTrustedSource] = useState(false);
    const [trustedPlayableStream, setTrustedPlayableStream] = useState<AddonRadarStream | null>(null);
    const demandBoostedRef = React.useRef<string | null>(null);

    // ðŸ§  V2.5: Boost de Demanda ao abrir a pÃ¡gina
    useEffect(() => {
        if (!id || !video) return;

        if (video.status === 'READY') {
            demandBoostedRef.current = null;
            return;
        }

        const demandKey = `${id}:${video.status}`;
        if (demandBoostedRef.current === demandKey) return;

        demandBoostedRef.current = demandKey;
        console.log(`ðŸ§  [Demand] Boosting demand for ${video.title} (Status: ${video.status})`);
        VideoService.boostDemand(id, 'PLAY_ATTEMPT');
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
    const [justShared, setJustShared] = useState(false);
    const [isMaterializing, setIsMaterializing] = useState(false);
    const isInMyList = id ? isFavorited(id) : false;

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
        }
    }, [id, user]);

    useEffect(() => {
        let cancelled = false;

        const evaluateTrustedSource = async () => {
            if (!video || video.status !== 'CATALOG') {
                setTrustedSourceHint(null);
                setTrustedPlayableStream(null);
                return;
            }

            const lookupId = video.imdbId || video.tmdbId || video.title;
            if (!lookupId) {
                setTrustedSourceHint(null);
                setTrustedPlayableStream(null);
                return;
            }

            setIsEvaluatingTrustedSource(true);
            try {
                const result = await addonService.getStreams('movie', String(lookupId), video.title, {
                    preferPortugueseAudio,
                    acceptPortugueseSubtitles,
                    userId: user?.id,
                });

                if (cancelled) return;

                const streams = Array.isArray(result) ? result as AddonRadarStream[] : Array.isArray(result?.streams) ? result.streams as AddonRadarStream[] : [];
                const playableStreams = streams.filter((stream) => !!(stream.url || stream.infoHash));
                const bestPortugueseAudio = playableStreams.find((stream) => getRadarPortugueseAudioScore(stream) > 0);
                const bestPortugueseSubtitle = playableStreams.find((stream) => getRadarPortugueseSubtitleScore(stream) > 0);
                const best = bestPortugueseAudio || bestPortugueseSubtitle || playableStreams[0];

                if (!best) {
                    setTrustedSourceHint(null);
                    setTrustedPlayableStream(null);
                    return;
                }

                setTrustedPlayableStream(best);

                const trustLevel = best.arconteSignal?.trustLevel;
                const ptAudio = getRadarPortugueseAudioScore(best);
                const ptSubtitle = getRadarPortugueseSubtitleScore(best);
                const addonName = best.addonName || 'Addon Radar';

                if (trustLevel === 'high' && ptAudio > 0) {
                    setTrustedSourceHint({
                        label: best.arconteSignal?.label || 'Arconte encontrou uma fonte confiavel para assistir agora',
                        tone: 'emerald',
                        addonName,
                    });
                    return;
                }

                if (ptSubtitle > 0 || (trustLevel === 'medium' && ptAudio > 0)) {
                    setTrustedSourceHint({
                        label: best.arconteSignal?.label || (ptSubtitle > 0 ? 'Ha uma boa chance com legenda PT' : 'O Arconte encontrou uma fonte promissora'),
                        tone: ptSubtitle > 0 ? 'sky' : 'amber',
                        addonName,
                    });
                    return;
                }

                setTrustedSourceHint(null);
                setTrustedPlayableStream(null);
            } catch {
                if (!cancelled) {
                    setTrustedSourceHint(null);
                    setTrustedPlayableStream(null);
                }
            } finally {
                if (!cancelled) {
                    setIsEvaluatingTrustedSource(false);
                }
            }
        };

        evaluateTrustedSource();

        return () => {
            cancelled = true;
        };
    }, [video, preferPortugueseAudio, acceptPortugueseSubtitles, user?.id]);

    const toggleMyList = async () => {
        if (!id || !user) return alert('FaÃ§a login para salvar no cofre!');

        try {
            const favorited = await toggleFavorite(id);

            // ðŸ§  V2.5: Boost de demanda ao favoritar
            if (favorited) {
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

    const handleMaterialize = async (stream?: AddonRadarStream | null) => {
        if (!id) return;
        setIsMaterializing(true);
        try {
            const streamCandidate = stream || null;
            const magnetURI = stream?.url?.startsWith('magnet:')
                ? stream.url
                : (stream?.infoHash ? `magnet:?xt=urn:btih:${stream.infoHash}` : undefined);
            const payload = magnetURI ? {
                magnetURI,
                infoHash: streamCandidate?.infoHash,
                sourceSite: streamCandidate?.addonName,
                quality: /2160|4k/i.test(`${streamCandidate?.title || ''} ${streamCandidate?.name || ''}`)
                    ? '2160p'
                    : /1080/i.test(`${streamCandidate?.title || ''} ${streamCandidate?.name || ''}`)
                        ? '1080p'
                        : /720/i.test(`${streamCandidate?.title || ''} ${streamCandidate?.name || ''}`)
                            ? '720p'
                            : undefined,
                language: streamCandidate && getRadarPortugueseAudioScore(streamCandidate) > 0
                    ? 'pt-BR'
                    : streamCandidate && getRadarPortugueseSubtitleScore(streamCandidate) > 0
                        ? 'pt-BR-sub'
                        : undefined,
            } : undefined;
            await apiClient.post(`/videos/${id}/play`, payload);
            window.location.reload();
        } catch (e) {
            alert('Erro ao iniciar materializaÃ§Ã£o.');
        } finally {
            setIsMaterializing(false);
        }
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
        if (!isAuthenticated) return alert('FaÃ§a login para avaliar!');
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
            <div className="min-h-screen bg-background pt-24 md:pt-32 px-4 sm:px-6 pb-20">
                <ExperienceLoader label="Montando detalhes do titulo" variant="detail" className="px-0" />
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
                        <ChevronLeft className="mr-2 group-hover:-translate-x-1 transition-transform" /> Retornar ao NÃºcleo
                    </Button>
                </Link>
            </div>
        );
    }

    const hasMagnetStream = Boolean(video.hlsPath && video.hlsPath.startsWith('magnet:'));
    const hasHlsStream = Boolean(video.hlsPath && !video.hlsPath.startsWith('magnet:'));
    const hasLocalAsset = Boolean(video.storageKey);
    const hlsFullUrl = hasHlsStream ? `${STORAGE_BASE_URL}/${video.hlsPath}` : null;
    const streamUrl = API_BASE_URL
        ? `${API_BASE_URL}/api/v1/videos/${video.id}/stream`
        : `/api/v1/videos/${video.id}/stream`;
    const shouldUseDirectPlayer = hasHlsStream || (video.status === 'READY' && hasLocalAsset);
    const shouldUseTorrentPlayer = hasMagnetStream && ['NEXUS', 'PROCESSING', 'READY'].includes(video.status);
    const discoveryItems = [
        ...(feed?.movies || []),
        ...(feed?.spotlight || []),
        ...(feed?.rows?.flatMap((row) => row.items || []) || []),
    ];
    const discoveryVideoSignal = getPtbrSignalSummary(
        discoveryItems.find((entry) => entry.kind === 'video' && entry.id === video.id) || null
    );

    return (
        <div className="min-h-screen bg-background text-foreground pb-20 pt-0 md:pt-32 relative overflow-hidden">
            {/* Ambient Background Glows */}
            <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[150px] -z-10" />

            {/* Header / Back Navigation */}
            <div className="absolute top-4 left-0 w-full z-[60] px-4 sm:px-6 pointer-events-none md:fixed md:top-24">
                <Link to="/" className="pointer-events-auto">
                    <button className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-white/5 backdrop-blur-3xl border border-white/10 text-white hover:text-primary hover:border-primary/50 transition-all shadow-2xl">
                        <ChevronLeft size={24} />
                    </button>
                </Link>
            </div>

            {/* Cinematic Player Section */}
            <div className="relative w-full min-h-[100dvh] md:min-h-0 md:aspect-video md:h-[85vh] bg-black overflow-hidden group isolate">
                <div className="absolute inset-0 flex items-center justify-center">
                    {shouldUseDirectPlayer ? (
                        // VÃ­deo local com streaming direto ou via Torrent Gateway
                        <FeatureErrorBoundary
                            title="Player temporariamente instavel"
                            description="O stream encontrou um erro visual. Voce pode tentar de novo sem sair desta tela."
                        >
                            <React.Suspense fallback={<ExperienceLoader label="Carregando player" variant="player" className="h-full w-full bg-black" compact />}>
                                <PlayerComponent hlsUrl={hlsFullUrl || streamUrl} />
                            </React.Suspense>
                        </FeatureErrorBoundary>
                    ) : video.status === 'CATALOG' ? (
                        // CLIQUE PARA INICIAR STREAMING (CATÃLOGO)
                        <div className="w-full h-full relative group">
                            <img
                                src={video.thumbnailPath ? (video.thumbnailPath.startsWith('http') ? video.thumbnailPath : `${STORAGE_BASE_URL}/${video.thumbnailPath}`) : ''}
                                className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-40 transition-opacity duration-700"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />

                            <div className="relative z-20 flex flex-col items-center justify-center h-full space-y-5 sm:space-y-8 px-4 text-center">
                                {trustedSourceHint && (
                                    <div className={`px-4 py-2 rounded-full border text-[9px] sm:text-[10px] font-black uppercase tracking-[0.16em] sm:tracking-[0.25em] ${
                                        trustedSourceHint.tone === 'emerald'
                                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'
                                            : trustedSourceHint.tone === 'sky'
                                                ? 'bg-sky-500/15 text-sky-300 border-sky-400/30'
                                                : 'bg-amber-500/15 text-amber-200 border-amber-400/30'
                                    }`}>
                                        {trustedSourceHint.label} via {trustedSourceHint.addonName}
                                    </div>
                                )}
                                <motion.button
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => handleMaterialize(trustedSourceHint?.tone === 'emerald' ? trustedPlayableStream : null)}
                                    className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-primary text-black flex items-center justify-center shadow-[0_0_50px_rgba(var(--primary),0.6)] group-hover:shadow-[0_0_80px_rgba(var(--primary),0.8)] transition-all duration-500"
                                >
                                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 sm:w-10 sm:h-10 ml-1">
                                        <path d="M8 5v14l11-7z" />
                                    </svg>
                                </motion.button>
                                <div className="text-center">
                                    <h3 className="text-xl sm:text-2xl font-black text-white uppercase italic tracking-tight">Iniciar Transmissao</h3>
                                    <p className="text-[9px] sm:text-[10px] font-black text-primary uppercase tracking-[0.18em] sm:tracking-[0.3em] mt-2">
                                        {isEvaluatingTrustedSource
                                            ? 'Arconte esta avaliando a melhor fonte'
                                            : trustedSourceHint?.tone === 'emerald'
                                                ? 'Clique para assistir direto com a fonte preferida da sua casa'
                                                : 'Clique para materializar do Nexus'}
                                    </p>
                                    <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                                        <Button
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                setStreamDialogManualMode(true);
                                                setStreamDialog(true);
                                            }}
                                            className="h-11 px-5 rounded-2xl bg-black/60 border border-white/10 text-white hover:bg-black/80 font-black uppercase text-[10px] tracking-[0.2em]"
                                        >
                                            Ver Addons
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : shouldUseTorrentPlayer ? (
                        <FeatureErrorBoundary
                            title="Player torrent isolado"
                            description="O player P2P falhou nesta tentativa. A tela segue viva para trocar a fonte ou tentar novamente."
                        >
                            <div className="w-full h-full relative">
                            <React.Suspense fallback={<ExperienceLoader label="Carregando enxame" variant="player" className="h-full w-full bg-black" compact />}>
                                    <TorrentPlayer
                                        magnetURI={video.hlsPath!}
                                        videoId={video.id}
                                        onReady={handleTorrentReady}
                                        onProgress={handleProgress}
                                        immersive
                                    />
                                </React.Suspense>
                                <div className="absolute top-4 right-4 z-20 md:top-6 md:right-6">
                                    <Button
                                        onClick={() => handleMaterialize()}
                                        disabled={isMaterializing}
                                        className="h-12 px-5 rounded-2xl bg-black/70 border border-white/10 text-white hover:bg-black/90 font-black uppercase tracking-[0.2em] text-[10px]"
                                    >
                                        {isMaterializing ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Database size={14} className="mr-2" />}
                                        Materializar
                                    </Button>
                                </div>
                            </div>
                        </FeatureErrorBoundary>
                    ) : (
                        // Processing UI
                        <div className="w-full h-full flex flex-col items-center justify-center bg-black relative">
                            {/* ... Processing UI ... */}
                            <div className="relative z-10 text-center space-y-8 max-w-xl px-6">
                                <h2 className="text-4xl md:text-5xl font-black tracking-tighter uppercase italic leading-none">
                                    Nexus <span className="text-gradient-primary">Processing</span>
                                </h2>
                                <p className="text-white/40 text-sm leading-relaxed font-medium uppercase tracking-wide">
                                    Aguarde... o ativo estÃ¡ sendo preparado.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Vignette FX */}
                <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-background via-transparent to-transparent opacity-80" />
            </div>

            {/* Content Details */}
            <div className="container mx-auto px-4 sm:px-6 md:px-12 mt-8 md:mt-12 grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-16">
                <div className="lg:col-span-8 space-y-8 md:space-y-12">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8 }}
                        className="space-y-6"
                    >
                        <div className="flex flex-wrap items-center gap-3 sm:gap-6">
                            <span className="text-primary font-black text-lg italic tracking-tight flex items-center gap-2">
                                <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                                98% Match
                            </span>
                            <span className="text-white/40 font-black text-xs uppercase tracking-[0.2em]">{new Date(video.createdAt).getFullYear()}</span>
                            <span className="bg-white/5 border border-white/10 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest text-white/60">UHD 4K HDR</span>
                            <span className="text-accent font-black uppercase tracking-[0.3em] text-[10px] bg-accent/5 border border-accent/20 px-3 py-1 rounded-full">{video.category || 'General'}</span>
                        </div>

                        {discoveryVideoSignal && (
                            <button
                                type="button"
                                onClick={() => setShowPtbrSignalDetails((current) => !current)}
                                className={`inline-flex flex-col rounded-2xl border px-4 py-3 text-left transition-all hover:border-white/20 ${
                                discoveryVideoSignal.tone === 'strong'
                                    ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200'
                                    : discoveryVideoSignal.tone === 'subtitle'
                                        ? 'border-cyan-400/20 bg-cyan-500/10 text-cyan-100'
                                        : 'border-white/10 bg-white/5 text-white/70'
                            }`}>
                                <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                                    Sinal PT-BR aprendido {showPtbrSignalDetails ? '• aberto' : '• tocar para abrir'}
                                </span>
                                <span className="mt-2 text-sm font-semibold">
                                    {discoveryVideoSignal.label}
                                </span>
                                <span className="mt-1 text-xs text-current/80">
                                    {discoveryVideoSignal.detail}
                                </span>
                                {showPtbrSignalDetails && (
                                    <div className="mt-3 space-y-1 text-xs text-current/80">
                                        <p>Origem: {discoveryVideoSignal.sourceLabel}</p>
                                        <p>Confianca: {discoveryVideoSignal.confidenceLabel}</p>
                                        <p>Base: {discoveryVideoSignal.samplesLabel || 'sem amostras observadas'}</p>
                                        {discoveryVideoSignal.reasons.length > 0 && (
                                            <div className="pt-1 space-y-1">
                                                {discoveryVideoSignal.reasons.map((reason) => (
                                                    <p key={reason}>Subiu por: {reason}</p>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </button>
                        )}

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
                            <React.Suspense fallback={<ExperienceLoader label="Carregando monitor" variant="player" compact className="min-h-0 px-0" />}>
                                    <SynergyMonitor
                                        progress={torrentStats.progress}
                                        downloadSpeed={torrentStats.downloadSpeed}
                                        peers={torrentStats.peers}
                                        status={torrentStats.status}
                                    />
                                </React.Suspense>
                            </motion.div>
                        )}

                        <div
                            className="relative cursor-pointer group/desc"
                            onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                        >
                            <p className={cn(
                                "text-base md:text-xl text-white/50 leading-relaxed max-w-4xl font-medium transition-all duration-500",
                                !isDescriptionExpanded && "line-clamp-3"
                            )}>
                                {video.description || "Nenhuma especificaÃ§Ã£o tÃ©cnica disponÃ­vel para este ativo. A transmissÃ£o segue os protocolos de criptografia e distribuiÃ§Ã£o Nexus Forge."}
                            </p>
                            {!isDescriptionExpanded && video.description && video.description.length > 200 && (
                                <span className="text-primary text-xs font-black uppercase tracking-widest mt-2 block group-hover/desc:translate-x-1 transition-transform">
                                    [+] EXPANDIR DADOS TÃTICOS
                                </span>
                            )}
                        </div>

                        {/* Tags Section Evolution */}
                        {video.tags && (
                            <div className="flex flex-wrap gap-2 sm:gap-3 pt-4">
                                {video.tags.split(',').map((tag, i) => (
                                    <span key={i} className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/40 bg-primary/5 hover:bg-primary/10 hover:text-primary transition-colors border border-primary/10 px-3 py-1.5 rounded-xl cursor-default">
                                        #{tag.trim()}
                                    </span>
                                ))}
                            </div>
                        )}
                    </motion.div>

                    {/* Interaction Buttons Evolution */}
                    <div className="flex flex-wrap items-stretch gap-3 sm:gap-4 md:gap-6 p-2 rounded-[2rem] md:rounded-[2.5rem] bg-white/5 border border-white/10 backdrop-blur-xl">
                        <Button
                            onClick={() => {
                                setStreamDialogManualMode(true);
                                setStreamDialog(true);
                            }}
                            className="flex-1 md:flex-none h-14 md:h-16 px-5 md:px-6 rounded-[1.4rem] md:rounded-[2.2rem] bg-white/5 hover:bg-white/10 text-white font-black uppercase text-[10px] tracking-[0.16em] md:tracking-[0.2em] transition-all duration-500 shadow-glow flex items-center justify-center gap-2 border border-white/5 group min-w-[10rem]"
                        >
                            <Database size={16} className="text-cyan-400 group-hover:scale-110 transition-transform" />
                            Addons
                        </Button>

                        <Button
                            onClick={toggleMyList}
                            className={cn(
                                "flex-1 md:flex-none h-14 md:h-16 px-6 md:px-10 rounded-[1.4rem] md:rounded-[2.2rem] text-[10px] font-black uppercase tracking-[0.16em] md:tracking-[0.2em] transition-all duration-500 min-w-[10rem]",
                                isInMyList
                                    ? "bg-green-500 text-black hover:bg-green-400 shadow-[0_0_30px_-5px_rgba(34,197,94,0.5)]"
                                    : "bg-white text-black hover:bg-white/90 shadow-glow"
                            )}
                        >
                            {isInMyList ? <CheckCircle size={20} className="mr-3" /> : <Plus size={20} className="mr-3" />}
                            {isInMyList ? "Node Reserved" : "Save to My List"}
                        </Button>

                        <div className="flex items-center gap-1 bg-black/40 rounded-[1.4rem] md:rounded-[2.2rem] p-1.5 border border-white/5 w-full sm:w-auto justify-center">
                            <button
                                onClick={() => handleInteraction(true)}
                                className={cn(
                                    "flex items-center gap-2 md:gap-3 px-4 md:px-6 py-3 md:py-4 rounded-[1.2rem] md:rounded-[2rem] transition-all",
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
                                    "flex items-center gap-2 md:gap-3 px-4 md:px-6 py-3 md:py-4 rounded-[1.2rem] md:rounded-[2rem] transition-all",
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
                            className="flex items-center justify-center gap-3 px-5 sm:px-8 h-14 md:h-16 text-white/40 hover:text-primary transition-all ml-0 sm:ml-auto group w-full sm:w-auto"
                        >
                            {justShared
                                ? <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary animate-pulse">Link Copied</span>
                                : <><Share2 size={20} className="group-hover:scale-110 transition-transform" /> <span className="text-[10px] font-black uppercase tracking-[0.3em] hidden sm:inline">Uplink Code</span></>}
                        </button>

                        {user?.role === 'ADMIN' && (
                            <button
                                onClick={async () => {
                                    if (!id) return;
                                    if (window.confirm('ðŸš¨ PERIGO: Apagar este ativo permanentemente? Isso removerÃ¡ todos os arquivos do servidor.')) {
                                        try {
                                            await VideoService.delete(id);
                                            alert('Ativo purgado com sucesso.');
                                            window.location.href = '/';
                                        } catch (e) {
                                            alert('Falha crÃ­tica na purga.');
                                        }
                                    }
                                }}
                                className="h-14 w-14 md:h-16 md:w-16 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-[1.4rem] md:rounded-[2.2rem] transition-all border border-red-500/20 flex items-center justify-center shadow-lg hover:shadow-red-500/40 group"
                                title="PURGAR ATIVO"
                            >
                                <Trash2 size={20} className="group-hover:scale-110 transition-transform" />
                            </button>
                        )}
                    </div>

                    {/* Comments Section Evolution */}
                    <div className="space-y-10 pt-10">
                        <div className="flex items-start sm:items-center justify-between gap-4">
                            <div className="flex items-start sm:items-center gap-3 md:gap-4">
                                <div className="p-3 bg-primary/10 rounded-2xl border border-primary/20 shrink-0">
                                    <MessageSquare className="text-primary" size={24} />
                                </div>
                                <div>
                                    <h2 className="text-2xl md:text-3xl font-black tracking-tight uppercase italic text-white">Nexus Intelligence Feed</h2>
                                    <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em] md:tracking-[0.4em] mt-1 ml-0.5">Distributed Transmission Report</p>
                                </div>
                            </div>
                            <span className="text-primary font-black text-2xl font-mono opacity-40">{stats.comments.length}</span>
                        </div>

                        {/* Comment Input Evolution */}
                        {isAuthenticated ? (
                            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-start bg-white/5 p-4 sm:p-8 rounded-[2rem] md:rounded-[2.5rem] border border-white/5 shadow-2xl relative group overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div className="w-14 h-14 rounded-2xl bg-primary text-black flex items-center justify-center font-black text-xl shadow-glow flex-shrink-0">
                                    {user?.name?.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 space-y-5">
                                    <textarea
                                        value={commentText}
                                        onChange={(e) => setCommentText(e.target.value)}
                                        placeholder="Submeter relatÃ³rio tÃ©cnico de transmissÃ£o..."
                                        className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 sm:p-6 text-sm font-medium focus:border-primary/50 focus:ring-4 focus:ring-primary/10 outline-none transition-all min-h-[140px] resize-none text-white placeholder:text-white/20"
                                    />
                                    <div className="flex justify-end">
                                        <Button
                                            onClick={handlePostComment}
                                            disabled={!commentText.trim() || isPosting}
                                            className="h-12 sm:h-14 px-6 sm:px-10 rounded-2xl bg-primary text-black font-black uppercase text-[10px] tracking-widest shadow-glow hover:scale-[1.05] transition-all flex items-center gap-3 w-full sm:w-auto justify-center"
                                        >
                                            {isPosting ? <Loader2 className="animate-spin" size={18} /> : <><Send size={18} /> Submit Transmission</>}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white/5 border border-white/10 p-6 sm:p-10 rounded-[2rem] md:rounded-[2.5rem] text-center space-y-6">
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
                                        className="flex gap-3 sm:gap-6 group"
                                    >
                                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-[1rem] sm:rounded-[1.2rem] bg-white/5 border border-white/10 flex items-center justify-center text-white/20 font-black text-lg flex-shrink-0 group-hover:border-primary/40 transition-colors">
                                            {comment.user?.name?.charAt(0).toUpperCase() || <UserIcon size={20} />}
                                        </div>
                                        <div className="flex-1 bg-white/5 p-4 sm:p-6 rounded-[1.4rem] sm:rounded-[1.8rem] rounded-tl-none border border-white/5 group-hover:border-white/20 transition-all shadow-xl">
                                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3">
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
                    <div className="glass-card p-5 sm:p-8 md:p-10 rounded-[2rem] md:rounded-[3rem] border border-white/5 space-y-8 sticky top-24 md:top-28">
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
            <FeatureErrorBoundary
                title="Modal de addons isolado"
                description="As fontes falharam nesta tentativa, mas a tela principal continua pronta para uma nova busca."
                className="fixed inset-0 z-[120] flex items-center justify-center pointer-events-none"
            >
                <div className="pointer-events-auto">
                    <React.Suspense fallback={null}>
                        <AddonStreamDialog
                            isOpen={streamDialog}
                            onClose={() => {
                                setStreamDialog(false);
                                setStreamDialogManualMode(false);
                            }}
                            type={(video?.category === 'series' || video?.tags?.includes('tv')) ? 'series' : 'movie'}
                            id={video?.imdbId || video?.tmdbId || video?.title || ''}
                            title={video?.title || ''}
                            disableAutoSelect={streamDialogManualMode}
                        />
                    </React.Suspense>
                </div>
            </FeatureErrorBoundary>
        </div>
    );
};
