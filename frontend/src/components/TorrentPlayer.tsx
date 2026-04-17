
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, AlertTriangle, Download, RefreshCw, Wifi, Server, Globe, MessageSquare, List, Send, Activity, ChevronDown, Plus, Subtitles, Trash2, Headphones, Volume2, Maximize, Minimize, Pause, Play, VolumeX, X } from 'lucide-react';
// @ts-ignore
import WebTorrent from 'webtorrent/dist/webtorrent.min.js';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/auth.store';
import { motion, AnimatePresence } from 'framer-motion';
import { BACKEND_URL, GATEWAY_URL } from '@/lib/endpoints';

interface TorrentPlayerProps {
    magnetURI: string;
    videoId: string;
    onReady?: () => void;
    onProgress?: (stats: { progress: number; downloadSpeed: number; peers: number; status: string }) => void;
    immersive?: boolean;
}

type StreamMode = 'gateway' | 'p2p' | 'connecting';
type RecoveryMode = 'idle' | 'auto' | 'manual';

interface ChatMessage {
    id: number;
    text: string;
    user: string;
    timestamp: string;
}

export const TorrentPlayer: React.FC<TorrentPlayerProps> = ({ magnetURI, videoId, onReady, onProgress, immersive = false }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const socketRef = useRef<Socket | null>(null);

    const [status, setStatus] = useState<'CONNECTING' | 'BUFFERING' | 'PLAYING' | 'ERROR'>('CONNECTING');
    const [progress, setProgress] = useState(0);
    const [peers, setPeers] = useState(0);
    const [downloadSpeed, setDownloadSpeed] = useState(0);
    const [fileName, setFileName] = useState<string>('');
    const [fileList, setFileList] = useState<any[]>([]);
    const [subtitleList, setSubtitleList] = useState<any[]>([]);
    const [streamMode, setStreamMode] = useState<StreamMode>('connecting');
    const [showChat, setShowChat] = useState(false);
    const [showFileList, setShowFileList] = useState(false);
    const [showAudioMenu, setShowAudioMenu] = useState(false);

    // Auth & Chat State
    const { user } = useAuthStore();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [messageInput, setMessageInput] = useState('');
    const userName = user?.name || 'Explorador';

    const [downloaded, setDownloaded] = useState(0);
    const [uploaded, setUploaded] = useState(0);
    const [bitfield, setBitfield] = useState<boolean[]>([]);
    const [audioTracks, setAudioTracks] = useState<any[]>([]);
    const [externalAudioFiles, setExternalAudioFiles] = useState<any[]>([]);
    const [currentAudioTrack, setCurrentAudioTrack] = useState<number>(0);
    const [currentExternalAudio, setCurrentExternalAudio] = useState<number>(-1);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [errorNoticeDismissed, setErrorNoticeDismissed] = useState(false);
    const [recoveryMode, setRecoveryMode] = useState<RecoveryMode>('idle');

    // Server-side Multi-audio properties
    const [serverAudioTracks, setServerAudioTracks] = useState<any[]>([]);
    const [activeFileParams, setActiveFileParams] = useState<{ infoHash: string, fileIndex: number } | null>(null);
    const [isTranscoding, setIsTranscoding] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [autoplayBlocked, setAutoplayBlocked] = useState(false);

    const clientRef = useRef<any>(null);
    const torrentRef = useRef<any>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const lastGatewayPlaybackReportRef = useRef<number>(0);
    const lastHistorySaveRef = useRef<number>(0);
    const seekCommitTimeoutRef = useRef<number | null>(null);
    const statsIntervalRef = useRef<number | null>(null);
    const statsPollingFailureCountRef = useRef<number>(0);
    const activeMagnetRef = useRef<string | null>(null);
    const gatewayRetryTimeoutRef = useRef<number | null>(null);
    const gatewayRetryCountRef = useRef<number>(0);
    const gatewayAttemptIdRef = useRef<number>(0);
    const gatewayConnectInFlightRef = useRef<boolean>(false);
    const onReadyRef = useRef<TorrentPlayerProps['onReady']>(onReady);
    const onProgressRef = useRef<TorrentPlayerProps['onProgress']>(onProgress);
    const saveHistoryRef = useRef<() => Promise<void>>(async () => {});
    const reportGatewayPlaybackRef = useRef<(force?: boolean) => Promise<void>>(async () => {});
    const currentTimeRef = useRef<number>(0);
    const bufferingTimeoutRef = useRef<number | null>(null);
    const lastPlaybackAdvanceRef = useRef<number>(Date.now());
    const lastObservedTimeRef = useRef<number>(0);
    const statusRef = useRef<'CONNECTING' | 'BUFFERING' | 'PLAYING' | 'ERROR'>('CONNECTING');
    const reconnectPlaybackRef = useRef<((mode?: RecoveryMode) => void) | null>(null);
    const pendingResumeTimeRef = useRef<number>(0);
    const autoReconnectUsedRef = useRef<boolean>(false);

    useEffect(() => {
        onReadyRef.current = onReady;
    }, [onReady]);

    useEffect(() => {
        onProgressRef.current = onProgress;
    }, [onProgress]);

    useEffect(() => {
        statusRef.current = status;
    }, [status]);

    useEffect(() => {
        currentTimeRef.current = currentTime;
    }, [currentTime]);

    const clearBufferingTimeout = useCallback(() => {
        if (bufferingTimeoutRef.current) {
            window.clearTimeout(bufferingTimeoutRef.current);
            bufferingTimeoutRef.current = null;
        }
    }, []);

    const raisePlaybackError = useCallback(() => {
        clearBufferingTimeout();
        setErrorNoticeDismissed(false);
        setStatus('ERROR');

        const video = videoRef.current;
        const resumeTime = video?.currentTime || currentTimeRef.current || 0;
        const canAutoReconnect =
            resumeTime > 5 &&
            !autoReconnectUsedRef.current &&
            !!reconnectPlaybackRef.current;

        if (canAutoReconnect) {
            autoReconnectUsedRef.current = true;
            pendingResumeTimeRef.current = resumeTime;
            setRecoveryMode('auto');
            window.setTimeout(() => {
                reconnectPlaybackRef.current?.('auto');
            }, 250);
        }
    }, [clearBufferingTimeout]);

    const markPlaybackResumed = useCallback(() => {
        lastPlaybackAdvanceRef.current = Date.now();
        clearBufferingTimeout();
        setStatus('PLAYING');
        setErrorNoticeDismissed(false);
        setAutoplayBlocked(false);
        setRecoveryMode('idle');
        if (pendingResumeTimeRef.current > 0) {
            pendingResumeTimeRef.current = 0;
        }
    }, [clearBufferingTimeout]);

    const queueBufferingState = useCallback(() => {
        clearBufferingTimeout();
        bufferingTimeoutRef.current = window.setTimeout(() => {
            const video = videoRef.current;
            if (!video || video.ended || document.fullscreenElement === video) return;

            const stalledFor = Date.now() - lastPlaybackAdvanceRef.current;
            const actuallyStalled =
                video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA ||
                stalledFor > 1600;

            if (actuallyStalled && !video.paused) {
                setStatus('BUFFERING');
            }
            bufferingTimeoutRef.current = null;
        }, 900);
    }, [clearBufferingTimeout]);

    const clearStatsPolling = useCallback(() => {
        if (statsIntervalRef.current) {
            window.clearInterval(statsIntervalRef.current);
            statsIntervalRef.current = null;
        }
        statsPollingFailureCountRef.current = 0;
    }, []);

    const clearGatewayRetry = useCallback(() => {
        if (gatewayRetryTimeoutRef.current) {
            window.clearTimeout(gatewayRetryTimeoutRef.current);
            gatewayRetryTimeoutRef.current = null;
        }
    }, []);

    const needsCompatibleGatewayStream = useCallback((fileName?: string) => {
        const name = String(fileName || '').toLowerCase();
        if (!name) return false;
        return /x265|hevc|10bit|2160p|4k/.test(name) || name.endsWith('.mkv');
    }, []);

    // --- GATEWAY HEALTH CHECK ---
    useEffect(() => {
        const checkGateway = async () => {
            try {
                const res = await fetch(`${GATEWAY_URL}/health`);
                if (!res.ok) console.warn('⚠️ Gateway check failed:', res.status);
                else console.log('✅ Gateway HTTP está online');
            } catch (e) {
                console.warn('⚠️ Gateway offline.');
            }
        };
        checkGateway();
    }, []);

    // --- SOCKET.IO CHAT ---
    useEffect(() => {
        const socket = io(BACKEND_URL);
        socketRef.current = socket;

        socket.emit('join_room', videoId);

        socket.on('receive_message', (msg: ChatMessage) => {
            setMessages(prev => [...prev.slice(-50), msg]);
        });

        return () => { socket.disconnect(); };
    }, [videoId]);

    const sendMessage = () => {
        if (!messageInput.trim() || !socketRef.current) return;
        socketRef.current.emit('send_message', {
            videoId,
            text: messageInput,
            user: userName
        });
        setMessageInput('');
    };

    // --- PLAYBACK HISTORY (API) ---
    const loadHistory = useCallback(async () => {
        if (!user || !videoRef.current) return;

        try {
            const res = await fetch(`${BACKEND_URL}/api/v1/videos/${videoId}/history?userId=${user.id}`);
            const data = await res.json();
            if (data.lastTime > 0 && videoRef.current) {
                console.log(`🕒 Retomando de ${data.lastTime}s`);
                videoRef.current.currentTime = data.lastTime;
            }
        } catch (e) { console.error('History load error', e); }
    }, [videoId, user]);

    const saveHistory = useCallback(async () => {
        if (!user || !videoRef.current || videoRef.current.currentTime < 5) return;

        try {
            const currentTime = videoRef.current.currentTime;
            const roundedTime = Math.floor(currentTime);
            if (roundedTime === lastHistorySaveRef.current) return;

            const resumeTime = currentTime >= 600
                ? Math.max(0, currentTime - 300)
                : currentTime;

            await fetch(`${BACKEND_URL}/api/v1/videos/${videoId}/history`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, lastTime: resumeTime })
            });

            lastHistorySaveRef.current = roundedTime;
        } catch (e) { }
    }, [videoId, user]);

    const reportGatewayPlayback = useCallback(async (force = false) => {
        if (streamMode !== 'gateway' || !activeFileParams || !videoRef.current) return;

        const now = Date.now();
        if (!force && now - lastGatewayPlaybackReportRef.current < 15000) return;

        lastGatewayPlaybackReportRef.current = now;

        try {
            await fetch(`${GATEWAY_URL}/api/torrent/${activeFileParams.infoHash}/session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentTime: videoRef.current.currentTime || 0 })
            });
        } catch (error) {
            console.warn('Falha ao reportar sessao de playback ao gateway:', error);
        }
    }, [activeFileParams, streamMode]);

    useEffect(() => {
        saveHistoryRef.current = saveHistory;
    }, [saveHistory]);

    useEffect(() => {
        reportGatewayPlaybackRef.current = reportGatewayPlayback;
    }, [reportGatewayPlayback]);

    // --- HELPERS ---
    const getSafeURL = (file: any): Promise<string> => {
        return new Promise((resolve, reject) => {
            // Método 1: getBlobURL (callback)
            if (typeof file.getBlobURL === 'function') {
                file.getBlobURL((err: any, url: string) => err ? reject(err) : resolve(url));
            }
            // Método 2: streamTo blob
            else if (typeof file.streamTo === 'function') {
                try {
                    const chunks: Uint8Array[] = [];
                    const stream = file.createReadStream();

                    stream.on('data', (chunk: Uint8Array) => chunks.push(chunk));
                    stream.on('end', () => {
                        const blob = new Blob(chunks as any[], { type: 'application/octet-stream' });
                        resolve(URL.createObjectURL(blob));
                    });
                    stream.on('error', reject);
                } catch (e) {
                    reject(e);
                }
            }
            // Método 3: Blob direto (fallback)
            else if (file.blob) {
                resolve(URL.createObjectURL(file.blob));
            }
            // Método 4: createReadStream + Blob
            else if (typeof file.createReadStream === 'function') {
                try {
                    const chunks: Uint8Array[] = [];
                    const stream = file.createReadStream();

                    stream.on('data', (chunk: Uint8Array) => chunks.push(chunk));
                    stream.on('end', () => {
                        const blob = new Blob(chunks as any[]);
                        resolve(URL.createObjectURL(blob));
                    });
                    stream.on('error', reject);
                } catch (e) {
                    reject(e);
                }
            }
            else {
                reject(new Error('Método de extração de URL não encontrado no arquivo.'));
            }
        });
    };

    // --- LEGENDA (SRT -> VTT) ---
    const switchSubtitle = useCallback(async (subFile: any) => {
        if (!videoRef.current) return;

        // Limpar tracks existentes
        const tracks = videoRef.current.querySelectorAll('track');
        tracks.forEach(t => t.remove());

        try {
            const url = await getSafeURL(subFile);
            const track = document.createElement('track');
            track.kind = 'subtitles';
            track.label = subFile.name;
            track.srclang = 'pt';
            track.src = url;
            track.default = true;
            videoRef.current?.appendChild(track);
            console.log(`🎬 Legenda ativada: ${subFile.name}`);
        } catch (err) {
            console.error("Erro ao carregar legenda:", err);
        }
    }, []);

    const loadSubtitles = useCallback(async (torrent: any) => {
        if (!torrent || !torrent.files) return;
        const subFiles = torrent.files.filter((f: any) => f.name.match(/\.(srt|vtt)$/i));
        setSubtitleList(subFiles);

        if (subFiles.length > 0) {
            // 🇧🇷 Priorizar PT-BR
            const ptSub = subFiles.find((f: any) =>
                f.name.toLowerCase().includes('pt') ||
                f.name.toLowerCase().includes('portug') ||
                f.name.toLowerCase().includes('brazil')
            );
            switchSubtitle(ptSub || subFiles[0]);
        }
    }, [switchSubtitle]);

    // --- FAIXAS DE ÁUDIO ---
    const switchAudioTrack = useCallback((trackIndex: number) => {
        // Modo Gateway com Transcoding (Server-side)
        if (streamMode === 'gateway' && serverAudioTracks.length > 0 && activeFileParams) {
            console.log(`🔄 Trocando para áudio server-side #${trackIndex}`);
            setIsTranscoding(true);
            const { infoHash, fileIndex } = activeFileParams;
            const newUrl = `${GATEWAY_URL}/api/stream/${infoHash}/${fileIndex}?audioIndex=${trackIndex}`;

            if (videoRef.current) {
                const currentTime = videoRef.current.currentTime;
                videoRef.current.src = newUrl;
                videoRef.current.load();
                videoRef.current.currentTime = currentTime;
                videoRef.current.play();
            }

            setCurrentAudioTrack(trackIndex);
            setTimeout(() => setIsTranscoding(false), 1000);
            return;
        }

        // Modo Nativo (Browser/P2P)
        if (!videoRef.current) return;
        const video = videoRef.current;
        const audioTrackList = (video as any).audioTracks;

        if (audioTrackList && audioTrackList.length > trackIndex) {
            // Desabilitar todas as faixas
            for (let i = 0; i < audioTrackList.length; i++) {
                audioTrackList[i].enabled = false;
            }

            // Habilitar a faixa selecionada
            audioTrackList[trackIndex].enabled = true;
            setCurrentAudioTrack(trackIndex);

            // Desabilitar áudio externo se estava ativo
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.volume = 0;
            }
            setCurrentExternalAudio(-1);

            console.log(`🎵 Áudio trocado para: ${audioTrackList[trackIndex].label || `Faixa ${trackIndex + 1}`}`);
        }
    }, [streamMode, serverAudioTracks, activeFileParams]);

    const switchExternalAudio = useCallback(async (audioIndex: number) => {
        if (!videoRef.current) return;

        const video = videoRef.current;
        const audioFile = externalAudioFiles[audioIndex];

        if (!audioFile) return;

        try {
            // Mutar áudio do vídeo
            video.muted = true;

            // Criar ou reutilizar elemento de áudio
            if (!audioRef.current) {
                audioRef.current = new Audio();
                audioRef.current.volume = 1;
            }

            const audioElement = audioRef.current;

            // Obter URL do arquivo de áudio
            const audioUrl = await getSafeURL(audioFile.file);
            audioElement.src = audioUrl;

            // Sincronizar com o vídeo
            const syncAudio = () => {
                if (Math.abs(audioElement.currentTime - video.currentTime) > 0.3) {
                    audioElement.currentTime = video.currentTime;
                }
            };

            // Event listeners para sincronização
            video.addEventListener('play', () => audioElement.play());
            video.addEventListener('pause', () => audioElement.pause());
            video.addEventListener('seeked', syncAudio);
            video.addEventListener('timeupdate', syncAudio);

            // Iniciar áudio
            audioElement.currentTime = video.currentTime;
            if (!video.paused) {
                await audioElement.play();
            }

            setCurrentExternalAudio(audioIndex);
            setCurrentAudioTrack(-1);

            console.log(`🎵 Áudio externo ativado: ${audioFile.label}`);
        } catch (error) {
            console.error('Erro ao trocar áudio externo:', error);
        }
    }, [externalAudioFiles]);

    const detectAudioTracks = useCallback(() => {
        if (!videoRef.current) return;

        // Se já temos faixas do servidor (Gateway Mode), não sobrescrever com nativas
        if (streamMode === 'gateway' && serverAudioTracks.length > 0) {
            return;
        }

        const video = videoRef.current;

        // Aguardar metadata carregar
        const onLoadedMetadata = () => {
            const audioTrackList = (video as any).audioTracks;

            if (audioTrackList && audioTrackList.length > 0) {
                const tracks = [];
                let ptTrackIndex = -1;

                for (let i = 0; i < audioTrackList.length; i++) {
                    const track = audioTrackList[i];
                    const label = track.label || `Áudio ${i + 1}`;
                    const language = track.language || 'unknown';

                    tracks.push({
                        id: track.id,
                        label: label,
                        language: language,
                        enabled: track.enabled
                    });

                    // 🇧🇷 Auto-detect PT-BR
                    const isPT = label.toLowerCase().includes('pt') ||
                        label.toLowerCase().includes('portug') ||
                        label.toLowerCase().includes('dublado') ||
                        language.toLowerCase().includes('pt');

                    if (isPT && ptTrackIndex === -1) {
                        ptTrackIndex = i;
                    }
                }
                setAudioTracks(tracks);
                console.log('🎵 Faixas de áudio detectadas:', tracks);

                // Selecionar PT-BR automaticamente se encontrado
                if (ptTrackIndex !== -1 && ptTrackIndex !== 0) {
                    console.log(`🇧🇷 PT-BR detectado na faixa interna ${ptTrackIndex}, trocando...`);
                    switchAudioTrack(ptTrackIndex);
                }
            } else {
                console.log('ℹ️ Nenhuma faixa de áudio adicional detectada via API nativa');
            }
        };

        if (video.readyState >= 1) {
            onLoadedMetadata();
        } else {
            video.addEventListener('loadedmetadata', onLoadedMetadata);
        }

        return () => {
            video.removeEventListener('loadedmetadata', onLoadedMetadata);
        };
    }, [switchAudioTrack]);

    // Detectar arquivos de áudio externos no torrent
    const detectExternalAudio = useCallback((files: any[]) => {
        const audioFiles = files.filter((f: any) =>
            f.name.match(/\.(mp3|aac|ac3|dts|flac|ogg|opus|m4a)$/i)
        );

        if (audioFiles.length > 0) {
            const audioList = audioFiles.map((f: any, i: number) => ({
                file: f,
                label: f.name.replace(/\.[^/.]+$/, ''),
                language: detectLanguageFromFilename(f.name),
                index: i
            }));
            setExternalAudioFiles(audioList);
            console.log('🎵 Arquivos de áudio externos encontrados:', audioList);

            // 🇧🇷 Auto-detectar e selecionar PT-BR externo
            const ptIndex = audioList.findIndex(a => a.language === 'pt-BR' || a.label.toLowerCase().includes('dublado'));
            if (ptIndex !== -1) {
                console.log(`🇧🇷 Áudio externo PT-BR detectado (${audioList[ptIndex].label}), ativando...`);
                setTimeout(() => switchExternalAudio(ptIndex), 1000); // Pequeno delay para garantir que o vídeo já carregou
            }
        }
    }, [switchExternalAudio]);

    // Detectar idioma pelo nome do arquivo
    const detectLanguageFromFilename = (filename: string): string => {
        const lower = filename.toLowerCase();
        if (lower.includes('portuguese') || lower.includes('pt-br') || lower.includes('ptbr')) return 'pt-BR';
        if (lower.includes('english') || lower.includes('eng') || lower.includes('en-')) return 'en';
        if (lower.includes('spanish') || lower.includes('esp') || lower.includes('es-')) return 'es';
        if (lower.includes('french') || lower.includes('fra') || lower.includes('fr-')) return 'fr';
        if (lower.includes('german') || lower.includes('deu') || lower.includes('de-')) return 'de';
        if (lower.includes('italian') || lower.includes('ita') || lower.includes('it-')) return 'it';
        if (lower.includes('japanese') || lower.includes('jpn') || lower.includes('ja-')) return 'ja';
        return 'unknown';
    };

    // Restaurar áudio original do vídeo
    const restoreOriginalAudio = useCallback(() => {
        if (!videoRef.current) return;

        // Se estava em transcoding (Gateway), recarregar stream original
        if (isTranscoding && activeFileParams) {
            console.log('🔄 Restaurando stream original (sem transcoding)...');
            const { infoHash, fileIndex } = activeFileParams;
            const originalUrl = `${GATEWAY_URL}/api/stream/${infoHash}/${fileIndex}`;

            const currentTime = videoRef.current.currentTime;
            videoRef.current.src = originalUrl;
            videoRef.current.load();
            videoRef.current.currentTime = currentTime;
            videoRef.current.play();
            setIsTranscoding(false);
        }

        videoRef.current.muted = false;

        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.volume = 0;
        }

        setCurrentExternalAudio(-1);
        setCurrentAudioTrack(-1); // -1 indica nenhum específico selecionado (Padrão)

        console.log('🎵 Áudio original restaurado');
    }, [isTranscoding, activeFileParams]);

    // Detectar faixas quando vídeo carregar
    useEffect(() => {
        if (status === 'PLAYING') {
            detectAudioTracks();
        }
    }, [status, detectAudioTracks]);

    const togglePlayPause = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;

        if (video.paused) {
            video.play().catch((error) => console.warn('Falha ao retomar vídeo:', error));
        } else {
            video.pause();
        }
    }, []);

    const toggleMute = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;

        const nextMuted = !video.muted;
        video.muted = nextMuted;
        setIsMuted(nextMuted);
    }, []);

    const toggleFullscreen = useCallback(async () => {
        const container = containerRef.current as HTMLDivElement & {
            webkitRequestFullscreen?: () => Promise<void> | void;
        };
        const video = videoRef.current as HTMLVideoElement & {
            webkitEnterFullscreen?: () => void;
        };
        if (!container) return;

        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
                setIsFullscreen(false);
            } else {
                if (container.requestFullscreen) {
                    await container.requestFullscreen();
                    setIsFullscreen(true);
                    return;
                }
                if (container.webkitRequestFullscreen) {
                    await container.webkitRequestFullscreen();
                    setIsFullscreen(true);
                    return;
                }
                if (video?.webkitEnterFullscreen) {
                    video.webkitEnterFullscreen();
                }
            }
        } catch (error) {
            console.warn('Falha ao alternar tela cheia:', error);
        }
    }, []);

    const handleLocalSubtitle = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !videoRef.current) return;

        const url = URL.createObjectURL(file);
        const tracks = videoRef.current.querySelectorAll('track');
        tracks.forEach(t => t.remove());

        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.label = file.name.replace(/\.[^/.]+$/, "");
        track.srclang = 'auto';
        track.src = url;
        track.default = true;
        videoRef.current.appendChild(track);
        console.log(`📂 Legenda local carregada: ${file.name}`);
    };

    // --- DOWNLOAD OFFLINE ---
    const downloadVideo = useCallback(() => {
        if (streamMode === 'gateway' && fileList.length > 0) {
            const videoFile = fileList.find((f: any) => f.name.match(/\.(mp4|mkv|webm|avi)$/i));
            if (videoFile) {
                window.open(`${GATEWAY_URL}${videoFile.streamUrl}`, '_blank');
                return;
            }
        }

        if (!torrentRef.current) return;
        const videoFile = torrentRef.current.files.find((f: any) => f.name.match(/\.(mp4|mkv|webm|avi)$/i));
        if (videoFile) {
            console.log(`📥 Iniciando download para salvar localmente: ${videoFile.name}`);
            getSafeURL(videoFile).then(url => {
                const a = document.createElement('a');
                a.href = url;
                a.download = videoFile.name;
                a.click();
            }).catch(err => console.error("Erro no download:", err));
        }
    }, [streamMode, fileList]);

    // --- STREAM ENGINE ---
    const setupVideo = useCallback((url: string) => {
        if (videoRef.current) {
            if (videoRef.current.src === url) return;

            console.log(`🎬 Configurando stream: ${url.substring(0, 50)}...`);
            videoRef.current.autoplay = true;
            videoRef.current.playsInline = true;
            videoRef.current.preload = 'metadata';
            videoRef.current.src = url;
            videoRef.current.load();
            loadHistory();
            videoRef.current.play().catch(e => {
                if (e.name !== 'AbortError') {
                    console.warn('Autoplay blocked:', e);
                    setAutoplayBlocked(true);
                    setStatus('BUFFERING');
                }
            });
            markPlaybackResumed();
            onReadyRef.current?.();
        }
    }, [loadHistory, markPlaybackResumed]);

    const handleManualPlay = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;

        video.play()
            .then(() => {
                markPlaybackResumed();
            })
            .catch((error) => {
                console.warn('Falha ao iniciar playback manual:', error);
            });
    }, [markPlaybackResumed]);

    const tryGateway = useCallback(async (attemptId: number) => {
        if (gatewayConnectInFlightRef.current) {
            return false;
        }

        gatewayConnectInFlightRef.current = true;
        try {
            console.log('🌐 Tentando Gateway HTTP...');
            setStreamMode('gateway');
            setStatus('CONNECTING');

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

            const res = await fetch(`${GATEWAY_URL}/api/torrent/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ magnetURI }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (gatewayAttemptIdRef.current !== attemptId || activeMagnetRef.current !== magnetURI) {
                return false;
            }

            if (!res.ok) {
                console.warn(`Gateway retornou status ${res.status}`);
                throw new Error(`Gateway HTTP ${res.status}`);
            }

            const torrentInfo = await res.json();
            console.log('✅ Gateway conectado:', torrentInfo.name);

            setStreamMode('gateway');
            const files = torrentInfo.files || [];
            console.log('📂 Arquivos no Torrent (Gateway):', files.map((f: any) => f.name));

            let videoFile = files.find((f: any) => f.name.match(/\.(mp4|mkv|webm|avi)$/i));

            // Fallback: Maior arquivo
            if (!videoFile && files.length > 0) {
                videoFile = files.reduce((prev: any, current: any) => (prev.length > current.length) ? prev : current);
                console.warn(`⚠️ Vídeo detectado por tamanho (fallback): ${videoFile.name}`);
            }

            if (videoFile) {
                setFileList(files);
                setFileName(videoFile.name);
                setActiveFileParams({ infoHash: torrentInfo.infoHash, fileIndex: videoFile.index });
                gatewayRetryCountRef.current = 0;
                clearGatewayRetry();

                // Buscar metadados avançados do servidor (Audio Tracks)
                fetch(`${GATEWAY_URL}/api/metadata/${torrentInfo.infoHash}/${videoFile.index}`)
                    .then(r => r.json())
                    .then(meta => {
                        if (meta.audioTracks && meta.audioTracks.length > 0) {
                            console.log('🎧 Faixas de áudio do servidor:', meta.audioTracks);
                            // Normalizar formato
                            const tracks = meta.audioTracks.map((t: any) => ({
                                id: `server-${t.index}`,
                                label: t.title || `Track ${t.streamIndex + 1} (${t.language})`,
                                language: t.language,
                                index: t.streamIndex
                            }));
                            setServerAudioTracks(tracks);
                            setAudioTracks(tracks); // Usar state unificado para UI

                            // Auto-select PT-BR (melhorado)
                            const ptTrack = tracks.find((t: any) => {
                                const lang = t.language?.toLowerCase() || '';
                                const label = t.label?.toLowerCase() || '';
                                return lang.includes('por') ||
                                    lang === 'pt' ||
                                    lang === 'pt-br' ||
                                    label.includes('portugu') ||
                                    label.includes('pt-br') ||
                                    label.includes('dublado');
                            });

                            if (ptTrack && ptTrack.index !== 0) {
                                console.log('🇧🇷 Trocando automaticamente para áudio em PT-BR (Server-side):', ptTrack.label);
                                setTimeout(() => switchAudioTrack(ptTrack.index), 1000);
                            }
                        }
                    })
                    .catch(e => console.warn('Falha ao buscar metadados do servidor', e));

                detectExternalAudio(files); // Detectar áudios externos
                const streamPath = needsCompatibleGatewayStream(videoFile.name)
                    ? `${GATEWAY_URL}/api/stream-compatible/${torrentInfo.infoHash}/${videoFile.index}`
                    : `${GATEWAY_URL}${videoFile.streamUrl}`;

                if (streamPath.includes('/api/stream-compatible/')) {
                    console.log('🛡️ Usando stream compatível para navegador:', videoFile.name);
                }

                setupVideo(streamPath);

                // Polling stats from gateway
                clearStatsPolling();
                statsPollingFailureCountRef.current = 0;
                statsIntervalRef.current = window.setInterval(async () => {
                    try {
                        const sRes = await fetch(`${GATEWAY_URL}/api/torrent/${torrentInfo.infoHash}`);
                        if (!sRes.ok) {
                            const error = new Error(`Stats failed: ${sRes.status}`);
                            (error as Error & { status?: number }).status = sRes.status;
                            throw error;
                        }

                        const sData = await sRes.json();
                        statsPollingFailureCountRef.current = 0;
                        setProgress(sData.progress);
                        setDownloadSpeed(sData.downloadSpeed);
                        setPeers(sData.numPeers);
                        setDownloaded(sData.downloaded || 0);
                        setUploaded(sData.uploaded || 0);

                        onProgressRef.current?.({ progress: sData.progress, downloadSpeed: sData.downloadSpeed, peers: sData.numPeers, status: 'PLAYING' });
                    } catch (e) {
                        const statusCode = typeof e === 'object' && e && 'status' in e ? Number((e as any).status) : 0;
                        const video = videoRef.current;
                        const isVideoAlive = !!video?.src && (!video.paused || (video.currentTime || 0) > 0 || autoplayBlocked);
                        const isTransient404 = statusCode === 404 && isVideoAlive;

                        if (isTransient404 && statsPollingFailureCountRef.current < 5) {
                            statsPollingFailureCountRef.current += 1;
                            console.warn(`Stats polling 404 transitório (${statsPollingFailureCountRef.current}/5), mantendo sessão viva.`);
                            void reportGatewayPlaybackRef.current(true);
                            return;
                        }

                        console.warn('Stats polling falhou, limpando interval');
                        clearStatsPolling();
                    }
                }, 2000);

                return true;
            } else {
                console.warn('Nenhum arquivo de vídeo encontrado no torrent');
                return false;
            }
        } catch (e: any) {
            if (e.name === 'AbortError') {
                console.log('⏱️ Gateway timeout.');
            } else {
                console.log('⚠️ Gateway falhou:', e.message);
            }
        } finally {
            gatewayConnectInFlightRef.current = false;
        }
        return false;
    }, [clearGatewayRetry, clearStatsPolling, magnetURI, setupVideo]);

    const useP2P = useCallback(() => {
        console.warn('P2P direto no navegador foi desativado para evitar download integral em background.');
        raisePlaybackError();
        return;

        setStreamMode('p2p');
        const client = new WebTorrent();
        clientRef.current = client;

        const trackers = [
            'wss://tracker.btorrent.xyz',
            'wss://tracker.openwebtorrent.com',
            'wss://tracker.fastcast.nz',
            'udp://tracker.opentrackr.org:1337/announce',
            'udp://tracker.leechers-paradise.org:6969/announce'
        ];

        client.add(magnetURI, { announce: trackers }, (torrent: any) => {
            torrentRef.current = torrent;
            const files = torrent.files || [];
            setFileList(files);
            detectExternalAudio(files); // Detectar áudios externos
            loadSubtitles(torrent);

            console.log('📂 Arquivos no Torrent (P2P):', files.map((f: any) => f.name));

            let videoFile = files.find((f: any) => f.name.match(/\.(mp4|mkv|webm|avi)$/i));

            // Fallback: Maior arquivo
            if (!videoFile && files.length > 0) {
                videoFile = files.reduce((prev: any, current: any) => (prev.length > current.length) ? prev : current);
                console.warn(`⚠️ Vídeo detectado por tamanho (fallback P2P): ${videoFile.name}`);
            }

            if (videoFile) {
                setFileName(videoFile.name);

                // Usar getSafeURL para streaming direto no elemento video
                getSafeURL(videoFile).then(url => {
                    setupVideo(url);
                }).catch(err => {
                    console.error("Erro ao gerar URL do vídeo P2P:", err);
                    raisePlaybackError();
                });

                const interval = setInterval(() => {
                    if (torrent.destroyed) return clearInterval(interval);
                    const p = Math.round(torrent.progress * 100);
                    setProgress(p);
                    setDownloadSpeed(torrent.downloadSpeed);
                    setPeers(torrent.numPeers);
                    setDownloaded(torrent.downloaded);
                    setUploaded(torrent.uploaded);

                    // Update bitfield
                    if (torrent.bitfield) {
                        const bits: boolean[] = [];
                        for (let i = 0; i < torrent.pieces.length; i++) {
                            bits.push(torrent.pieces[i] ? !!torrent.pieces[i].verified : false);
                        }
                        setBitfield(bits);
                    }

                    onProgressRef.current?.({ progress: p, downloadSpeed: torrent.downloadSpeed, peers: torrent.numPeers, status: 'PLAYING' });
                }, 2000);
            } else {
                console.error('❌ Nenhum arquivo encontrado no torrent');
                raisePlaybackError();
            }
        });
    }, [loadSubtitles, magnetURI, raisePlaybackError, setupVideo]);

    const reconnectPlayback = useCallback((mode: RecoveryMode = 'manual') => {
        const nextAttemptId = gatewayAttemptIdRef.current + 1;
        gatewayAttemptIdRef.current = nextAttemptId;
        gatewayRetryCountRef.current = 0;
        gatewayConnectInFlightRef.current = false;
        clearGatewayRetry();
        clearBufferingTimeout();
        clearStatsPolling();
        setErrorNoticeDismissed(false);
        setAutoplayBlocked(false);
        setRecoveryMode(mode);
        setStatus('CONNECTING');
        setStreamMode('connecting');

        const video = videoRef.current;
        pendingResumeTimeRef.current = video?.currentTime || currentTimeRef.current || pendingResumeTimeRef.current || 0;
        if (video) {
            video.pause();
            video.removeAttribute('src');
            video.load();
        }

        const runReconnectAttempt = async () => {
            const worked = await tryGateway(nextAttemptId);
            if (worked) return;
            if (activeMagnetRef.current !== magnetURI || gatewayAttemptIdRef.current !== nextAttemptId) return;

            gatewayRetryCountRef.current += 1;
            const attempts = gatewayRetryCountRef.current;
            if (attempts >= 3) {
                useP2P();
                return;
            }

            const delay = Math.min(1500 * (2 ** (attempts - 1)), 6000);
            gatewayRetryTimeoutRef.current = window.setTimeout(() => {
                if (activeMagnetRef.current !== magnetURI || gatewayAttemptIdRef.current !== nextAttemptId) return;
                void runReconnectAttempt();
            }, delay);
        };

        void runReconnectAttempt();
    }, [clearBufferingTimeout, clearGatewayRetry, clearStatsPolling, magnetURI, tryGateway, useP2P]);

    useEffect(() => {
        reconnectPlaybackRef.current = reconnectPlayback;
    }, [reconnectPlayback]);

    useEffect(() => {
        if (!magnetURI) return;
        if (activeMagnetRef.current === magnetURI) return;

        activeMagnetRef.current = magnetURI;
        gatewayAttemptIdRef.current += 1;
        gatewayRetryCountRef.current = 0;
        gatewayConnectInFlightRef.current = false;
        autoReconnectUsedRef.current = false;
        pendingResumeTimeRef.current = 0;
        setRecoveryMode('idle');
        clearGatewayRetry();
        setStatus('CONNECTING');
        setStreamMode('connecting');

        const runGatewayAttempt = async () => {
            const attemptId = gatewayAttemptIdRef.current;
            const worked = await tryGateway(attemptId);
            if (worked) return;
            if (activeMagnetRef.current !== magnetURI || gatewayAttemptIdRef.current !== attemptId) return;

            gatewayRetryCountRef.current += 1;
            const attempts = gatewayRetryCountRef.current;
            if (attempts >= 3) {
                useP2P();
                return;
            }

            const delay = Math.min(1500 * (2 ** (attempts - 1)), 6000);
            gatewayRetryTimeoutRef.current = window.setTimeout(() => {
                if (activeMagnetRef.current !== magnetURI) return;
                void runGatewayAttempt();
            }, delay);
        };

        void runGatewayAttempt();
        return () => {
            gatewayAttemptIdRef.current += 1;
            gatewayRetryCountRef.current = 0;
            gatewayConnectInFlightRef.current = false;
            clearGatewayRetry();
            clearBufferingTimeout();
            clearStatsPolling();
            void saveHistoryRef.current();
            void reportGatewayPlaybackRef.current(true);
            clientRef.current?.destroy();
            activeMagnetRef.current = null;
        };
    }, [clearBufferingTimeout, clearGatewayRetry, clearStatsPolling, magnetURI, tryGateway, useP2P]);

    useEffect(() => {
        const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    useEffect(() => {
        const handleBeforeUnload = () => {
            void saveHistoryRef.current();
            void reportGatewayPlaybackRef.current(true);
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            clearGatewayRetry();
            clearBufferingTimeout();
            clearStatsPolling();
            if (seekCommitTimeoutRef.current) {
                window.clearTimeout(seekCommitTimeoutRef.current);
                seekCommitTimeoutRef.current = null;
            }
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [clearBufferingTimeout, clearStatsPolling, clearGatewayRetry]);

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatSpeed = (bytes: number) => {
        if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB/s';
        return (bytes / 1024).toFixed(0) + ' KB/s';
    };

    const formatTime = (seconds: number) => {
        if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const video = videoRef.current;
        if (!video || !duration) return;
        const ratio = Number(e.target.value) / 100;
        video.currentTime = Math.max(0, Math.min(duration, duration * ratio));

        if (seekCommitTimeoutRef.current) {
            window.clearTimeout(seekCommitTimeoutRef.current);
        }

        seekCommitTimeoutRef.current = window.setTimeout(() => {
            void saveHistory();
            void reportGatewayPlayback(true);
            seekCommitTimeoutRef.current = null;
        }, 350);
    };

    const isConnecting = status === 'CONNECTING';
    const hasRecentPlayback = currentTime > 0 && Date.now() - lastPlaybackAdvanceRef.current < 2200;
    const shouldShowCompactStatus =
        !autoplayBlocked &&
        hasRecentPlayback &&
        (recoveryMode !== 'idle' ||
            (status === 'BUFFERING' && Date.now() - lastPlaybackAdvanceRef.current > 1400));
    const shouldShowBlockingOverlay =
        !autoplayBlocked &&
        !shouldShowCompactStatus &&
        (status === 'CONNECTING' ||
            (status === 'BUFFERING' && Date.now() - lastPlaybackAdvanceRef.current > 1400));
    const shouldShowErrorOverlay = status === 'ERROR' && !hasRecentPlayback && !errorNoticeDismissed;
    const shouldShowRecoverableErrorBanner = status === 'ERROR' && hasRecentPlayback && !errorNoticeDismissed;
    const statusTitle = recoveryMode === 'auto'
        ? 'Reconectando automaticamente'
        : recoveryMode === 'manual'
            ? 'Reconectando o player'
            : isConnecting
                ? streamMode === 'gateway'
                    ? 'Conectando ao gateway'
                    : streamMode === 'p2p'
                        ? 'Conectando a swarm'
                        : 'Inicializando conexao'
                : 'Preparando a reproducao';
    const statusDescription = recoveryMode === 'auto'
        ? 'O player detectou uma oscilacao e esta tentando retomar o video sem sair da pagina.'
        : recoveryMode === 'manual'
            ? 'Refazendo o canal de streaming e tentando voltar do ponto mais recente.'
            : isConnecting
                ? streamMode === 'gateway'
                    ? 'Abrindo o canal de streaming para iniciar o video com mais estabilidade.'
                    : streamMode === 'p2p'
                        ? 'Sincronizando peers e distribuindo as primeiras partes do arquivo.'
                        : 'Analisando a melhor rota de entrega entre gateway e rede P2P.'
                : 'Ajustando o buffer para manter a leitura fluida.';

    return (
        <div
            ref={containerRef}
            className={`relative w-full bg-black flex flex-col md:flex-row overflow-hidden border-white/10 group shadow-2xl ${
                immersive
                    ? 'min-h-[100dvh] md:min-h-0 md:aspect-[16/9] md:rounded-3xl border-0 md:border'
                    : 'aspect-[16/9] min-h-[220px] sm:min-h-[260px] md:min-h-0 md:rounded-3xl border-y md:border'
            }`}
        >
            {/* ÁREA DO VÍDEO */}
            <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
                <video
                    ref={videoRef}
                    className="w-full h-full object-contain bg-black"
                    autoPlay
                    controls
                    playsInline
                    preload="metadata"
                    onTimeUpdate={() => {
                        const playbackTime = videoRef.current?.currentTime || 0;
                        if (playbackTime > lastObservedTimeRef.current + 0.15) {
                            lastObservedTimeRef.current = playbackTime;
                            markPlaybackResumed();
                        }

                        const time = Math.round(playbackTime);
                        setCurrentTime(playbackTime);
                        if (time > 0 && time % 10 === 0) saveHistory();
                        if (time > 0 && time % 15 === 0) reportGatewayPlayback();
                    }}
                    onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
                    onCanPlay={() => {
                        const video = videoRef.current;
                        if (!video) return;
                        video.play().catch((error) => {
                            if (error?.name !== 'AbortError') {
                                console.warn('Falha ao iniciar stream no canplay:', error);
                                setAutoplayBlocked(true);
                            }
                        });
                        if (!video.paused) {
                            markPlaybackResumed();
                        }
                    }}
                    onWaiting={() => queueBufferingState()}
                    onPlaying={() => {
                        markPlaybackResumed();
                    }}
                    onPause={() => {
                        const video = videoRef.current;
                        void saveHistory();
                        void reportGatewayPlayback(true);
                        if (video && !video.ended && !video.paused) {
                            queueBufferingState();
                        } else {
                            clearBufferingTimeout();
                        }
                    }}
                    onEnded={() => {
                        clearBufferingTimeout();
                        void saveHistory();
                        void reportGatewayPlayback(true);
                    }}
                />

                {autoplayBlocked && (
                    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 backdrop-blur-sm p-6">
                        <button
                            onClick={handleManualPlay}
                            className="flex flex-col items-center gap-3 rounded-3xl border border-white/10 bg-white/10 px-6 py-5 text-white shadow-2xl transition-all active:scale-95"
                        >
                            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-black">
                                <Play size={24} className="ml-1 fill-black" />
                            </div>
                            <div className="text-center">
                                <p className="text-xs font-black uppercase tracking-[0.2em]">Toque para reproduzir</p>
                                <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/55">
                                    O navegador do celular bloqueou o autoplay.
                                </p>
                            </div>
                        </button>
                    </div>
                )}

                {/* Swarm Visualizer Overlay */}
                <div className="absolute top-3 left-3 md:top-6 md:left-6 z-30 pointer-events-none flex flex-col gap-2 scale-[0.68] sm:scale-75 md:scale-100 origin-top-left">
                    <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/5">
                        <Activity size={14} className="text-primary animate-pulse" />
                        <span className="text-[10px] font-black tracking-widest text-white uppercase italic">Swarm Activity</span>
                    </div>
                    <div className="flex items-end gap-0.5 h-12 bg-black/40 backdrop-blur-md p-2 rounded-xl border border-white/5">
                        {[4, 7, 2, 8, 5, 9, 3, 6, 8, 4, 1, 9].map((h, i) => (
                            <motion.div
                                key={i}
                                initial={{ height: 0 }}
                                animate={{ height: `${peers > 0 ? (h / 10) * 100 : 10}%` }}
                                transition={{
                                    repeat: Infinity,
                                    duration: 0.5 + (i * 0.1),
                                    repeatType: 'mirror'
                                }}
                                className="w-1 bg-primary/40 rounded-full"
                            />
                        ))}
                    </div>
                </div>

                {/* Bitfield Stripes (Bottom of Video) */}
                {bitfield.length > 0 && (
                    <div className="absolute bottom-0 left-0 w-full h-1 flex gap-[1px] pointer-events-none opacity-50">
                        {bitfield.map((done, i) => (
                            <div key={i} className={`flex-1 h-full transition-colors duration-500 ${done ? 'bg-primary shadow-[0_0_5px_rgba(0,217,255,0.8)]' : 'bg-gray-800'}`} />
                        ))}
                    </div>
                )}

                {shouldShowBlockingOverlay && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md z-20">
                        <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
                        <h2 className="text-white font-bold tracking-widest text-xs uppercase">{statusTitle}</h2>
                        <p className="mt-2 max-w-xs px-6 text-center text-[10px] text-white/45 uppercase tracking-[0.22em]">
                            {statusDescription}
                        </p>
                        <div className="mt-4 flex flex-col items-center gap-2">
                            <div className="flex gap-4 text-[10px] text-gray-400 font-mono">
                                <span className="flex items-center gap-1"><Wifi size={10} className="text-green-500" /> {peers} PEERS</span>
                                <span>{formatSpeed(downloadSpeed)}</span>
                                <span className="text-primary font-bold">{progress}%</span>
                            </div>
                            <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden">
                                <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
                            </div>
                            <div className="flex gap-4 text-[8px] text-gray-500 uppercase tracking-widest mt-1">
                                <span>Down: {formatBytes(downloaded)}</span>
                                <span>Up: {formatBytes(uploaded)}</span>
                            </div>
                        </div>
                    </div>
                )}

                {shouldShowCompactStatus && (
                    <div className="absolute left-3 right-3 top-[max(4.5rem,calc(env(safe-area-inset-top)+3.75rem))] sm:left-6 sm:right-6 sm:top-6 z-40">
                        <div className="mx-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-white/10 bg-black/72 px-3 py-3 text-white shadow-2xl backdrop-blur-xl">
                            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/8">
                                <Loader2 size={16} className="animate-spin text-primary" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white">
                                    {statusTitle}
                                </p>
                                <p className="mt-1 text-xs leading-relaxed text-white/70">
                                    {statusDescription}
                                </p>
                                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono text-white/55">
                                    <span>{streamMode === 'gateway' ? 'Gateway' : 'Sessao'} • {peers} peers</span>
                                    <span>{formatSpeed(downloadSpeed)}</span>
                                    <span className="text-primary">{progress}%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {shouldShowRecoverableErrorBanner && (
                    <div className="absolute left-3 right-3 top-[max(4.5rem,calc(env(safe-area-inset-top)+3.75rem))] sm:left-6 sm:right-6 sm:top-6 z-40">
                        <div className="rounded-2xl border border-amber-400/25 bg-black/78 backdrop-blur-xl shadow-2xl">
                            <div className="flex items-start gap-3 p-3 sm:p-4">
                                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/12 text-amber-400">
                                    <AlertTriangle size={18} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white">
                                        Conexao instavel
                                    </p>
                                    <p className="mt-1 text-xs leading-relaxed text-white/72">
                                        O video voltou, mas a conexao oscilou por um instante. Se travar de novo, reconecte.
                                    </p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <button
                                            onClick={() => reconnectPlayback('manual')}
                                            className="rounded-xl bg-white px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-black transition-all active:scale-95"
                                        >
                                            Reconectar
                                        </button>
                                        <button
                                            onClick={() => setErrorNoticeDismissed(true)}
                                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/80 transition-all active:scale-95"
                                        >
                                            Continuar assistindo
                                        </button>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setErrorNoticeDismissed(true)}
                                    className="rounded-xl p-2 text-white/50 transition hover:bg-white/5 hover:text-white"
                                    aria-label="Fechar aviso"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

{/* BOTÕES FLUTUANTES SUPERIORES */}
                <div className="absolute top-3 right-3 md:top-6 md:right-6 flex max-w-[calc(100%-1.5rem)] flex-wrap justify-end gap-1.5 sm:gap-2 opacity-90 md:opacity-60 hover:opacity-100 transition-opacity z-30 scale-[0.76] sm:scale-90 md:scale-100 origin-top-right">
                    <button
                        onClick={() => setShowFileList(!showFileList)}
                        className={`p-2.5 sm:p-3 md:p-2 rounded-2xl backdrop-blur-md border transition-all ${showFileList ? 'bg-primary border-primary text-black' : 'bg-black/40 border-white/10 text-white hover:bg-black/60'}`}
                        title="Arquivos do Torrent"
                    >
                        <List size={18} />
                    </button>
                    <button
                        onClick={downloadVideo}
                        className="p-2.5 sm:p-3 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 text-white hover:bg-primary hover:text-black transition-all"
                        title="Download Offline"
                    >
                        <Download size={18} />
                    </button>
                    <button
                        onClick={() => setShowChat(!showChat)}
                        className={`p-2.5 sm:p-3 rounded-2xl bg-black/40 backdrop-blur-md border transition-all ${showChat ? 'bg-primary border-primary text-black' : 'bg-black/40 border-white/10 text-white hover:bg-black/60'}`}
                        title="Live Chat"
                    >
                        <MessageSquare size={18} />
                    </button>
                    <button
                        onClick={() => setShowAudioMenu(!showAudioMenu)}
                        className={`p-2.5 sm:p-3 rounded-2xl backdrop-blur-md border transition-all ${showAudioMenu ? 'bg-green-500 border-green-500 text-black shadow-[0_0_25px_rgba(34,197,94,0.6)]' : 'bg-black/60 border-white/20 text-green-400 hover:bg-green-500/20 hover:border-green-500/50'}`}
                        title="Configurações de Áudio (Atalho: A)"
                    >
                        <div className="flex items-center gap-2">
                            <Headphones size={20} className={showAudioMenu ? 'animate-pulse' : ''} />
                            {(audioTracks.length > 1 || externalAudioFiles.length > 0) && (
                                <span className="text-[7px] font-black bg-green-500 text-black px-1 rounded-sm animate-pulse shadow-[0_0_5px_#22c55e]">
                                    {audioTracks.length + externalAudioFiles.length} CANAIS
                                </span>
                            )}
                        </div>
                    </button>
                    {user?.role === 'ADMIN' && (
                        <button
                            onClick={async () => {
                                if (window.confirm('🚨 ATENÇÃO: Deseja apagar permanentemente este torrent e todos os arquivos dele?')) {
                                    try {
                                        const res = await fetch(`${BACKEND_URL}/api/v1/videos/${videoId}`, { method: 'DELETE' });
                                        if (res.ok) {
                                            alert('Ativo removido com sucesso.');
                                            window.location.href = '/';
                                        } else {
                                            alert('Falha ao remover arquivo.');
                                        }
                                    } catch (e) {
                                        alert('Erro de conexão ao remover.');
                                    }
                                }
                            }}
                        className="p-2.5 sm:p-3 rounded-2xl bg-red-500/20 backdrop-blur-md border border-red-500/40 text-red-500 hover:bg-red-500 hover:text-white transition-all"
                            title="APAGAR DA REDE"
                        >
                            <Trash2 size={18} />
                        </button>
                    )}
                    <button
                        onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = '.srt,.vtt';
                            input.onchange = (e: any) => handleLocalSubtitle(e);
                            input.click();
                        }}
                        className="p-2.5 sm:p-3 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 text-white hover:bg-purple-600 hover:border-purple-500 transition-all"
                        title="Carregar Legenda"
                    >
                        <Subtitles size={18} />
                    </button>
                </div>

                {/* INDICADOR DE MODO (CANTO INFERIOR ESQUERDO) */}
                <div className="absolute bottom-[5.5rem] left-3 sm:left-6 z-30 flex flex-wrap items-center gap-2 pointer-events-none max-w-[calc(100%-1.5rem)] sm:max-w-none">
                    <div className={`px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-tighter flex items-center gap-1.5 ${streamMode === 'gateway' ? 'bg-blue-500 text-white' : 'bg-green-500 text-black'}`}>
                        {streamMode === 'gateway' ? <Server size={8} /> : <Globe size={8} />}
                        {streamMode} Mode
                    </div>
                    {status === 'ERROR' && (
                        <div className="bg-red-500 text-white px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-tighter flex items-center gap-1">
                            <AlertTriangle size={8} /> Error
                        </div>
                    )}
                </div>

                <div className="absolute left-0 right-0 bottom-0 z-50 bg-gradient-to-t from-black/95 via-black/70 to-transparent px-3 sm:px-4 md:px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-4 pt-10 sm:pt-16 pointer-events-auto">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 md:gap-4">
                        <button
                            onClick={togglePlayPause}
                            className="p-2.5 sm:p-3 rounded-2xl bg-black/65 backdrop-blur-md border border-white/10 text-white hover:bg-primary hover:text-black transition-all shadow-xl"
                            title="Play / Pause"
                        >
                            {videoRef.current?.paused ?? true ? <Play size={18} /> : <Pause size={18} />}
                        </button>

                        <div className="hidden sm:flex items-center min-w-[88px] text-white/90 text-xs md:text-sm font-bold font-mono tracking-tight">
                            {formatTime(currentTime)}
                        </div>

                        <div className="order-3 w-full sm:order-none sm:flex-1 flex flex-col gap-1.5 sm:gap-2">
                            <input
                                type="range"
                                min="0"
                                max="100"
                                step="0.1"
                                value={duration ? (currentTime / duration) * 100 : 0}
                                onChange={handleSeek}
                                className="w-full h-1.5 appearance-none rounded-full accent-primary bg-white/20 cursor-pointer"
                            />
                            <div className="flex items-center justify-between text-[9px] sm:text-[10px] uppercase tracking-[0.14em] sm:tracking-[0.18em] text-white/45">
                                <span>{streamMode === 'gateway' ? 'Gateway' : 'P2P'} • {peers} peers</span>
                                <span>{formatTime(duration)}</span>
                            </div>
                        </div>

                        <div className="ml-auto flex items-center gap-2">
                            <button
                                onClick={toggleMute}
                                className="p-2.5 sm:p-3 rounded-2xl bg-black/65 backdrop-blur-md border border-white/10 text-white hover:bg-white/20 transition-all shadow-xl"
                                title="Som"
                            >
                                {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                            </button>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={videoRef.current ? (videoRef.current.muted ? 0 : videoRef.current.volume) : (isMuted ? 0 : 1)}
                                onChange={(e) => {
                                    const video = videoRef.current;
                                    if (!video) return;
                                    const nextVolume = Number(e.target.value);
                                    video.volume = nextVolume;
                                    video.muted = nextVolume === 0;
                                    setIsMuted(nextVolume === 0);
                                }}
                                className="hidden md:block w-24 h-1.5 appearance-none rounded-full accent-primary bg-white/20 cursor-pointer"
                            />
                            <button
                                onClick={toggleFullscreen}
                                className="p-2.5 sm:p-3 rounded-2xl bg-black/65 backdrop-blur-md border border-white/10 text-white hover:bg-primary hover:text-black transition-all shadow-xl"
                                title="Tela cheia"
                            >
                                {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                            </button>
                        </div>
                    </div>
                </div>


                {/* AUDIO SELECTION OVERLAY (Premium Drawer) */}
                <AnimatePresence>
                    {showAudioMenu && (
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            className="absolute inset-y-0 right-0 w-[88vw] max-w-72 bg-black/90 backdrop-blur-2xl border-l border-white/10 z-[60] flex flex-col shadow-[-20px_0_50px_rgba(0,0,0,0.5)]"
                        >
                            <div className="p-4 sm:p-6 border-b border-white/10 flex justify-between items-center bg-green-500/5">
                                <div className="flex items-center gap-2">
                                    <Volume2 className="text-green-500" size={16} />
                                    <h4 className="text-white text-xs font-black uppercase tracking-widest">Nexus Audio Protocol</h4>
                                </div>
                                <button onClick={() => setShowAudioMenu(false)} className="text-white/40 hover:text-white transition-colors">
                                    <ChevronDown size={20} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
                                <div>
                                    <h5 className="px-3 mb-3 text-[9px] font-black uppercase text-green-500/50 tracking-[0.2em]">Fluxos de Áudio Disponíveis</h5>

                                    <div className="space-y-2">
                                        {/* Áudio Original / Track 0 (Sempre visível como fallback) */}
                                        <button
                                            onClick={restoreOriginalAudio}
                                            className={`w-full group flex items-center justify-between p-3 sm:p-4 rounded-2xl transition-all border ${currentExternalAudio === -1 && (currentAudioTrack === 0 || audioTracks.length === 0)
                                                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                                                : 'bg-white/5 border-transparent text-white/60 hover:bg-white/10'
                                                }`}
                                        >
                                            <div className="flex flex-col items-start gap-1">
                                                <span className="text-[11px] font-bold">Fluxo Local (Padrão)</span>
                                                <span className="text-[8px] uppercase tracking-widest opacity-40">Primary Audio Channel</span>
                                            </div>
                                            {currentExternalAudio === -1 && (currentAudioTrack === 0 || audioTracks.length === 0) && (
                                                <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_#22c55e]" />
                                            )}
                                        </button>

                                        {/* Faixas Internas */}
                                        {audioTracks.map((track, i) => {
                                            const isPTBR = track.language?.toLowerCase().includes('por') ||
                                                track.language?.toLowerCase() === 'pt' ||
                                                track.label?.toLowerCase().includes('portugu') ||
                                                track.label?.toLowerCase().includes('pt-br');

                                            return (
                                                <button
                                                    key={`int-${i}`}
                                                    onClick={() => switchAudioTrack(track.index !== undefined ? track.index : i)}
                                            className={`w-full group flex items-center justify-between p-3 sm:p-4 rounded-2xl transition-all border ${currentAudioTrack === (track.index !== undefined ? track.index : i) && currentExternalAudio === -1
                                                        ? 'bg-green-500/10 border-green-500/30 text-green-400'
                                                        : isPTBR
                                                            ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20'
                                                            : 'bg-white/5 border-transparent text-white/60 hover:bg-white/10'
                                                        }`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-black border ${isPTBR ? 'bg-blue-500/20 border-blue-500/30 text-blue-400' : 'bg-white/5 border-white/5'
                                                            }`}>
                                                            {track.language && track.language !== 'unknown' ? track.language.substring(0, 2).toUpperCase() : '??'}
                                                        </div>
                                                        <div className="flex flex-col items-start gap-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[11px] font-bold truncate max-w-[110px] sm:max-w-[140px]">{track.label}</span>
                                                                {isPTBR && (
                                                                    <span className="text-[7px] font-black bg-blue-500 text-white px-1.5 py-0.5 rounded-sm animate-pulse">
                                                                        🇧🇷 PT-BR
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <span className="text-[8px] uppercase tracking-widest opacity-40">Embedded Track #{track.index !== undefined ? track.index + 1 : i + 1}</span>
                                                        </div>
                                                    </div>
                                                    {currentAudioTrack === (track.index !== undefined ? track.index : i) && currentExternalAudio === -1 && (
                                                        <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_#22c55e]" />
                                                    )}
                                                </button>
                                            )
                                        })}


                                        {/* Áudios Externos */}
                                        {externalAudioFiles.map((audio, i) => (
                                            <button
                                                key={`ext-${i}`}
                                                onClick={() => switchExternalAudio(i)}
                                                className={`w-full group flex items-center justify-between p-3 sm:p-4 rounded-2xl transition-all border ${currentExternalAudio === i
                                                    ? 'bg-green-500/10 border-green-500/30 text-green-400'
                                                    : 'bg-white/5 border-transparent text-white/60 hover:bg-white/10'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-xl bg-green-500/20 flex items-center justify-center text-[10px] font-black border border-green-500/20 text-green-500">
                                                        {audio.language !== 'unknown' ? audio.language.substring(0, 2).toUpperCase() : 'EX'}
                                                    </div>
                                                    <div className="flex flex-col items-start gap-1">
                                                        <span className="text-[11px] font-bold truncate max-w-[110px] sm:max-w-[140px]">{audio.label}</span>
                                                        <span className="text-[8px] uppercase tracking-widest opacity-40">External Asset</span>
                                                    </div>
                                                </div>
                                                {currentExternalAudio === i && (
                                                    <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_#22c55e]" />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 sm:p-6 border-t border-white/10 bg-black/40">
                                <p className="text-[9px] text-white/20 uppercase font-black tracking-widest leading-relaxed">
                                    A priorização de áudio PT-BR é ativada automaticamente pelo protocolo de síntese Nexus.
                                </p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* PAINEL LATERAL (CHAT) */}
            <div className={`transition-all duration-500 bg-gray-900 border-l border-white/5 flex flex-col ${showChat ? 'w-full md:w-80' : 'w-0 opacity-0 overflow-hidden'}`}>
                <div className="p-4 sm:p-6 border-b border-white/10 bg-black/20 flex justify-between items-center gap-3">
                    <div>
                        <h4 className="text-primary text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                            <Activity size={10} className="animate-pulse" /> Live Stream Chat
                        </h4>
                        <p className="text-white text-xs font-bold truncate mt-1">SALA: {videoId?.substring(0, 8) || 'GLOBAL'}</p>
                        {fileName && <p className="text-[9px] text-gray-400 truncate max-w-[160px] sm:max-w-[200px] mt-1 italic">{fileName}</p>}
                    </div>
                    <button onClick={() => setShowChat(false)} className="text-gray-500 hover:text-white transition-colors">
                        <ChevronDown size={16} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 scrollbar-hide">
                    {messages.map((m) => (
                        <div key={m.id} className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                                <span className={`w-1 h-1 rounded-full ${m.user === userName ? 'bg-primary' : 'bg-blue-400'}`} />
                                <span className={`text-[9px] font-bold uppercase tracking-tighter ${m.user === userName ? 'text-primary' : 'text-gray-400'}`}>{m.user}</span>
                            </div>
                            <div className="bg-white/[0.03] py-2 px-3 rounded-2xl rounded-tl-none text-xs text-gray-300 border border-white/5 inline-block leading-relaxed">
                                {m.text}
                            </div>
                        </div>
                    ))}
                    {messages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-center opacity-20">
                            <MessageSquare className="mb-2" size={32} />
                            <p className="text-[10px] uppercase font-bold tracking-widest">Inicie a conversa</p>
                        </div>
                    )}
                </div>

                <div className="p-3 sm:p-4 bg-black/40 border-t border-white/10 mt-auto">
                    <div className="flex gap-2 bg-white/5 p-1 rounded-2xl border border-white/5 shadow-inner">
                        <input
                            value={messageInput}
                            onChange={(e) => setMessageInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                            type="text"
                            placeholder="Diga algo na rede..."
                            className="flex-1 bg-transparent py-2 px-4 text-xs text-white placeholder-gray-600 focus:outline-none"
                        />
                        <button onClick={sendMessage} className="p-2.5 bg-primary text-black rounded-xl hover:scale-110 active:scale-95 transition-all shadow-lg shadow-primary/20">
                            <Send size={14} />
                        </button>
                    </div>
                </div>
            </div>

            {/* PAINEL DE ARQUIVOS */}
            <div className={`transition-all duration-500 bg-black/95 border-l border-white/10 flex flex-col absolute inset-y-0 right-0 z-40 ${showFileList ? 'w-[88vw] sm:w-80 translate-x-0' : 'w-0 translate-x-full overflow-hidden'}`}>
                <div className="p-4 sm:p-6 border-b border-white/10 flex justify-between items-center gap-3">
                    <h4 className="text-white text-xs font-black uppercase tracking-widest flex items-center gap-2">
                        <List size={14} className="text-primary" /> Swarm Index
                    </h4>
                    <button onClick={() => setShowFileList(false)} className="text-gray-500 hover:text-white"><ChevronDown /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-1">
                    {fileList.map((f, i) => (
                        <div
                            key={i}
                            onClick={() => f.name.match(/\.(srt|vtt)$/i) && switchSubtitle(f)}
                            className={`group/file flex items-center justify-between p-3 rounded-xl transition-all border border-transparent hover:border-white/5 ${f.name.match(/\.(srt|vtt)$/i) ? 'cursor-pointer hover:bg-primary/5' : 'hover:bg-white/5'}`}
                        >
                            <div className="flex flex-col gap-0.5 truncate pr-4">
                                <span className="text-[11px] text-gray-300 font-medium truncate">{f.name}</span>
                                <span className="text-[9px] text-gray-500 lowercase">{(f.length / (1024 * 1024)).toFixed(1)} MB</span>
                            </div>
                            {f.name.match(/\.(mp4|mkv|webm|vtt|srt)$/i) && (
                                <div className="p-1.5 rounded-lg bg-primary/10 text-primary opacity-0 group-hover/file:opacity-100 transition-opacity">
                                    {f.name.match(/\.(srt|vtt)$/i) ? <MessageSquare size={12} /> : <Activity size={12} />}
                                </div>
                            )}
                        </div>
                    ))}
                    {subtitleList.length > 0 && (
                        <div className="mt-6 pt-4 border-t border-white/10">
                            <h5 className="px-3 mb-2 text-[9px] font-black uppercase text-primary/50 tracking-[0.2em]">Seleção de Legendas</h5>
                            {subtitleList.map((s, i) => (
                                <button
                                    key={i}
                                    onClick={() => switchSubtitle(s)}
                                    className="w-full text-left px-3 py-2 text-[10px] text-gray-400 hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-2 transition-all"
                                >
                                    <span className="w-1 h-1 bg-primary rounded-full" /> {s.name}
                                </button>
                            ))}
                        </div>
                    )}
                    {/* Audio Tracks */}
                    {(audioTracks.length > 1 || externalAudioFiles.length > 0) && (
                        <div className="mt-6 pt-4 border-t border-white/10">
                            <h5 className="px-3 mb-2 text-[9px] font-black uppercase text-green-500/50 tracking-[0.2em]">🎵 Faixas de Áudio</h5>

                            {/* Áudio Original */}
                            {externalAudioFiles.length > 0 && (
                                <button
                                    onClick={restoreOriginalAudio}
                                    className={`w-full text-left px-3 py-2 text-[10px] rounded-lg flex items-center gap-2 transition-all mb-1 ${currentExternalAudio === -1 && currentAudioTrack === 0
                                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                                        }`}
                                >
                                    <span className={`w-1 h-1 rounded-full ${currentExternalAudio === -1 ? 'bg-green-500' : 'bg-gray-500'}`} />
                                    Áudio Original
                                    <span className="ml-auto text-[8px] opacity-50 uppercase">Padrão</span>
                                </button>
                            )}

                            {/* Faixas Internas */}
                            {audioTracks.map((track, i) => (
                                <button
                                    key={`internal-${i}`}
                                    onClick={() => switchAudioTrack(i)}
                                    className={`w-full text-left px-3 py-2 text-[10px] rounded-lg flex items-center gap-2 transition-all mb-1 ${currentAudioTrack === i && currentExternalAudio === -1
                                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                                        }`}
                                >
                                    <span className={`w-1 h-1 rounded-full ${currentAudioTrack === i && currentExternalAudio === -1 ? 'bg-green-500' : 'bg-gray-500'}`} />
                                    {track.label}
                                    {track.language !== 'unknown' && (
                                        <span className="ml-auto text-[8px] opacity-50 uppercase">
                                            {track.language}
                                        </span>
                                    )}
                                </button>
                            ))}

                            {/* Áudios Externos */}
                            {externalAudioFiles.map((audio, i) => (
                                <button
                                    key={`external-${i}`}
                                    onClick={() => switchExternalAudio(i)}
                                    className={`w-full text-left px-3 py-2 text-[10px] rounded-lg flex items-center gap-2 transition-all mb-1 ${currentExternalAudio === i
                                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                                        }`}
                                >
                                    <span className={`w-1 h-1 rounded-full ${currentExternalAudio === i ? 'bg-green-500' : 'bg-gray-500'}`} />
                                    {audio.label}
                                    {audio.language !== 'unknown' && (
                                        <span className="ml-auto text-[8px] opacity-50 uppercase">
                                            {audio.language}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                    {/* Local Subtitle Upload */}
                    <div className="mt-6 pt-4 border-t border-white/10">
                        <h5 className="px-3 mb-2 text-[9px] font-black uppercase text-primary/50 tracking-[0.2em]">Legenda Local</h5>
                        <label className="w-full cursor-pointer px-3 py-2 text-[10px] text-gray-400 hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-2 transition-all">
                            <Plus size={12} className="text-primary" /> Carregar Arquivo .SRT
                            <input type="file" accept=".srt,.vtt" onChange={handleLocalSubtitle} className="hidden" />
                        </label>
                    </div>
                </div>
            </div>

            {/* ERROR UI */}
            {shouldShowErrorOverlay && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/95 z-50 p-10 text-center">
                    <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 border border-red-500/20">
                        <AlertTriangle className="w-10 h-10 text-red-500 animate-pulse" />
                    </div>
                    <h3 className="text-2xl font-black text-white mb-2 uppercase tracking-tight">Handshake Failed</h3>
                    <p className="text-gray-400 text-sm mb-10 max-w-sm">
                        Não foi possível estabelecer um túnel estável com a swarm ou os trackers estão saturados.
                    </p>
                    <div className="flex flex-col gap-3 w-full max-w-xs">
                        <button onClick={() => reconnectPlayback('manual')} className="w-full bg-primary hover:bg-white text-black font-black py-4 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-primary/20">
                            <RefreshCw size={18} /> REFORJAR CONEXÃO
                        </button>
                        <button
                            onClick={() => setErrorNoticeDismissed(true)}
                            className="w-full bg-white/5 hover:bg-white/10 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all border border-white/10"
                        >
                            <X size={18} /> FECHAR AVISO
                        </button>
                        <a href={magnetURI} className="w-full bg-white/5 hover:bg-white/10 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all border border-white/10">
                            <Download size={18} /> DESVIAR PARA VLC
                        </a>
                    </div>
                </div>
            )}
        </div>
    );
};
