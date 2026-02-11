import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Play, Loader2, AlertCircle, Film, Tv, X, MonitorPlay } from 'lucide-react';
import { addonService } from '@/services/addon.service';
import { TorrentPlayer } from '@/components/TorrentPlayer';

interface Stream {
    title?: string;
    name?: string;
    url?: string;
    infoHash?: string;
    ytId?: string;
    behaviorHints?: any;
    addonName?: string;
    _addonId?: string;
}

interface AddonStreamDialogProps {
    isOpen: boolean;
    onClose: () => void;
    type: 'movie' | 'series';
    id: string; // TMDB ID (numérico) ou IMDB ID (tt...)
    title: string;
}

export const AddonStreamDialog: React.FC<AddonStreamDialogProps> = ({
    isOpen, onClose, type, id, title
}) => {
    const [loading, setLoading] = useState(false);
    const [streams, setStreams] = useState<Stream[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [activeStream, setActiveStream] = useState<Stream | null>(null);

    // Reset ao abrir novo ID
    useEffect(() => {
        if (isOpen && id) {
            fetchStreams();
            setActiveStream(null);
        }
    }, [isOpen, id, type]);

    const fetchStreams = async () => {
        setLoading(true);
        setError(null);
        try {
            console.log(`🔍 Buscando streams para ${title} (${id})...`);
            const results = await addonService.getStreams(type, id);
            setStreams(results);
        } catch (err: any) {
            console.error(err);
            setError('Falha ao buscar streams nos addons.');
        } finally {
            setLoading(false);
        }
    };

    const handleStreamSelect = (stream: Stream) => {
        if (stream.url || stream.infoHash || stream.ytId) {
            setActiveStream(stream);
        } else {
            alert('Este stream não possui URL ou InfoHash suportado.');
        }
    };

    const renderPlayer = () => {
        if (!activeStream) return null;

        const isMagnet = activeStream.url?.startsWith('magnet:') || activeStream.infoHash;
        const isYoutube = !!activeStream.ytId;
        const isDirect = activeStream.url && !isMagnet && !isYoutube;

        return (
            <div className="flex flex-col h-full bg-black">
                <div className="flex items-center justify-between p-4 bg-black/80 backdrop-blur border-b border-white/10 z-10">
                    <div>
                        <h3 className="text-white font-bold text-sm line-clamp-1">{activeStream.title || activeStream.name || title}</h3>
                        <p className="text-xs text-white/50">{activeStream.addonName}</p>
                    </div>
                    <button
                        onClick={() => setActiveStream(null)}
                        className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="flex-1 relative overflow-hidden flex items-center justify-center">
                    {isMagnet && (
                        <TorrentPlayer
                            magnetURI={activeStream.url || `magnet:?xt=urn:btih:${activeStream.infoHash}`}
                            videoId={`addon-${id}`} // ID temporário para chat/history no player
                        />
                    )}

                    {isYoutube && (
                        <iframe
                            width="100%"
                            height="100%"
                            src={`https://www.youtube.com/embed/${activeStream.ytId}?autoplay=1`}
                            title={title}
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        />
                    )}

                    {isDirect && (
                        <video
                            src={activeStream.url}
                            controls
                            autoPlay
                            className="w-full h-full object-contain"
                        />
                    )}
                </div>
            </div>
        );
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                onClick={onClose}
                className="absolute inset-0 bg-black/90 backdrop-blur-xl transition-opacity"
            />

            {/* Content Container */}
            <div className={`relative w-full max-w-5xl bg-[#0f0f1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[85vh]`}>

                {/* Mode: Player Active */}
                {activeStream ? (
                    renderPlayer()
                ) : (
                    /* Mode: Stream List */
                    <>
                        {/* Header */}
                        <div className="p-8 border-b border-white/5 bg-gradient-to-r from-cyan-900/20 to-blue-900/20 flex justify-between items-start">
                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="p-2 bg-cyan-500/10 rounded-lg text-cyan-400">
                                        {type === 'movie' ? <Film size={20} /> : <Tv size={20} />}
                                    </div>
                                    <h2 className="text-2xl font-black uppercase italic tracking-tight text-white">{title}</h2>
                                </div>
                                <p className="text-sm text-white/40 pl-1">
                                    Selecione uma fonte de transmissão via Addon
                                </p>
                            </div>
                            <button onClick={onClose} className="p-2 text-white/40 hover:text-white transition-colors">
                                <X size={24} />
                            </button>
                        </div>

                        {/* List Body */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center h-full space-y-4 opacity-50">
                                    <Loader2 className="w-12 h-12 animate-spin text-cyan-500" />
                                    <p className="text-xs uppercase tracking-widest text-cyan-500">Buscando Streams...</p>
                                </div>
                            ) : error ? (
                                <div className="flex flex-col items-center justify-center h-full space-y-4 text-red-500/50">
                                    <AlertCircle className="w-16 h-16" />
                                    <p className="text-sm uppercase tracking-widest">{error}</p>
                                    <button
                                        onClick={fetchStreams}
                                        className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-red-400 text-xs font-bold uppercase tracking-widest transition-colors"
                                    >
                                        Tentar Novamente
                                    </button>
                                </div>
                            ) : streams.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full space-y-4 opacity-30">
                                    <MonitorPlay className="w-16 h-16 text-white" />
                                    <p className="text-sm uppercase tracking-widest text-white">Nenhum stream encontrado</p>
                                    <p className="text-xs text-white/50 max-w-xs text-center">Tente instalar mais addons na página de gerenciamento.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-3">
                                    {streams.map((stream, idx) => (
                                        <motion.div
                                            key={idx}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: idx * 0.05 }}
                                            onClick={() => handleStreamSelect(stream)}
                                            className="group flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-cyan-500/30 rounded-xl cursor-pointer transition-all"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center text-cyan-500 group-hover:scale-110 transition-transform shadow-lg">
                                                    <Play size={16} fill="currentColor" />
                                                </div>
                                                <div>
                                                    <h4 className="text-sm font-bold text-white group-hover:text-cyan-400 line-clamp-1">
                                                        {stream.title || stream.name || `Stream ${idx + 1}`}
                                                    </h4>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-[10px] uppercase font-black tracking-widest text-white/30 bg-white/5 px-2 py-0.5 rounded-sm">
                                                            {stream.addonName || 'Unknown Addon'}
                                                        </span>
                                                        {stream.name && stream.name !== stream.title && (
                                                            <span className="text-[10px] text-white/40">{stream.name}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {stream.url && !stream.url.startsWith('magnet') && (
                                                    <span className="text-[9px] uppercase font-bold text-green-500">Direct Play</span>
                                                )}
                                                {(stream.infoHash || stream.url?.startsWith('magnet')) && (
                                                    <span className="text-[9px] uppercase font-bold text-violet-500">P2P Stream</span>
                                                )}
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
