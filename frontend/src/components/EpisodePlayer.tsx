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
import Hls from 'hls.js';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import { useLiveWatchTracking } from '@/hooks/useSocket';
import apiClient from '@/lib/axios';

export const EpisodePlayer: React.FC = () => {
    const { episodeId } = useParams<{ episodeId: string }>();
    const navigate = useNavigate();
    const videoRef = useRef<HTMLVideoElement>(null);
    const hlsRef = useRef<Hls | null>(null);

    const [episode, setEpisode] = useState<Episode | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const mountTimeRef = useRef<number>(Date.now());
    const ttffReportedRef = useRef<boolean>(false);
    const sessionBytesRef = useRef<number>(0);
    const sessionStartTimeRef = useRef<number>(0);
    const bufferCountRef = useRef<number>(0);
    const bitratesRef = useRef<number[]>([]);

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

    useEffect(() => {
        if (!episodeId) return;
        setLoading(true);
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
            const streamUrl = `http://localhost:3000/${hlsPath}`;

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
                hls.on(Hls.Events.FRAG_LOADED, (_, data) => {
                    sessionBytesRef.current += data.frag.stats.total;
                    // Bitrate aproximado da frag
                    const bitrate = (data.frag.stats.total * 8) / data.frag.duration;
                    bitratesRef.current.push(bitrate);
                });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = streamUrl;
                video.addEventListener('loadedmetadata', () => {
                    video.play().catch(console.error);
                });
            }
        } else if (storageKey) {
            // Direct video playback
            video.src = `http://localhost:3000/api/v1/videos/${episode.video.id}/stream`;
            video.play().catch(console.error);
        }
        const handlePlaying = () => {
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
        };

        video.addEventListener('playing', handlePlaying);
        video.addEventListener('waiting', handleWaiting);

        return () => {
            video.removeEventListener('playing', handlePlaying);
            video.removeEventListener('waiting', handleWaiting);
            sendSessionTelemetry();
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }
        };
    }, [episode, episodeId, sendSessionTelemetry]);

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
                className="fixed top-6 left-6 z-50 flex items-center gap-2 px-4 py-2 rounded-xl bg-black/60 backdrop-blur-lg text-white/80 hover:text-white hover:bg-black/80 transition-all border border-white/10"
            >
                <ChevronLeft className="w-4 h-4" />
                <span className="text-sm font-medium">Voltar</span>
            </button>

            {/* Episode Info Bar */}
            <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 text-center">
                <div className="glass-card px-6 py-3 rounded-2xl">
                    <p className="text-white/50 text-xs font-medium uppercase tracking-widest">
                        {episode.series?.title || 'Série'}
                    </p>
                    <h2 className="text-white font-bold text-sm mt-0.5">
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
            </div>

            {/* Episode Navigation */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3">
                {prevEpisode && (
                    <button
                        onClick={playPrevious}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-black/60 backdrop-blur-lg text-white/70 hover:text-white hover:bg-black/80 transition-all border border-white/10"
                    >
                        <SkipBack className="w-4 h-4" />
                        <span className="text-xs font-medium">Anterior</span>
                    </button>
                )}
                {nextEpisode && (
                    <button
                        onClick={playNext}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/20 backdrop-blur-lg text-primary hover:bg-primary/30 transition-all border border-primary/30"
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
                            className="max-w-lg w-full mx-6"
                        >
                            <div className="glass-card rounded-3xl p-8 text-center space-y-6">
                                {/* Title */}
                                <div>
                                    <p className="text-white/40 text-xs uppercase tracking-widest font-medium">Próximo Episódio</p>
                                    <h3 className="text-2xl font-bold text-white mt-2">{nextEpisode.title}</h3>
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
                                            <div className="text-6xl font-black text-primary font-mono tabular-nums">
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
                                        <div className="flex items-center justify-center gap-4">
                                            <button
                                                onClick={playNext}
                                                className="px-8 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/30 flex items-center gap-2"
                                            >
                                                <Play className="w-5 h-5" fill="currentColor" />
                                                Reproduzir Agora
                                            </button>
                                            <button
                                                onClick={cancelAutoPlay}
                                                className="px-6 py-3 bg-white/5 text-white/60 font-semibold rounded-xl hover:bg-white/10 transition-colors border border-white/10"
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
                                            className="px-6 py-2.5 bg-white/5 text-white/60 font-semibold rounded-xl hover:bg-white/10 transition-colors"
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
