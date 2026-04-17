/**
 * 🎬 EPISODE PLAYER COMPONENT
 * Player inteligente com Auto Next overlay.
 * Suporta HLS streaming e reprodução contínua.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, SkipForward, SkipBack, X, Loader2, Download, ChevronLeft } from 'lucide-react';
import { useAutoNext } from '@/hooks/useAutoNext';
import { Episode } from '@/types/series';
import SeriesService from '@/services/api/series.service';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import { useLiveWatchTracking } from '@/hooks/useSocket';
import apiClient from '@/lib/axios';
import { API_BASE_URL } from '@/lib/axios';

export const EpisodePlayer: React.FC = () => {
    const { episodeId } = useParams<{ episodeId: string }>();
    const navigate = useNavigate();
    const videoRef = useRef<HTMLVideoElement>(null);
    const hlsRef = useRef<any | null>(null);

    const [episode, setEpisode] = useState<Episode | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const mountTimeRef = useRef<number>(Date.now());
    const ttffReportedRef = useRef<boolean>(false);
    const sessionBytesRef = useRef<number>(0);
    const sessionStartTimeRef = useRef<number>(0);
    const bufferCountRef = useRef<number>(0);
    const bitratesRef = useRef<number[]>([]);
    const bufferingTimeoutRef = useRef<number | null>(null);
    const lastPlaybackAdvanceRef = useRef<number>(Date.now());
    const [playbackPhase, setPlaybackPhase] = useState<'loading' | 'buffering' | 'ready'>('loading');

    const { user } = useAuthStore();

    // 👁️ Live tracking para o Governor
    useLiveWatchTracking(user?.id, episodeId || null);

    const {
        nextEpisode,
        prevEpisode,
        countdown,
        showOverlay,
        startCountdown,
        playNext,
        playPrevious,
        cancelAutoPlay,
    } = useAutoNext(episodeId || null);
    const resolveBackendUrl = useCallback((path: string) => {
        if (/^https?:\/\//i.test(path)) return path;
        const normalizedPath = path.replace(/^\/+/, '');
        return API_BASE_URL ? `${API_BASE_URL}/${normalizedPath}` : `/${normalizedPath}`;
    }, []);

    useEffect(() => {
        if (!episodeId) return;
        setLoading(true);
        setPlaybackPhase('loading');
        mountTimeRef.current = Date.now();
        ttffReportedRef.current = false;
        sessionBytesRef.current = 0;

        SeriesService.getEpisode(episodeId)
            .then(ep => {
                setEpisode(ep);
                setError(null);
            })
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [episodeId]);

    const sendSessionTelemetry = useCallback(() => {
        if (!episode || !videoRef.current || sessionStartTimeRef.current === 0) return;

        const duration = (Date.now() - sessionStartTimeRef.current) / 1000;
        const isLocal = episode.status === 'READY';

        const avgBitrate = bitratesRef.current.length > 0
            ? bitratesRef.current.reduce((a, b) => a + b, 0) / bitratesRef.current.length
            : 0;

        const payload = {
            userId: user?.id || 'anon',
            videoId: episode.videoId || episode.id,
            duration: Math.round(duration),
            bytesDisk: isLocal ? (sessionBytesRef.current / (1024 * 1024)) : 0,
            bytesNetwork: !isLocal ? (sessionBytesRef.current / (1024 * 1024)) : 0,
            ttff: ttffReportedRef.current ? (Date.now() - mountTimeRef.current) : 0,
            source: isLocal ? 'CACHE' : 'REMOTE',
            bufferEvents: bufferCountRef.current,
            avgBitrate: Number((avgBitrate / 1000000).toFixed(2)) // Mbps
        };

        apiClient.post('/telemetry/session', payload).catch(() => { });
        sessionStartTimeRef.current = 0;
        bufferCountRef.current = 0;
        bitratesRef.current = [];
    }, [episode, user]);

    const clearBufferingTimeout = useCallback(() => {
        if (bufferingTimeoutRef.current) {
            window.clearTimeout(bufferingTimeoutRef.current);
            bufferingTimeoutRef.current = null;
        }
    }, []);

    // Setup HLS or direct video
    useEffect(() => {
        if (!episode?.video || !videoRef.current) return;

        const video = videoRef.current;
        const hlsPath = episode.video.hlsPath;
        const storageKey = episode.video.storageKey;

        // Cleanup previous HLS instance
        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }

        if (hlsPath) {
            const streamUrl = resolveBackendUrl(hlsPath);

            const setupHls = async () => {
                const HlsModule = await import('hls.js');
                const Hls = HlsModule.default;

                if (Hls.isSupported()) {
                    const hls = new Hls({
                        maxBufferLength: 60,
                        maxMaxBufferLength: 120,
                    });
                    hlsRef.current = hls;
                    hls.loadSource(streamUrl);
                    hls.attachMedia(video);
                    hls.on(Hls.Events.MANIFEST_PARSED, () => {
                        video.play().catch(console.error);
                    });
                    hls.on(Hls.Events.FRAG_LOADED, (_: any, data: any) => {
                        sessionBytesRef.current += data.frag.stats.total;
                        const bitrate = (data.frag.stats.total * 8) / data.frag.duration;
                        bitratesRef.current.push(bitrate);
                    });
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = streamUrl;
                    video.addEventListener('loadedmetadata', () => {
                        video.play().catch(console.error);
                    });
                }
            };

            void setupHls();
        } else if (storageKey) {
            // Direct video playback
            video.src = API_BASE_URL
                ? `${API_BASE_URL}/api/v1/videos/${episode.video.id}/stream`
                : `/api/v1/videos/${episode.video.id}/stream`;
            video.play().catch(console.error);
        }
        const handlePlaying = () => {
            lastPlaybackAdvanceRef.current = Date.now();
            clearBufferingTimeout();
            setPlaybackPhase('ready');
            if (sessionStartTimeRef.current === 0) {
                sessionStartTimeRef.current = Date.now();
            }
            if (!ttffReportedRef.current) {
                const ttff = Date.now() - mountTimeRef.current;
                ttffReportedRef.current = true;
                const isLocal = episode?.status === 'READY';
                console.log(`⏱️ TTFF: ${ttff}ms (Local: ${isLocal})`);
                apiClient.post('/telemetry/ttff', {
                    ttff,
                    episodeId,
                    isLocal
                }).catch(() => { });
            }
        };

        const handleWaiting = () => {
            bufferCountRef.current++;
            clearBufferingTimeout();
            bufferingTimeoutRef.current = window.setTimeout(() => {
                if (Date.now() - lastPlaybackAdvanceRef.current > 1200) {
                    setPlaybackPhase((prev) => (prev === 'loading' ? 'loading' : 'buffering'));
                }
                bufferingTimeoutRef.current = null;
            }, 700);
        };

        const handleTimeUpdate = () => {
            lastPlaybackAdvanceRef.current = Date.now();
            clearBufferingTimeout();
            setPlaybackPhase('ready');
        };

        video.addEventListener('playing', handlePlaying);
        video.addEventListener('waiting', handleWaiting);
        video.addEventListener('timeupdate', handleTimeUpdate);

        return () => {
            video.removeEventListener('playing', handlePlaying);
            video.removeEventListener('waiting', handleWaiting);
            video.removeEventListener('timeupdate', handleTimeUpdate);
            clearBufferingTimeout();
            sendSessionTelemetry();
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }
        };
    }, [clearBufferingTimeout, episode, episodeId, resolveBackendUrl, sendSessionTelemetry]);

    const handleVideoEnd = useCallback(() => {
        if (nextEpisode) {
            startCountdown();
        }
    }, [nextEpisode, startCountdown]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-black">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-12 h-12 animate-spin text-primary" />
                    <p className="text-white/50">Carregando episódio...</p>
                </div>
            </div>
        );
    }

    if (error || !episode) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-black">
                <div className="text-center">
                    <p className="text-red-400 text-xl">{error || 'Episódio não encontrado'}</p>
                    <button onClick={() => navigate(-1)} className="mt-4 px-6 py-2 bg-white/10 text-white rounded-lg">
                        Voltar
                    </button>
                </div>
            </div>
        );
    }

    if (episode.status !== 'READY') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-black">
                <div className="text-center space-y-4">
                    <Download className="w-16 h-16 text-white/20 mx-auto" />
                    <h2 className="text-2xl font-bold text-white">Episódio não está pronto</h2>
                    <p className="text-white/50">
                        Status: <span className="text-primary font-mono">{episode.status}</span>
                    </p>
                    {episode.status === 'NOT_DOWNLOADED' && episode.magnetLink && (
                        <button
                            onClick={() => SeriesService.downloadEpisode(episode.id)}
                            className="px-6 py-3 bg-primary rounded-lg text-white font-semibold hover:bg-primary/90 transition-colors"
                        >
                            Iniciar Download
                        </button>
                    )}
                    <button onClick={() => navigate(-1)} className="block mx-auto mt-2 px-6 py-2 bg-white/10 text-white rounded-lg">
                        Voltar
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black relative">
            {/* Back Button */}
            <button
                onClick={() => navigate(episode.seriesId ? `/series/${episode.seriesId}` : -1 as any)}
                className="fixed left-4 top-[max(1rem,env(safe-area-inset-top))] sm:top-6 sm:left-6 z-50 flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-black/60 backdrop-blur-lg text-white/80 hover:text-white hover:bg-black/80 transition-all border border-white/10"
            >
                <ChevronLeft className="w-4 h-4" />
                <span className="text-sm font-medium">Voltar</span>
            </button>

            {/* Episode Info Bar */}
            <div className="fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] -translate-x-1/2 z-50 text-center w-[calc(100%-7rem)] sm:w-auto max-w-[28rem]">
                <div className="glass-card px-4 sm:px-6 py-2.5 sm:py-3 rounded-2xl">
                    <p className="text-white/50 text-xs font-medium uppercase tracking-widest">
                        {episode.series?.title || 'Série'}
                    </p>
                    <h2 className="text-white font-bold text-xs sm:text-sm mt-0.5 truncate">
                        S{String(episode.seasonNumber).padStart(2, '0')}E{String(episode.episodeNumber).padStart(2, '0')} — {episode.title}
                    </h2>
                </div>
            </div>

            {/* Video Player */}
            <div className="relative w-full h-screen flex items-center justify-center bg-black">
                <video
                    ref={videoRef}
                    className="w-full h-full object-contain"
                    controls
                    onEnded={handleVideoEnd}
                    autoPlay
                    playsInline
                />

                {playbackPhase === 'loading' && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/72 backdrop-blur-md">
                        <div className="flex flex-col items-center gap-3 rounded-3xl border border-white/10 bg-black/55 px-6 py-5 text-center text-white shadow-2xl">
                            <Loader2 className="h-10 w-10 animate-spin text-primary" />
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-[0.22em]">
                                    Preparando episodio
                                </p>
                                <p className="mt-1 text-xs text-white/60">
                                    Conectando o stream e carregando a reproducao.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {playbackPhase === 'buffering' && (
                    <div className="absolute left-3 right-3 top-[max(5rem,calc(env(safe-area-inset-top)+4.25rem))] z-30 sm:left-6 sm:right-6 sm:top-6">
                        <div className="mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-white/10 bg-black/70 px-3 py-3 text-white shadow-2xl backdrop-blur-xl">
                            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/8">
                                <Loader2 size={16} className="animate-spin text-primary" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white">
                                    Ajustando a reproducao
                                </p>
                                <p className="mt-1 text-xs leading-relaxed text-white/70">
                                    O episodio ainda esta ativo. O player so esta estabilizando o buffer.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Episode Navigation */}
            <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] sm:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 sm:gap-3 w-[calc(100%-2rem)] sm:w-auto justify-center">
                {prevEpisode && (
                    <button
                        onClick={playPrevious}
                        className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl bg-black/60 backdrop-blur-lg text-white/70 hover:text-white hover:bg-black/80 transition-all border border-white/10 flex-1 sm:flex-none"
                    >
                        <SkipBack className="w-4 h-4" />
                        <span className="text-xs font-medium">Anterior</span>
                    </button>
                )}
                {nextEpisode && (
                    <button
                        onClick={playNext}
                        className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl bg-primary/20 backdrop-blur-lg text-primary hover:bg-primary/30 transition-all border border-primary/30 flex-1 sm:flex-none"
                    >
                        <span className="text-xs font-medium">Próximo</span>
                        <SkipForward className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Auto Next Overlay */}
            <AnimatePresence>
                {showOverlay && nextEpisode && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-xl flex items-center justify-center"
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                            className="max-w-lg w-full mx-3 sm:mx-6"
                        >
                            <div className="glass-card rounded-3xl p-5 sm:p-8 text-center space-y-5 sm:space-y-6">
                                {/* Title */}
                                <div>
                                    <p className="text-white/40 text-xs uppercase tracking-widest font-medium">Próximo Episódio</p>
                                    <h3 className="text-xl sm:text-2xl font-bold text-white mt-2 leading-tight">{nextEpisode.title}</h3>
                                    <p className="text-white/50 text-sm mt-1">
                                        S{String(nextEpisode.seasonNumber).padStart(2, '0')}E{String(nextEpisode.episodeNumber).padStart(2, '0')}
                                    </p>
                                </div>

                                {/* Thumbnail */}
                                {nextEpisode.stillPath && (
                                    <div className="w-full aspect-video rounded-xl overflow-hidden bg-black/40">
                                        <img src={nextEpisode.stillPath} alt={nextEpisode.title} className="w-full h-full object-cover" />
                                    </div>
                                )}

                                {nextEpisode.status === 'READY' ? (
                                    <>
                                        {/* Countdown */}
                                        <div className="relative">
                                            <div className="text-5xl sm:text-6xl font-black text-primary font-mono tabular-nums">
                                                {countdown}
                                            </div>
                                            <div className="mt-2 h-1 bg-white/10 rounded-full overflow-hidden">
                                                <motion.div
                                                    className="h-full bg-primary rounded-full"
                                                    initial={{ width: '100%' }}
                                                    animate={{ width: '0%' }}
                                                    transition={{ duration: 10, ease: 'linear' }}
                                                />
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
                                            <button
                                                onClick={playNext}
                                                className="w-full sm:w-auto px-8 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/30 flex items-center justify-center gap-2"
                                            >
                                                <Play className="w-5 h-5" fill="currentColor" />
                                                Reproduzir Agora
                                            </button>
                                            <button
                                                onClick={cancelAutoPlay}
                                                className="w-full sm:w-auto px-6 py-3 bg-white/5 text-white/60 font-semibold rounded-xl hover:bg-white/10 transition-colors border border-white/10"
                                            >
                                                <X className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-center gap-3 text-amber-400">
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            <span className="font-medium">Preparando episódio...</span>
                                        </div>
                                        <p className="text-white/40 text-sm">
                                            O download está em andamento. Você será notificado quando estiver pronto.
                                        </p>
                                        <button
                                            onClick={cancelAutoPlay}
                                            className="w-full sm:w-auto px-6 py-2.5 bg-white/5 text-white/60 font-semibold rounded-xl hover:bg-white/10 transition-colors"
                                        >
                                            Fechar
                                        </button>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
