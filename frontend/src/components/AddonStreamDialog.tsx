import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Loader2, AlertCircle, Film, Tv, X, MonitorPlay, Download, Search } from 'lucide-react';
import { addonService } from '@/services/addon.service';
import { TorrentPlayer } from '@/components/TorrentPlayer';

interface Stream {
    title?: string;
    name?: string;
    description?: string;
    url?: string;
    infoHash?: string;
    ytId?: string;
    fileIdx?: number;
    sources?: string[];
    behaviorHints?: any;
    addonName?: string;
    _addonId?: string;
}

interface AddonStreamDialogProps {
    isOpen: boolean;
    onClose: () => void;
    type: 'movie' | 'series';
    id: string;
    title: string;
    onMaterializeStream?: (stream: Stream) => Promise<void>;
}

export const AddonStreamDialog: React.FC<AddonStreamDialogProps> = ({
    isOpen,
    onClose,
    type,
    id,
    title,
    onMaterializeStream,
}) => {
    const [loading, setLoading] = useState(false);
    const [streams, setStreams] = useState<Stream[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [activeStream, setActiveStream] = useState<Stream | null>(null);
    const [materializingKey, setMaterializingKey] = useState<string | null>(null);
    const [selectedAddon, setSelectedAddon] = useState<string>('all');
    const [streamQuery, setStreamQuery] = useState('');

    useEffect(() => {
        if (isOpen && id) {
            fetchStreams();
            setActiveStream(null);
            setSelectedAddon('all');
            setStreamQuery('');
        }
    }, [isOpen, id, type]);

    const isBrokenStream = (stream: Stream) => {
        const haystack = `${stream.title || ''} ${stream.name || ''} ${stream.description || ''}`.trim();
        return /please configure|not configured|configuration required|^\[❌\]|\berror\b/i.test(haystack);
    };

    const addonPriority = (name?: string) => {
        const normalized = String(name || '').toLowerCase();
        if (normalized.includes('torrentio')) return 100;
        if (normalized.includes('thepiratebay')) return 80;
        if (normalized.includes('brazuca')) return 75;
        if (normalized.includes('top streaming')) return 40;
        if (normalized.includes('streaming catalogs')) return 30;
        return 0;
    };

    const normalizeText = (value?: string) =>
        String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();

    const getStreamText = (stream: Stream) =>
        normalizeText([
            stream.title,
            stream.name,
            stream.description,
            stream.behaviorHints?.filename,
        ].filter(Boolean).join(' '));

    const getPortugueseAudioScore = (stream: Stream) => {
        const haystack = getStreamText(stream);
        let score = 0;

        if (/\bdublado\b|\bdual audio\b|\bdual-audio\b|\bpt-br\b|\bportugues\b|\bportuguese\b|\baudio pt\b|\baudio br\b/.test(haystack)) {
            score += 100;
        }

        if (/\bmulti\b|\bmulti audio\b|\blat\b/.test(haystack)) {
            score += 20;
        }

        return score;
    };

    const getPortugueseSubtitleScore = (stream: Stream) => {
        const haystack = getStreamText(stream);
        let score = 0;

        if (/\blegenda\b|\blegendado\b|\bsub\b|\bsubtitle\b|\bsubs\b/.test(haystack)) {
            score += 10;
        }

        if (/\bpt-br\b|\bptbr\b|\bportugues\b|\bportuguese\b|\blegenda pt\b/.test(haystack)) {
            score += 40;
        }

        return score;
    };

    const getQualityLabel = (stream: Stream) => {
        const haystack = getStreamText(stream);
        if (/\b2160\b|\b4k\b/.test(haystack)) return '4K';
        if (/\b1080\b/.test(haystack)) return '1080p';
        if (/\b720\b/.test(haystack)) return '720p';
        return null;
    };

    const addonOptions = useMemo(() => {
        const counts = new Map<string, number>();
        streams.forEach((stream) => {
            if (isBrokenStream(stream)) return;
            const name = stream.addonName || 'Unknown Addon';
            counts.set(name, (counts.get(name) || 0) + 1);
        });

        return Array.from(counts.entries())
            .sort((a, b) => addonPriority(b[0]) - addonPriority(a[0]) || a[0].localeCompare(b[0]))
            .map(([name, count]) => ({ name, count }));
    }, [streams]);

    const getAddonPortugueseBonus = (stream: Stream) => {
        const addonName = normalizeText(stream.addonName);
        const hasPortugueseValue = getPortugueseAudioScore(stream) > 0 || getPortugueseSubtitleScore(stream) > 0;
        if (!hasPortugueseValue) return 0;
        if (addonName.includes('brazuca')) return 35;
        if (addonName.includes('top streaming')) return 12;
        return 0;
    };

    const getSeriesEpisodeSpecificity = (stream: Stream) => {
        const haystack = normalizeText([
            stream.title,
            stream.name,
            stream.description,
            stream.behaviorHints?.filename,
        ].filter(Boolean).join(' '));
        const target = normalizeText(title);
        const episodeMatch = target.match(/s(\d{2})e(\d{2})/i);

        let score = 0;
        if (episodeMatch) {
            const [, season, episode] = episodeMatch;
            const seasonNum = String(Number(season));
            const episodeNum = String(Number(episode));
            const exactEpisodePatterns = [
                new RegExp(`s${season}e${episode}`),
                new RegExp(`${seasonNum}x${episodeNum}`),
                new RegExp(`episodio\\s*${episodeNum}`),
                new RegExp(`episode\\s*${episodeNum}`),
            ];

            if (exactEpisodePatterns.some((pattern) => pattern.test(haystack))) {
                score += 120;
            }

            if (new RegExp(`e${episode}\\s*[-_]\\s*e?\\d{2}`).test(haystack) || new RegExp(`${seasonNum}x${episodeNum}\\s*[-_]\\s*\\d{1,2}`).test(haystack)) {
                score -= 60;
            }

            if (new RegExp(`s${season}(?!e${episode})`).test(haystack) || new RegExp(`season\\s*${seasonNum}`).test(haystack) || new RegExp(`temporada\\s*${seasonNum}`).test(haystack)) {
                score -= 10;
            }
        }

        if (/\bcomplete\b|\bcompleta\b|\btemporada\b|\bseason\b/.test(haystack)) {
            score -= 20;
        }

        if (/\bdual\b|\bdublado\b|\bpt-br\b/.test(haystack)) {
            score += 10;
        }

        return score;
    };

    const getSwarmScore = (stream: Stream) => {
        const haystack = `${stream.title || ''} ${stream.name || ''} ${stream.description || ''}`;
        const matches = [...haystack.matchAll(/(?:👤|seed(?:s|ers?)?|peer(?:s)?)[^\d]{0,6}(\d{1,5})/gi)];
        if (!matches.length) return 0;

        return matches.reduce((best, match) => {
            const value = Number(match[1] || 0);
            return Number.isFinite(value) ? Math.max(best, value) : best;
        }, 0);
    };

    const rankedStreams = useMemo(() => {
        return [...streams]
            .filter((stream) => !isBrokenStream(stream))
            .sort((a, b) => {
                const aAudio = getPortugueseAudioScore(a);
                const bAudio = getPortugueseAudioScore(b);
                if (aAudio !== bAudio) return bAudio - aAudio;

                const aSubtitle = getPortugueseSubtitleScore(a);
                const bSubtitle = getPortugueseSubtitleScore(b);
                if (aSubtitle !== bSubtitle) return bSubtitle - aSubtitle;

                const aPriority = addonPriority(a.addonName) + getAddonPortugueseBonus(a);
                const bPriority = addonPriority(b.addonName) + getAddonPortugueseBonus(b);
                if (aPriority !== bPriority) return bPriority - aPriority;

                const aP2P = a.infoHash || a.url?.startsWith('magnet:') ? 1 : 0;
                const bP2P = b.infoHash || b.url?.startsWith('magnet:') ? 1 : 0;
                if (type === 'series' && aP2P !== bP2P) return bP2P - aP2P;

                if (type === 'series') {
                    const aSpecificity = getSeriesEpisodeSpecificity(a);
                    const bSpecificity = getSeriesEpisodeSpecificity(b);
                    if (aSpecificity !== bSpecificity) return bSpecificity - aSpecificity;
                }

                const aSwarm = getSwarmScore(a);
                const bSwarm = getSwarmScore(b);
                if (aSwarm !== bSwarm) return bSwarm - aSwarm;

                return String(a.title || a.name || '').localeCompare(String(b.title || b.name || ''));
            });
    }, [streams, type, title]);

    const filteredStreams = useMemo(() => {
        const query = normalizeText(streamQuery);
        return rankedStreams.filter((stream) => {
            const matchesAddon = selectedAddon === 'all' || (stream.addonName || 'Unknown Addon') === selectedAddon;
            if (!matchesAddon) return false;
            if (!query) return true;

            const haystack = getStreamText(stream);
            return haystack.includes(query);
        });
    }, [rankedStreams, selectedAddon, streamQuery]);

    const streamSummary = useMemo(() => {
        const portugueseAudio = filteredStreams.filter((stream) => getPortugueseAudioScore(stream) > 0).length;
        const portugueseSubtitle = filteredStreams.filter((stream) => getPortugueseSubtitleScore(stream) > 0).length;
        const p2pCount = filteredStreams.filter((stream) => stream.infoHash || stream.url?.startsWith('magnet:')).length;
        return {
            total: filteredStreams.length,
            portugueseAudio,
            portugueseSubtitle,
            p2pCount,
        };
    }, [filteredStreams]);

    const fetchStreams = async () => {
        setLoading(true);
        setError(null);
        try {
            const results = await addonService.getStreams(type, id, title);
            setStreams(Array.isArray(results) ? results : []);
        } catch (err) {
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
            alert('Este stream nao possui URL ou InfoHash suportado.');
        }
    };

    const handleMaterialize = async (stream: Stream) => {
        if (!onMaterializeStream) return;
        const key = stream.infoHash || stream.url || stream.title || stream.name || 'stream';
        setMaterializingKey(key);
        try {
            await onMaterializeStream(stream);
            onClose();
        } catch (err) {
            console.error(err);
        } finally {
            setMaterializingKey(null);
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
                            videoId={`addon-${id}`}
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
            <div
                onClick={onClose}
                className="absolute inset-0 bg-black/90 backdrop-blur-xl transition-opacity"
            />

            <div className="relative w-full max-w-5xl bg-[#0f0f1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[85vh]">
                {activeStream ? (
                    renderPlayer()
                ) : (
                    <>
                        <div className="p-8 border-b border-white/5 bg-gradient-to-r from-cyan-900/20 to-blue-900/20 flex justify-between items-start">
                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="p-2 bg-cyan-500/10 rounded-lg text-cyan-400">
                                        {type === 'movie' ? <Film size={20} /> : <Tv size={20} />}
                                    </div>
                                    <h2 className="text-2xl font-black uppercase italic tracking-tight text-white">{title}</h2>
                                </div>
                                <p className="text-sm text-white/40 pl-1">
                                    Selecione uma fonte de transmissao via addon
                                </p>
                                {!loading && !error && rankedStreams.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-4 pl-1">
                                        <span className="text-[10px] uppercase font-black tracking-widest text-white/70 bg-white/5 px-3 py-1 rounded-full">
                                            {streamSummary.total} fontes visiveis
                                        </span>
                                        {streamSummary.portugueseAudio > 0 && (
                                            <span className="text-[10px] uppercase font-black tracking-widest text-emerald-300 bg-emerald-500/15 px-3 py-1 rounded-full">
                                                {streamSummary.portugueseAudio} com audio PT-BR
                                            </span>
                                        )}
                                        {streamSummary.portugueseSubtitle > 0 && (
                                            <span className="text-[10px] uppercase font-black tracking-widest text-sky-300 bg-sky-500/15 px-3 py-1 rounded-full">
                                                {streamSummary.portugueseSubtitle} com legenda PT
                                            </span>
                                        )}
                                        {streamSummary.p2pCount > 0 && (
                                            <span className="text-[10px] uppercase font-black tracking-widest text-violet-300 bg-violet-500/15 px-3 py-1 rounded-full">
                                                {streamSummary.p2pCount} P2P
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                            <button onClick={onClose} className="p-2 text-white/40 hover:text-white transition-colors">
                                <X size={24} />
                            </button>
                        </div>

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
                            ) : rankedStreams.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full space-y-4 opacity-30">
                                    <MonitorPlay className="w-16 h-16 text-white" />
                                    <p className="text-sm uppercase tracking-widest text-white">Nenhum stream encontrado</p>
                                    <p className="text-xs text-white/50 max-w-xs text-center">Os addons ativos nao retornaram fontes utilizaveis para este item.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="space-y-3">
                                        <div className="relative">
                                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                                            <input
                                                value={streamQuery}
                                                onChange={(e) => setStreamQuery(e.target.value)}
                                                placeholder="Pesquisar dentro das fontes..."
                                                className="w-full rounded-xl bg-white/5 border border-white/10 px-10 py-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-cyan-500/40"
                                            />
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                onClick={() => setSelectedAddon('all')}
                                                className={`px-3 py-1.5 rounded-lg text-[10px] uppercase font-black tracking-widest transition-colors ${selectedAddon === 'all' ? 'bg-cyan-500 text-black' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                                            >
                                                Todos ({rankedStreams.length})
                                            </button>
                                            {addonOptions.map((addon) => (
                                                <button
                                                    key={addon.name}
                                                    onClick={() => setSelectedAddon(addon.name)}
                                                    className={`px-3 py-1.5 rounded-lg text-[10px] uppercase font-black tracking-widest transition-colors ${selectedAddon === addon.name ? 'bg-cyan-500 text-black' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                                                >
                                                    {addon.name} ({addon.count})
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {filteredStreams.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-16 space-y-3 opacity-40">
                                            <MonitorPlay className="w-12 h-12 text-white" />
                                            <p className="text-sm uppercase tracking-widest text-white">Nenhuma fonte bateu com esse filtro</p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 gap-3">
                                    {filteredStreams.map((stream, idx) => (
                                        <motion.div
                                            key={`${stream.addonName || 'addon'}-${idx}`}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: idx * 0.05 }}
                                            className="group flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-cyan-500/30 rounded-xl transition-all"
                                        >
                                            <div className="flex items-center gap-4 cursor-pointer flex-1 min-w-0" onClick={() => handleStreamSelect(stream)}>
                                                <div className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center text-cyan-500 group-hover:scale-110 transition-transform shadow-lg">
                                                    <Play size={16} fill="currentColor" />
                                                </div>
                                                <div className="min-w-0">
                                                    <h4 className="text-sm font-bold text-white group-hover:text-cyan-400 line-clamp-1">
                                                        {stream.title || stream.name || `Stream ${idx + 1}`}
                                                    </h4>
                                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                        <span className="text-[10px] uppercase font-black tracking-widest text-white/30 bg-white/5 px-2 py-0.5 rounded-sm">
                                                            {stream.addonName || 'Unknown Addon'}
                                                        </span>
                                                        {normalizeText(stream.addonName).includes('brazuca') && (getPortugueseAudioScore(stream) > 0 || getPortugueseSubtitleScore(stream) > 0) && (
                                                            <span className="text-[9px] uppercase font-black text-fuchsia-300 bg-fuchsia-500/15 px-2 py-0.5 rounded-sm">
                                                                BR em destaque
                                                            </span>
                                                        )}
                                                        {getPortugueseAudioScore(stream) > 0 && (
                                                            <span className="text-[9px] uppercase font-black text-emerald-300 bg-emerald-500/15 px-2 py-0.5 rounded-sm">
                                                                Audio PT-BR
                                                            </span>
                                                        )}
                                                        {getPortugueseSubtitleScore(stream) > 0 && (
                                                            <span className="text-[9px] uppercase font-black text-sky-300 bg-sky-500/15 px-2 py-0.5 rounded-sm">
                                                                Legenda PT
                                                            </span>
                                                        )}
                                                        {getQualityLabel(stream) && (
                                                            <span className="text-[9px] uppercase font-black text-yellow-300 bg-yellow-500/15 px-2 py-0.5 rounded-sm">
                                                                {getQualityLabel(stream)}
                                                            </span>
                                                        )}
                                                        {(stream.infoHash || stream.url?.startsWith('magnet')) && (
                                                            <span className="text-[9px] uppercase font-bold text-violet-400">P2P</span>
                                                        )}
                                                        {stream.url && !stream.url.startsWith('magnet:') && !stream.infoHash && (
                                                            <span className="text-[9px] uppercase font-bold text-green-400">Direct</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 ml-4">
                                                {onMaterializeStream && (stream.infoHash || stream.url?.startsWith('magnet:')) && (
                                                    <button
                                                        onClick={() => handleMaterialize(stream)}
                                                        disabled={materializingKey === (stream.infoHash || stream.url || stream.title || stream.name || 'stream')}
                                                        className="px-3 py-2 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors text-[10px] uppercase font-bold tracking-widest disabled:opacity-50"
                                                    >
                                                        {materializingKey === (stream.infoHash || stream.url || stream.title || stream.name || 'stream') ? (
                                                            <span className="inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Fila</span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1"><Download className="w-3 h-3" />Biblioteca</span>
                                                        )}
                                                    </button>
                                                )}
                                                <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[9px] uppercase font-bold text-cyan-400">
                                                    Abrir
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
