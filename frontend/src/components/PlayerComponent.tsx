import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize, Volume2, VolumeX, Play, Pause, Settings, RotateCcw, Headphones, Subtitles, Check, PictureInPicture2, Upload, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PlayerProps {
    hlsUrl: string;
}

type AudioOption = {
    id: string;
    label: string;
    language: string;
    index: number;
    kind: 'hls' | 'native';
};

type SubtitleOption = {
    id: string;
    label: string;
    language: string;
    index: number;
    kind: 'hls' | 'native' | 'local';
    url?: string;
};

const normalize = (value?: string | null) =>
    String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

const looksLikeHls = (url: string) => /\.m3u8(\?|$)/i.test(url);

const prettifyLanguage = (value?: string | null) => {
    const normalized = normalize(value);
    if (!normalized || normalized === 'und') return 'Idioma não identificado';
    if (/(pt-br|por|^pt$)/.test(normalized)) return 'Português';
    if (/(^en$|eng|ingles|english)/.test(normalized)) return 'Inglês';
    if (/(^es$|spa|espanhol|spanish)/.test(normalized)) return 'Espanhol';
    if (/(^fr$|fra|french|frances)/.test(normalized)) return 'Francês';
    if (/(^it$|ita|italian|italiano)/.test(normalized)) return 'Italiano';
    if (/(^de$|deu|ger|german|alemao)/.test(normalized)) return 'Alemão';
    if (/(^ja$|jpn|japanese)/.test(normalized)) return 'Japonês';
    if (/(^ko$|kor|korean)/.test(normalized)) return 'Coreano';
    return String(value);
};

const prettifyAudioLabel = (label?: string | null, language?: string | null, index?: number) => {
    const raw = String(label || '').trim();
    const normalized = normalize(`${raw} ${language || ''}`);
    const baseLanguage = prettifyLanguage(language || raw);
    const tags: string[] = [];

    if (/dublado|dub|dual audio|portugu/.test(normalized) || /(pt-br|por|^pt$)/.test(normalized)) tags.push('Dublado');
    else if (/original|english|ingles|eng/.test(normalized)) tags.push('Original');

    if (/5\.1|5_1|6ch|surround/.test(normalized)) tags.push('5.1');
    else if (/2\.0|2ch|stereo/.test(normalized)) tags.push('2.0');

    const suffix = tags.length ? ` (${tags.join(' • ')})` : '';
    return `${baseLanguage}${suffix}` || raw || `Áudio ${typeof index === 'number' ? index + 1 : ''}`.trim();
};

const prettifySubtitleLabel = (label?: string | null, language?: string | null, index?: number) => {
    const raw = String(label || '').trim();
    const normalized = normalize(`${raw} ${language || ''}`);
    const baseLanguage = prettifyLanguage(language || raw);
    const suffix = /sdh|cc|closed caption/.test(normalized) ? ' (CC)' : '';
    return `Legenda ${baseLanguage}${suffix}` || raw || `Legenda ${typeof index === 'number' ? index + 1 : ''}`.trim();
};

export const PlayerComponent: React.FC<PlayerProps> = ({ hlsUrl }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const hlsRef = useRef<any | null>(null);
    const controlsTimeoutRef = useRef<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [volume, setVolume] = useState(1);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [showControls, setShowControls] = useState(true);
    const [isHoveringProgress, setIsHoveringProgress] = useState(false);
    const [audioOptions, setAudioOptions] = useState<AudioOption[]>([]);
    const [subtitleOptions, setSubtitleOptions] = useState<SubtitleOption[]>([]);
    const [selectedAudioId, setSelectedAudioId] = useState<string>('default');
    const [selectedSubtitleId, setSelectedSubtitleId] = useState<string>('off');
    const [showSettings, setShowSettings] = useState(false);
    const [settingsTab, setSettingsTab] = useState<'audio' | 'subtitle'>('audio');
    const [playerPhase, setPlayerPhase] = useState<'loading' | 'buffering' | 'ready'>('loading');
    const [recoveryLabel, setRecoveryLabel] = useState<'loading' | 'reconnecting' | null>('loading');

    const isHlsSource = useMemo(() => looksLikeHls(hlsUrl), [hlsUrl]);
    const lastPlaybackAdvanceRef = useRef<number>(Date.now());
    const bufferingTimeoutRef = useRef<number | null>(null);

    const clearHideControlsTimer = () => {
        if (controlsTimeoutRef.current) {
            window.clearTimeout(controlsTimeoutRef.current);
            controlsTimeoutRef.current = null;
        }
    };

    const clearBufferingTimeout = () => {
        if (bufferingTimeoutRef.current) {
            window.clearTimeout(bufferingTimeoutRef.current);
            bufferingTimeoutRef.current = null;
        }
    };

    const scheduleHideControls = useCallback(() => {
        clearHideControlsTimer();
        controlsTimeoutRef.current = window.setTimeout(() => {
            if (isPlaying) setShowControls(false);
        }, 3000);
    }, [isPlaying]);

    useEffect(() => {
        const savedVolume = localStorage.getItem('sf_player_volume');
        if (savedVolume !== null) {
            const nextVolume = parseFloat(savedVolume);
            setVolume(nextVolume);
            setIsMuted(nextVolume === 0);
        }
    }, []);

    const syncNativeTextTracks = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;

        const tracks = Array.from(video.textTracks || []).map((track, index) => ({
            id: `native-sub-${index}`,
            label: prettifySubtitleLabel(track.label, track.language, index),
            language: track.language || 'und',
            index,
            kind: 'native' as const,
        }));

        setSubtitleOptions((previous) => {
            const locals = previous.filter((item) => item.kind === 'local');
            return [...tracks, ...locals];
        });
    }, []);

    const syncNativeAudioTracks = useCallback(() => {
        const video = videoRef.current as HTMLVideoElement & {
            audioTracks?: ArrayLike<{ id?: string; label?: string; language?: string; enabled?: boolean }>;
        };

        const nativeTracks = video?.audioTracks;
        if (!nativeTracks || nativeTracks.length === 0) return;

        const options = Array.from({ length: nativeTracks.length }).map((_, index) => {
            const track = nativeTracks[index];
            return {
                id: `native-audio-${index}`,
                label: prettifyAudioLabel(track?.label, track?.language, index),
                language: track?.language || 'und',
                index,
                kind: 'native' as const,
            };
        });

        setAudioOptions(options);
    }, []);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        let cancelled = false;
        let hls: any | null = null;

        const applyAutoPlay = () => {
            if (cancelled) return;
            video.muted = isMuted;
            video.volume = volume;
            video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        };

        const handleTimeUpdate = () => {
            setCurrentTime(video.currentTime);
            if (video.duration) setDuration(video.duration);
            lastPlaybackAdvanceRef.current = Date.now();
            clearBufferingTimeout();
            setPlayerPhase('ready');
            setRecoveryLabel(null);
        };

        const handleLoadedMetadata = () => {
            if (video.duration) setDuration(video.duration);
            syncNativeTextTracks();
            syncNativeAudioTracks();
        };

        const handlePlay = () => {
            setIsPlaying(true);
            setPlayerPhase('ready');
            setRecoveryLabel(null);
        };
        const handlePause = () => setIsPlaying(false);
        const handleWaiting = () => {
            clearBufferingTimeout();
            bufferingTimeoutRef.current = window.setTimeout(() => {
                const stalledFor = Date.now() - lastPlaybackAdvanceRef.current;
                if (stalledFor > 1200) {
                    setPlayerPhase((prev) => (prev === 'loading' ? 'loading' : 'buffering'));
                    setRecoveryLabel(video.currentTime > 5 ? 'reconnecting' : 'loading');
                }
                bufferingTimeoutRef.current = null;
            }, 700);
        };

        video.addEventListener('timeupdate', handleTimeUpdate);
        video.addEventListener('loadedmetadata', handleLoadedMetadata);
        video.addEventListener('play', handlePlay);
        video.addEventListener('pause', handlePause);
        video.addEventListener('waiting', handleWaiting);
        video.addEventListener('playing', handlePlay);

        const setupPlayback = async () => {
            if (isHlsSource) {
                const HlsModule = await import('hls.js');
                const Hls = HlsModule.default;

                if (cancelled) return;

                if (Hls.isSupported()) {
                    hls = new Hls({
                        capLevelToPlayerSize: true,
                        autoStartLoad: true,
                    });
                    hlsRef.current = hls;
                    hls.loadSource(hlsUrl);
                    hls.attachMedia(video);

                    hls.on(Hls.Events.MANIFEST_PARSED, () => {
                        const audio = (hls?.audioTracks || []).map((track: any, index: number) => ({
                            id: `hls-audio-${index}`,
                            label: prettifyAudioLabel(track.name, track.lang, index),
                            language: track.lang || 'und',
                            index,
                            kind: 'hls' as const,
                        }));

                        const subtitles = (hls?.subtitleTracks || []).map((track: any, index: number) => ({
                            id: `hls-sub-${index}`,
                            label: prettifySubtitleLabel(track.name, track.lang, index),
                            language: track.lang || 'und',
                            index,
                            kind: 'hls' as const,
                        }));

                        setAudioOptions(audio);
                        setSubtitleOptions(subtitles);
                        applyAutoPlay();
                    });
                    return;
                }
            }

            video.src = hlsUrl;
            video.load();
            video.addEventListener('loadedmetadata', applyAutoPlay, { once: true });
        };

        void setupPlayback();

        return () => {
            cancelled = true;
            clearHideControlsTimer();
            clearBufferingTimeout();
            if (hls) {
                hls.destroy();
                hlsRef.current = null;
            }
            video.removeEventListener('timeupdate', handleTimeUpdate);
            video.removeEventListener('loadedmetadata', handleLoadedMetadata);
            video.removeEventListener('play', handlePlay);
            video.removeEventListener('pause', handlePause);
            video.removeEventListener('waiting', handleWaiting);
            video.removeEventListener('playing', handlePlay);
        };
    }, [hlsUrl, isHlsSource, isMuted, volume, syncNativeAudioTracks, syncNativeTextTracks]);

    const togglePlay = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) video.play().catch(() => undefined);
        else video.pause();
    }, []);

    const toggleMute = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;

        const nextMuted = !video.muted;
        video.muted = nextMuted;
        setIsMuted(nextMuted);
        if (nextMuted) {
            setVolume(0);
        } else {
            const restoredVolume = parseFloat(localStorage.getItem('sf_player_volume') || '1') || 1;
            video.volume = restoredVolume;
            setVolume(restoredVolume);
        }
    }, []);

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const nextVolume = parseFloat(e.target.value);
        const video = videoRef.current;
        setVolume(nextVolume);
        if (nextVolume > 0) localStorage.setItem('sf_player_volume', nextVolume.toString());
        if (video) {
            video.volume = nextVolume;
            video.muted = nextVolume === 0;
        }
        setIsMuted(nextVolume === 0);
    };

    const handleSeek = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const position = (clientX - rect.left) / rect.width;
        if (videoRef.current && duration) {
            videoRef.current.currentTime = Math.max(0, Math.min(duration, position * duration));
        }
    };

    const toggleFullscreen = useCallback(() => {
        const container = containerRef.current as HTMLDivElement & {
            webkitRequestFullscreen?: () => Promise<void> | void;
        };
        const video = videoRef.current as HTMLVideoElement & {
            webkitEnterFullscreen?: () => void;
        };
        if (!container) return;
        if (!document.fullscreenElement) {
            if (container.requestFullscreen) {
                container.requestFullscreen().catch((err) => console.error(`Erro ao entrar em tela cheia: ${err.message}`));
                return;
            }
            if (container.webkitRequestFullscreen) {
                container.webkitRequestFullscreen();
                return;
            }
            if (video?.webkitEnterFullscreen) {
                video.webkitEnterFullscreen();
            }
        } else {
            document.exitFullscreen().catch(() => undefined);
        }
    }, []);

    const openPictureInPicture = useCallback(async () => {
        const video = videoRef.current as HTMLVideoElement & {
            requestPictureInPicture?: () => Promise<unknown>;
        };
        if (!video?.requestPictureInPicture) return;
        try {
            await video.requestPictureInPicture();
        } catch (error) {
            console.warn('Picture-in-picture indisponível:', error);
        }
    }, []);

    const handleMouseMove = () => {
        setShowControls(true);
        scheduleHideControls();
    };

    const handleAudioSelect = useCallback((option: AudioOption) => {
        const video = videoRef.current as HTMLVideoElement & {
            audioTracks?: ArrayLike<{ enabled?: boolean }>;
        };
        if (!video) return;

        if (option.kind === 'hls' && hlsRef.current) {
            hlsRef.current.audioTrack = option.index;
        } else if (option.kind === 'native' && video.audioTracks) {
            for (let i = 0; i < video.audioTracks.length; i += 1) {
                video.audioTracks[i].enabled = i === option.index;
            }
        }

        setSelectedAudioId(option.id);
    }, []);

    const disableSubtitles = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;

        if (hlsRef.current) {
            hlsRef.current.subtitleTrack = -1;
        }

        Array.from(video.textTracks || []).forEach((track) => {
            track.mode = 'disabled';
        });

        setSelectedSubtitleId('off');
    }, []);

    const handleSubtitleSelect = useCallback((option: SubtitleOption) => {
        const video = videoRef.current;
        if (!video) return;

        if (option.kind === 'hls' && hlsRef.current) {
            hlsRef.current.subtitleTrack = option.index;
        } else {
            Array.from(video.textTracks || []).forEach((track, index) => {
                track.mode = option.kind === 'native' && index === option.index ? 'showing' : 'disabled';
            });
        }

        setSelectedSubtitleId(option.id);
    }, []);

    const handleLocalSubtitle = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        const video = videoRef.current;
        if (!file || !video) return;

        const url = URL.createObjectURL(file);
        const localId = `local-sub-${Date.now()}`;
        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.label = file.name.replace(/\.[^/.]+$/, '');
        track.srclang = 'pt';
        track.src = url;
        track.default = true;
        video.appendChild(track);

        setSubtitleOptions((previous) => {
            const next = [
                ...previous.filter((item) => item.kind !== 'local'),
                {
                    id: localId,
                    label: prettifySubtitleLabel(track.label, 'pt', previous.length),
                    language: 'pt',
                    index: previous.length,
                    kind: 'local' as const,
                    url,
                },
            ];
            return next;
        });

        setTimeout(() => {
            Array.from(video.textTracks || []).forEach((textTrack, index) => {
                textTrack.mode = index === (video.textTracks.length - 1) ? 'showing' : 'disabled';
            });
            setSelectedSubtitleId(localId);
        }, 50);
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
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
                case 'c':
                    e.preventDefault();
                    setSettingsTab('subtitle');
                    setShowSettings((value) => !value);
                    break;
                case 'a':
                    e.preventDefault();
                    setSettingsTab('audio');
                    setShowSettings((value) => !value);
                    break;
                case 'arrowright':
                    e.preventDefault();
                    if (videoRef.current) videoRef.current.currentTime += 10;
                    break;
                case 'arrowleft':
                    e.preventDefault();
                    if (videoRef.current) videoRef.current.currentTime -= 10;
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [toggleFullscreen, toggleMute, togglePlay]);

    const formatTime = (seconds: number) => {
        if (isNaN(seconds)) return '00:00';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const progressPercent = duration ? (currentTime / duration) * 100 : 0;
    const preferredAudio = audioOptions.find((option) => /por|pt|pt-br/.test(normalize(option.language)) || /dublado|portugu/.test(normalize(option.label)));
    const preferredSubtitle = subtitleOptions.find((option) => /por|pt|pt-br/.test(normalize(option.language)) || /legend|portugu/.test(normalize(option.label)));
    const showBlockingLoader = playerPhase === 'loading';
    const showCompactRecovery = playerPhase === 'buffering';

    useEffect(() => {
        if (preferredAudio && selectedAudioId === 'default') {
            handleAudioSelect(preferredAudio);
        }
    }, [preferredAudio, selectedAudioId, handleAudioSelect]);

    useEffect(() => {
        if (preferredSubtitle && selectedSubtitleId === 'off') {
            handleSubtitleSelect(preferredSubtitle);
        }
    }, [preferredSubtitle, selectedSubtitleId, handleSubtitleSelect]);

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
                crossOrigin="anonymous"
            />

            {showBlockingLoader && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/72 backdrop-blur-md">
                    <div className="flex flex-col items-center gap-3 rounded-3xl border border-white/10 bg-black/55 px-6 py-5 text-center text-white shadow-2xl">
                        <Loader2 className="h-10 w-10 animate-spin text-primary" />
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.22em]">
                                Preparando reproducao
                            </p>
                            <p className="mt-1 text-xs text-white/60">
                                Conectando o stream e carregando o video.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {showCompactRecovery && (
                <div className="absolute left-3 right-3 top-[max(1rem,env(safe-area-inset-top))] z-30 sm:left-6 sm:right-6">
                    <div className="mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-white/10 bg-black/70 px-3 py-3 text-white shadow-2xl backdrop-blur-xl">
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/8">
                            <Loader2 size={16} className="animate-spin text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white">
                                {recoveryLabel === 'reconnecting' ? 'Reconectando o video' : 'Preparando o video'}
                            </p>
                            <p className="mt-1 text-xs leading-relaxed text-white/70">
                                Ajustando o buffer para manter a reproducao fluida.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <div className={cn(
                'absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/70 to-transparent transition-opacity duration-300 pointer-events-none',
                showControls ? 'opacity-100' : 'opacity-0'
            )} />

            <div className={cn(
                'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent px-3 sm:px-4 md:px-8 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:pb-8 pt-16 sm:pt-20 md:pt-24 transition-opacity duration-500 flex flex-col gap-3 sm:gap-4',
                showControls ? 'opacity-100' : 'opacity-0'
            )}>
                <div
                    className="relative w-full h-1 md:h-1.5 group/progress cursor-pointer flex items-center"
                    onMouseDown={handleSeek}
                    onTouchStart={handleSeek}
                    onMouseEnter={() => setIsHoveringProgress(true)}
                    onMouseLeave={() => setIsHoveringProgress(false)}
                >
                    <div className="absolute inset-0 bg-white/20 rounded-full" />
                    <div
                        className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-100"
                        style={{ width: `${progressPercent}%` }}
                    >
                        <div className={cn(
                            'absolute right-[-6px] top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-primary rounded-full shadow-[0_0_10px_rgba(var(--primary),0.8)] transition-transform',
                            isHoveringProgress ? 'scale-125' : 'scale-0'
                        )} />
                    </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="flex items-center gap-3 sm:gap-4 md:gap-6">
                        <button onClick={togglePlay} className="text-white hover:text-primary transition-transform active:scale-90" title={isPlaying ? 'Pausar' : 'Reproduzir'}>
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

                        <div className="text-white/90 text-[12px] sm:text-[13px] md:text-sm font-bold font-mono tracking-tight flex items-center gap-1.5">
                            <span className="text-white drop-shadow-sm">{formatTime(currentTime)}</span>
                            <span className="text-white/40">/</span>
                            <span className="text-white/60">{formatTime(duration)}</span>
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:justify-end md:gap-4">
                        <button
                            onClick={() => {
                                setSettingsTab('audio');
                                setShowSettings((value) => !value);
                            }}
                            className="text-white hover:text-primary transition-colors relative"
                            title="Trocar áudio"
                        >
                            <Headphones size={22} />
                            {audioOptions.length > 0 && <span className="absolute -top-1 -right-2 text-[9px] bg-green-500 text-black font-black px-1 rounded">{audioOptions.length}</span>}
                        </button>

                        <button
                            onClick={() => {
                                setSettingsTab('subtitle');
                                setShowSettings((value) => !value);
                            }}
                            className="text-white hover:text-primary transition-colors relative"
                            title="Trocar legenda"
                        >
                            <Subtitles size={22} />
                            {subtitleOptions.length > 0 && <span className="absolute -top-1 -right-2 text-[9px] bg-primary text-black font-black px-1 rounded">{subtitleOptions.length}</span>}
                        </button>

                        <button onClick={() => fileInputRef.current?.click()} className="text-white hover:text-primary transition-colors" title="Carregar legenda local">
                            <Upload size={20} />
                        </button>

                        <button onClick={() => setShowSettings((value) => !value)} className="text-white hover:text-primary transition-all active:rotate-45" title="Configurações">
                            <Settings size={22} />
                        </button>

                        <button onClick={openPictureInPicture} className="hidden md:block text-white hover:text-primary transition-colors" title="Picture in Picture">
                            <PictureInPicture2 size={22} />
                        </button>

                        <button onClick={toggleFullscreen} className="text-white hover:text-primary transition-transform active:scale-110" title="Tela cheia">
                            {document.fullscreenElement ? <RotateCcw size={22} className="rotate-45" /> : <Maximize size={24} />}
                        </button>
                    </div>
                </div>
            </div>

            <AnimateSettingsPanel
                show={showSettings}
                tab={settingsTab}
                onChangeTab={setSettingsTab}
                audioOptions={audioOptions}
                subtitleOptions={subtitleOptions}
                selectedAudioId={selectedAudioId}
                selectedSubtitleId={selectedSubtitleId}
                onSelectAudio={handleAudioSelect}
                onSelectSubtitle={handleSubtitleSelect}
                onDisableSubtitles={disableSubtitles}
            />

            <input
                ref={fileInputRef}
                type="file"
                accept=".srt,.vtt"
                className="hidden"
                onChange={handleLocalSubtitle}
            />

            <div className={cn(
                'absolute inset-0 flex items-center justify-center pointer-events-none transition-all duration-500',
                !isPlaying ? 'opacity-100 scale-100' : 'opacity-0 scale-150'
            )}>
                <div className="bg-black/40 backdrop-blur-md p-8 rounded-full border border-white/10 glow-primary">
                    <Play size={48} fill="white" className="ml-1 text-white shadow-2xl" />
                </div>
            </div>
        </div>
    );
};

const AnimateSettingsPanel = ({
    show,
    tab,
    onChangeTab,
    audioOptions,
    subtitleOptions,
    selectedAudioId,
    selectedSubtitleId,
    onSelectAudio,
    onSelectSubtitle,
    onDisableSubtitles,
}: {
    show: boolean;
    tab: 'audio' | 'subtitle';
    onChangeTab: (tab: 'audio' | 'subtitle') => void;
    audioOptions: AudioOption[];
    subtitleOptions: SubtitleOption[];
    selectedAudioId: string;
    selectedSubtitleId: string;
    onSelectAudio: (option: AudioOption) => void;
    onSelectSubtitle: (option: SubtitleOption) => void;
    onDisableSubtitles: () => void;
}) => {
    if (!show) return null;

    return (
        <div className="absolute right-3 sm:right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] sm:bottom-24 z-40 w-[min(320px,calc(100vw-1.5rem))] sm:max-w-[calc(100vw-2rem)] rounded-3xl border border-white/10 bg-black/90 backdrop-blur-2xl shadow-2xl overflow-hidden">
            <div className="flex border-b border-white/10">
                <button
                    onClick={() => onChangeTab('audio')}
                    className={cn('flex-1 px-4 py-3 text-xs font-black uppercase tracking-[0.2em]', tab === 'audio' ? 'bg-white/10 text-white' : 'text-white/50')}
                >
                    Áudio
                </button>
                <button
                    onClick={() => onChangeTab('subtitle')}
                    className={cn('flex-1 px-4 py-3 text-xs font-black uppercase tracking-[0.2em]', tab === 'subtitle' ? 'bg-white/10 text-white' : 'text-white/50')}
                >
                    Legenda
                </button>
            </div>

            <div className="max-h-[min(320px,48dvh)] overflow-y-auto p-3 space-y-2">
                {tab === 'audio' ? (
                    audioOptions.length ? audioOptions.map((option) => (
                        <button
                            key={option.id}
                            onClick={() => onSelectAudio(option)}
                            className={cn(
                                'w-full flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition-all',
                                selectedAudioId === option.id ? 'border-green-500/40 bg-green-500/10 text-green-400' : 'border-white/5 bg-white/5 text-white/70 hover:bg-white/10'
                            )}
                        >
                            <div>
                                <div className="text-sm font-bold">{option.label}</div>
                                <div className="text-[10px] uppercase tracking-[0.2em] opacity-50">{prettifyLanguage(option.language)}</div>
                            </div>
                            {selectedAudioId === option.id && <Check size={16} />}
                        </button>
                    )) : (
                        <div className="px-3 py-6 text-center text-sm text-white/40">Nenhuma faixa extra detectada agora.</div>
                    )
                ) : (
                    <>
                        <button
                            onClick={onDisableSubtitles}
                            className={cn(
                                'w-full flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition-all',
                                selectedSubtitleId === 'off' ? 'border-primary/40 bg-primary/10 text-primary' : 'border-white/5 bg-white/5 text-white/70 hover:bg-white/10'
                            )}
                        >
                            <div>
                                <div className="text-sm font-bold">Sem legenda</div>
                                <div className="text-[10px] uppercase tracking-[0.2em] opacity-50">Off</div>
                            </div>
                            {selectedSubtitleId === 'off' && <Check size={16} />}
                        </button>
                        {subtitleOptions.length ? subtitleOptions.map((option) => (
                            <button
                                key={option.id}
                                onClick={() => onSelectSubtitle(option)}
                                className={cn(
                                    'w-full flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition-all',
                                    selectedSubtitleId === option.id ? 'border-primary/40 bg-primary/10 text-primary' : 'border-white/5 bg-white/5 text-white/70 hover:bg-white/10'
                                )}
                            >
                                <div>
                                    <div className="text-sm font-bold">{option.label}</div>
                                    <div className="text-[10px] uppercase tracking-[0.2em] opacity-50">{prettifyLanguage(option.language)}</div>
                                </div>
                                {selectedSubtitleId === option.id && <Check size={16} />}
                            </button>
                        )) : (
                            <div className="px-3 py-6 text-center text-sm text-white/40">Nenhuma legenda detectada agora.</div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};
