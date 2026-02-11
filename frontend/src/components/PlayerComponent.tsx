import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { Maximize, Volume2, VolumeX, Play, Pause, Settings, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PlayerProps {
    hlsUrl: string;
}

export const PlayerComponent: React.FC<PlayerProps> = ({ hlsUrl }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [volume, setVolume] = useState(1);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [showControls, setShowControls] = useState(true);
    const [isHoveringProgress, setIsHoveringProgress] = useState(false);
    const controlsTimeoutRef = useRef<any>(null);

    // Persistência de Volume
    useEffect(() => {
        const savedVolume = localStorage.getItem('sf_player_volume');
        if (savedVolume !== null) {
            const v = parseFloat(savedVolume);
            setVolume(v);
            setIsMuted(v === 0);
            if (videoRef.current) {
                videoRef.current.volume = v;
                videoRef.current.muted = v === 0;
            }
        }
    }, []);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        let hls: Hls | null = null;

        if (Hls.isSupported()) {
            hls = new Hls({
                capLevelToPlayerSize: true,
                autoStartLoad: true,
            });
            hls.loadSource(hlsUrl);
            hls.attachMedia(video);

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                // Auto-play muted para melhor UX
                video.muted = isMuted;
                video.volume = volume;
                video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
            });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = hlsUrl;
            video.addEventListener('loadedmetadata', () => {
                video.play().catch(() => { });
            });
        }

        const handleTimeUpdate = () => {
            setCurrentTime(video.currentTime);
            if (video.duration) setDuration(video.duration);
        };

        const handleLoadedMetadata = () => {
            if (video.duration) setDuration(video.duration);
        };

        video.addEventListener('timeupdate', handleTimeUpdate);
        video.addEventListener('loadedmetadata', handleLoadedMetadata);
        video.addEventListener('play', () => setIsPlaying(true));
        video.addEventListener('pause', () => setIsPlaying(false));

        // Atalhos de Teclado
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignorar se estiver em um input
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            switch (e.key.toLowerCase()) {
                case ' ':
                case 'k':
                    e.preventDefault();
                    togglePlay();
                    break;
                case 'f':
                    e.preventDefault();
                    toggleFullscreen();
                    break;
                case 'm':
                    e.preventDefault();
                    toggleMute();
                    break;
                case 'arrowright':
                    e.preventDefault();
                    if (video) video.currentTime += 10;
                    break;
                case 'arrowleft':
                    e.preventDefault();
                    if (video) video.currentTime -= 10;
                    break;
                case 'arrowup':
                    e.preventDefault();
                    handleVolumeChange({ target: { value: Math.min(1, volume + 0.1).toString() } } as any);
                    break;
                case 'arrowdown':
                    e.preventDefault();
                    handleVolumeChange({ target: { value: Math.max(0, volume - 0.1).toString() } } as any);
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            if (hls) hls.destroy();
            video.removeEventListener('timeupdate', handleTimeUpdate);
            video.removeEventListener('loadedmetadata', handleLoadedMetadata);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [hlsUrl, isMuted, volume]);

    const togglePlay = useCallback(() => {
        if (!videoRef.current) return;
        if (videoRef.current.paused) {
            videoRef.current.play();
        } else {
            videoRef.current.pause();
        }
    }, []);

    const toggleMute = useCallback(() => {
        if (!videoRef.current) return;
        const nextMute = !isMuted;
        videoRef.current.muted = nextMute;
        setIsMuted(nextMute);
        if (nextMute) setVolume(0);
        else {
            const v = parseFloat(localStorage.getItem('sf_player_volume') || '1');
            setVolume(v || 1);
            if (videoRef.current) videoRef.current.volume = v || 1;
        }
    }, [isMuted]);

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        setVolume(val);
        if (val > 0) localStorage.setItem('sf_player_volume', val.toString());
        if (videoRef.current) {
            videoRef.current.volume = val;
            videoRef.current.muted = val === 0;
            setIsMuted(val === 0);
        }
    };

    const handleSeek = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const pos = (clientX - rect.left) / rect.width;
        if (videoRef.current && duration) {
            videoRef.current.currentTime = pos * duration;
        }
    };

    const toggleFullscreen = useCallback(() => {
        if (!containerRef.current) return;
        if (!document.fullscreenElement) {
            containerRef.current.requestFullscreen().catch(err => {
                console.error(`Erro ao tentar modo tela cheia: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    }, []);

    const handleMouseMove = () => {
        setShowControls(true);
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = setTimeout(() => {
            if (isPlaying) setShowControls(false);
        }, 3000);
    };

    const formatTime = (seconds: number) => {
        if (isNaN(seconds)) return "00:00";
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        if (h > 0) {
            return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const progressPercent = duration ? (currentTime / duration) * 100 : 0;

    return (
        <div
            ref={containerRef}
            className="group relative w-full h-full bg-black flex items-center justify-center overflow-hidden select-none"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => isPlaying && setShowControls(false)}
        >
            <video
                ref={videoRef}
                className="w-full h-full object-contain cursor-pointer"
                onClick={togglePlay}
                playsInline
            />

            {/* Overlay Gradient Superior (Netflix Style) */}
            <div className={cn(
                "absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/70 to-transparent transition-opacity duration-300 pointer-events-none",
                showControls ? "opacity-100" : "opacity-0"
            )} />

            {/* Custom Controls Container */}
            <div className={cn(
                "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent px-4 md:px-8 pb-4 md:pb-8 pt-24 transition-opacity duration-500 flex flex-col gap-4",
                showControls ? "opacity-100" : "opacity-0"
            )}>

                {/* Progress Bar Container */}
                <div
                    className="relative w-full h-1 md:h-1.5 group/progress cursor-pointer flex items-center"
                    onMouseDown={handleSeek}
                    onMouseEnter={() => setIsHoveringProgress(true)}
                    onMouseLeave={() => setIsHoveringProgress(false)}
                >
                    {/* Background Bar */}
                    <div className="absolute inset-0 bg-white/20 rounded-full" />

                    {/* Buffered (Opcional, futuro) */}

                    {/* Elapsed Progress Bar */}
                    <div
                        className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-100"
                        style={{ width: `${progressPercent}%` }}
                    >
                        {/* Circle Handle */}
                        <div className={cn(
                            "absolute right-[-6px] top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-primary rounded-full shadow-[0_0_10px_rgba(var(--primary),0.8)] transition-transform",
                            isHoveringProgress ? "scale-125" : "scale-0"
                        )} />
                    </div>
                </div>

                <div className="flex items-center justify-between">
                    {/* Left Controls */}
                    <div className="flex items-center gap-4 md:gap-6">
                        <button
                            onClick={togglePlay}
                            className="text-white hover:text-primary transition-transform active:scale-90"
                            title={isPlaying ? "Pausar" : "Reproduzir"}
                        >
                            {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" />}
                        </button>

                        <div className="flex items-center gap-4 group/volume">
                            <button onClick={toggleMute} className="text-white hover:text-primary transition-colors">
                                {isMuted || volume === 0 ? <VolumeX size={26} /> : <Volume2 size={26} />}
                            </button>

                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.1"
                                value={volume}
                                onChange={handleVolumeChange}
                                className="w-0 group-hover/volume:w-20 md:group-hover/volume:w-24 transition-all duration-300 h-1 bg-white/30 appearance-none rounded-full accent-primary cursor-pointer overflow-hidden"
                            />
                        </div>

                        <div className="text-white/90 text-[13px] md:text-sm font-bold font-mono tracking-tight flex items-center gap-1.5">
                            <span className="text-white drop-shadow-sm">{formatTime(currentTime)}</span>
                            <span className="text-white/40">/</span>
                            <span className="text-white/60">{formatTime(duration)}</span>
                        </div>
                    </div>

                    {/* Right Controls */}
                    <div className="flex items-center gap-4 md:gap-6">
                        <button
                            className="text-white hover:text-primary transition-all active:rotate-45"
                            title="Configurações"
                        >
                            <Settings size={22} />
                        </button>

                        <button
                            onClick={toggleFullscreen}
                            className="text-white hover:text-primary transition-transform active:scale-110"
                            title="Tela Cheia"
                        >
                            {document.fullscreenElement ? <RotateCcw size={22} className="rotate-45" /> : <Maximize size={24} />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Big Center Overlay for Play/Pause State Visual Feedback */}
            <div className={cn(
                "absolute inset-0 flex items-center justify-center pointer-events-none transition-all duration-500",
                !isPlaying ? "opacity-100 scale-100" : "opacity-0 scale-150"
            )}>
                <div className="bg-black/40 backdrop-blur-md p-8 rounded-full border border-white/10 glow-primary">
                    <Play size={48} fill="white" className="ml-1 text-white shadow-2xl" />
                </div>
            </div>

            {/* Loading Spinner for HLS Buffering */}
            <div className="absolute inset-x-0 bottom-1/2 translate-y-1/2 flex justify-center pointer-events-none opacity-0 group-[.buffering]:opacity-100">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        </div>
    );
};
