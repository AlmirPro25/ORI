import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Loader2, AlertCircle, Film, Tv, X, MonitorPlay, Download, Search } from 'lucide-react';
import { addonService } from '@/services/addon.service';
import { TorrentPlayer } from '@/components/TorrentPlayer';
import { usePlaybackPreferencesStore } from '@/stores/playbackPreferences.store';
import { useAuthStore } from '@/stores/auth.store';

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
    arconteSignal?: {
        wins?: number;
        ptBrWins?: number;
        avgAvailability?: number;
        trustLevel?: 'high' | 'medium' | 'low' | null;
        label?: string | null;
    } | null;
}

interface AddonStreamDialogProps {
    isOpen: boolean;
    onClose: () => void;
    type: 'movie' | 'series';
    id: string;
    title: string;
    onMaterializeStream?: (stream: Stream) => Promise<void>;
    disableAutoSelect?: boolean;
}

export const AddonStreamDialog: React.FC<AddonStreamDialogProps> = ({
    isOpen,
    onClose,
    type,
    id,
    title,
    onMaterializeStream,
    disableAutoSelect = false,
}) => {
    const [loading, setLoading] = useState(false);
    const [streams, setStreams] = useState<Stream[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [activeStream, setActiveStream] = useState<Stream | null>(null);
    const [autoSelectedByArconte, setAutoSelectedByArconte] = useState(false);
    const [materializingKey, setMaterializingKey] = useState<string | null>(null);
    const [selectedAddon, setSelectedAddon] = useState<string>('all');
    const [streamQuery, setStreamQuery] = useState('');
    const [onlyPortuguese, setOnlyPortuguese] = useState(false);
    const [onlyStrongSources, setOnlyStrongSources] = useState(false);
    const [configuredAddonCount, setConfiguredAddonCount] = useState(0);
    const { user } = useAuthStore();
    const {
        preferPortugueseAudio,
        acceptPortugueseSubtitles,
        setPreferPortugueseAudio,
        setAcceptPortugueseSubtitles,
    } = usePlaybackPreferencesStore();

    useEffect(() => {
        if (isOpen && id) {
            fetchStreams();
            setActiveStream(null);
            setAutoSelectedByArconte(false);
            setSelectedAddon('all');
            setStreamQuery('');
            setOnlyPortuguese(preferPortugueseAudio || acceptPortugueseSubtitles);
            setOnlyStrongSources(false);
        }
    }, [isOpen, id, type, preferPortugueseAudio, acceptPortugueseSubtitles]);

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

    const hasExplicitPortugueseAudio = (stream: Stream) => {
        const haystack = getStreamText(stream);
        return /\bdublado\b|\bpt-br\b|\bptbr\b|\bportugues\b|\bportuguese\b|\baudio pt\b|\baudio br\b|\bdub pt\b|\bdubbed pt\b/.test(haystack);
    };

    const hasGenericMultiAudio = (stream: Stream) => {
        const haystack = getStreamText(stream);
        return /\bdual audio\b|\bdual-audio\b|\bmulti audio\b|\bmulti-audio\b/.test(haystack);
    };

    const getPortugueseAudioScore = (stream: Stream) => {
        const haystack = getStreamText(stream);
        let score = 0;

        if (hasExplicitPortugueseAudio(stream)) {
            score += 100;
        }

        if (/\blat\b/.test(haystack)) {
            score += 15;
        }

        if (/\beng\b|\benglish\b|\bjapanese\b|\bjap\b/.test(haystack) && !hasExplicitPortugueseAudio(stream)) {
            score -= 20;
        }

        return score;
    };

    const getPortugueseSubtitleScore = (stream: Stream) => {
        const haystack = getStreamText(stream);
        let score = 0;

        if (/\blegenda pt\b|\blegenda pt-br\b|\bsub pt\b|\bsub pt-br\b|\bsubtitle pt\b|\bsubtitle pt-br\b|\bsubs pt\b|\bsubs pt-br\b/.test(haystack)) {
            score += 60;
        } else if (/\bpt-br\b|\bptbr\b|\bportugues\b|\bportuguese\b/.test(haystack) && /\blegenda\b|\blegendado\b|\bsub\b|\bsubtitle\b|\bsubs\b/.test(haystack)) {
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

    const extractProviderLabel = (stream: Stream) => {
        const raw = `${stream.title || ''} ${stream.name || ''} ${stream.description || ''}`;
        const normalized = normalizeText(raw);
        const knownProviders: Array<[RegExp, string]> = [
            [/\bcinecalidad\b/, 'Cinecalidad'],
            [/\beztv\b/, 'EZTV'],
            [/\bthepiratebay\b|\btpb\b/, 'ThePirateBay'],
            [/\btorrentio\b/, 'Torrentio'],
            [/\bbrazuca\b/, 'Brazuca'],
            [/\byts\b/, 'YTS'],
            [/\b1337x\b/, '1337x'],
            [/\brarbg\b/, 'RARBG'],
            [/\bnyaa\b/, 'Nyaa'],
            [/\bbitsearch\b/, 'BitSearch'],
            [/\bsolidtorrents\b/, 'SolidTorrents'],
            [/\blimetorrents\b/, 'LimeTorrents'],
            [/\btorrentdownloads\b/, 'TorrentDownloads'],
            [/\btorrentgalaxy\b/, 'TorrentGalaxy'],
            [/\bglodls\b/, 'GloDLS'],
        ];

        const matched = knownProviders.find(([pattern]) => pattern.test(normalized));
        if (matched) return matched[1];

        const trailingProvider = raw.match(/[•·\-\|]\s*([A-Za-z0-9.+/& ]{3,40})\s*$/);
        return trailingProvider?.[1]?.trim() || null;
    };

    const extractSwarmStats = (stream: Stream) => {
        const raw = `${stream.title || ''} ${stream.name || ''} ${stream.description || ''}`;
        const peersMatch = raw.match(/(?:👤|peers?)[^\d]{0,6}(\d{1,5})/i);
        const seedsMatch = raw.match(/seed(?:s|ers?)?[^\d]{0,6}(\d{1,5})/i);

        return {
            peers: peersMatch ? Number(peersMatch[1]) : null,
            seeds: seedsMatch ? Number(seedsMatch[1]) : null,
            swarm: getSwarmScore(stream),
        };
    };

    const getAvailabilityScore = (stream: Stream) => {
        const { peers, seeds, swarm } = extractSwarmStats(stream);
        return (seeds || 0) * 4 + (peers || 0) * 2 + swarm;
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

    const isStrongSource = (stream: Stream) => {
        const availability = getAvailabilityScore(stream);
        const hasPtAudio = getPortugueseAudioScore(stream) > 0;
        const hasPtSubtitle = getPortugueseSubtitleScore(stream) > 0;
        return availability >= 35 || (hasPtAudio && availability >= 15) || (hasPtSubtitle && availability >= 25);
    };

    const getSourceStrength = (stream: Stream) => {
        const availability = getAvailabilityScore(stream);
        const hasPtAudio = getPortugueseAudioScore(stream) > 0;
        const hasPtSubtitle = getPortugueseSubtitleScore(stream) > 0;

        if ((hasPtAudio && availability >= 40) || availability >= 80) {
            return { label: 'Forte', className: 'text-emerald-200 bg-emerald-500/20' };
        }

        if ((hasPtAudio && availability >= 15) || (hasPtSubtitle && availability >= 25) || availability >= 35) {
            return { label: 'Media', className: 'text-sky-200 bg-sky-500/20' };
        }

        return { label: 'Fraca', className: 'text-amber-200 bg-amber-500/20' };
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

                if (type === 'series') {
                    const aSpecificity = getSeriesEpisodeSpecificity(a);
                    const bSpecificity = getSeriesEpisodeSpecificity(b);
                    if (aSpecificity !== bSpecificity) return bSpecificity - aSpecificity;
                }

                const aAvailability = getAvailabilityScore(a);
                const bAvailability = getAvailabilityScore(b);
                if (Math.abs(aAvailability - bAvailability) >= 25) return bAvailability - aAvailability;

                const aPriority = addonPriority(a.addonName) + getAddonPortugueseBonus(a);
                const bPriority = addonPriority(b.addonName) + getAddonPortugueseBonus(b);
                if (aPriority !== bPriority) return bPriority - aPriority;

                const aP2P = a.infoHash || a.url?.startsWith('magnet:') ? 1 : 0;
                const bP2P = b.infoHash || b.url?.startsWith('magnet:') ? 1 : 0;
                if (type === 'series' && aP2P !== bP2P) return bP2P - aP2P;

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
            if (onlyPortuguese && getPortugueseAudioScore(stream) <= 0 && getPortugueseSubtitleScore(stream) <= 0) {
                return false;
            }
            if (onlyStrongSources && !isStrongSource(stream)) {
                return false;
            }
            if (!query) return true;

            const haystack = getStreamText(stream);
            return haystack.includes(query);
        });
    }, [rankedStreams, selectedAddon, streamQuery, onlyPortuguese, onlyStrongSources]);

    const streamSummary = useMemo(() => {
        const portugueseAudio = filteredStreams.filter((stream) => getPortugueseAudioScore(stream) > 0).length;
        const portugueseSubtitle = filteredStreams.filter((stream) => getPortugueseSubtitleScore(stream) > 0).length;
        const p2pCount = filteredStreams.filter((stream) => stream.infoHash || stream.url?.startsWith('magnet:')).length;
        const providerCount = new Set(filteredStreams.map((stream) => extractProviderLabel(stream)).filter(Boolean)).size;
        const respondingAddons = new Set(filteredStreams.map((stream) => stream.addonName || 'Unknown Addon')).size;
        const totalPeers = filteredStreams.reduce((sum, stream) => sum + (extractSwarmStats(stream).peers || 0), 0);
        const totalSeeds = filteredStreams.reduce((sum, stream) => sum + (extractSwarmStats(stream).seeds || 0), 0);
        const activeSwarmSources = filteredStreams.filter((stream) => getAvailabilityScore(stream) > 0).length;
        const trustedByArconte = filteredStreams.filter((stream) => !!stream.arconteSignal?.trustLevel).length;
        return {
            total: filteredStreams.length,
            portugueseAudio,
            portugueseSubtitle,
            p2pCount,
            providerCount,
            respondingAddons,
            totalPeers,
            totalSeeds,
            activeSwarmSources,
            trustedByArconte,
        };
    }, [filteredStreams]);

    const availabilityHint = useMemo(() => {
        if (streamSummary.portugueseAudio > 0) {
            return {
                tone: 'emerald',
                label: `${streamSummary.portugueseAudio} fonte(s) com audio PT-BR real`,
            };
        }

        if (streamSummary.portugueseSubtitle > 0) {
            return {
                tone: 'sky',
                label: `Sem audio PT-BR real. So legenda PT em ${streamSummary.portugueseSubtitle} fonte(s).`,
            };
        }

        return {
            tone: 'amber',
            label: 'Nenhuma fonte com PT-BR real encontrada neste recorte.',
        };
    }, [streamSummary]);

    const bestStreamKey = useMemo(() => {
        const best = filteredStreams[0];
        if (!best) return null;
        return best.infoHash || best.url || `${best.addonName || 'addon'}:${best.title || best.name || 'stream'}`;
    }, [filteredStreams]);

    const shouldAutoSelectBest = useMemo(() => {
        if (disableAutoSelect) return false;
        const best = filteredStreams[0];
        if (!best || activeStream || loading || !!error) return false;
        if (selectedAddon !== 'all' || streamQuery.trim().length > 0) return false;

        const isPlayable = !!(best.url || best.infoHash || best.ytId);
        if (!isPlayable) return false;

        const hasPortugueseValue = getPortugueseAudioScore(best) > 0 || getPortugueseSubtitleScore(best) > 0;
        const strength = getSourceStrength(best).label;
        const trustLevel = best.arconteSignal?.trustLevel;
        const availability = getAvailabilityScore(best);
        const seriesSpecificity = type === 'series' ? getSeriesEpisodeSpecificity(best) : 0;
        const confidenceTone = ((getPortugueseAudioScore(best) > 0 && availability >= 40) || availability >= 80)
            ? 'emerald'
            : (((getPortugueseAudioScore(best) > 0 && availability >= 15) || (getPortugueseSubtitleScore(best) > 0 && availability >= 25) || availability >= 35)
                ? 'sky'
                : 'amber');

        if (type === 'series') {
            if (seriesSpecificity < 60) return false;
            if ((preferPortugueseAudio || acceptPortugueseSubtitles) && !hasPortugueseValue) return false;
        }

        return (
            (trustLevel === 'high' && (strength === 'Forte' || hasPortugueseValue)) ||
            (confidenceTone === 'emerald' && hasPortugueseValue)
        );
    }, [disableAutoSelect, filteredStreams, activeStream, loading, error, selectedAddon, streamQuery, type, preferPortugueseAudio, acceptPortugueseSubtitles]);

    const confidenceHint = useMemo(() => {
        const best = filteredStreams[0];
        if (!best) {
            return {
                tone: 'slate',
                label: 'Sem fonte forte no momento',
            };
        }

        const availability = getAvailabilityScore(best);
        const hasPtAudio = getPortugueseAudioScore(best) > 0;
        const hasPtSubtitle = getPortugueseSubtitleScore(best) > 0;

        if ((hasPtAudio && availability >= 40) || availability >= 80) {
            return {
                tone: 'emerald',
                label: 'Alta chance de rodar agora',
            };
        }

        if ((hasPtAudio && availability >= 15) || (hasPtSubtitle && availability >= 25) || availability >= 35) {
            return {
                tone: 'sky',
                label: 'Chance media de rodar bem',
            };
        }

        return {
            tone: 'amber',
            label: 'Fonte fraca ou instavel',
        };
    }, [filteredStreams]);

    const bestSourceSummary = useMemo(() => {
        const best = filteredStreams[0];
        if (!best) return null;

        const provider = extractProviderLabel(best) || best.addonName || 'Fonte desconhecida';
        const swarmStats = extractSwarmStats(best);
        const sourceStrength = getSourceStrength(best);

        return {
            provider,
            addonName: best.addonName || 'Addon',
            peers: swarmStats.peers,
            seeds: swarmStats.seeds,
            swarm: swarmStats.swarm,
            sourceStrength,
        };
    }, [filteredStreams]);

    const fetchStreams = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [results, addons] = await Promise.all([
                addonService.getStreams(type, id, title, {
                    preferPortugueseAudio,
                    acceptPortugueseSubtitles,
                    userId: user?.id,
                }),
                addonService.getAddons(),
            ]);
            setStreams(Array.isArray(results) ? results : []);
            setConfiguredAddonCount(addons.filter((addon) => addon.enabled).length);
        } catch (err) {
            console.error(err);
            setError('Falha ao buscar streams nos addons.');
        } finally {
            setLoading(false);
        }
    }, [type, id, title, preferPortugueseAudio, acceptPortugueseSubtitles, user?.id]);

    useEffect(() => {
        if (!isOpen || !shouldAutoSelectBest || !filteredStreams[0]) return;
        setActiveStream(filteredStreams[0]);
        setAutoSelectedByArconte(true);
    }, [isOpen, shouldAutoSelectBest, filteredStreams]);

    const handleStreamSelect = (stream: Stream) => {
        if (stream.url || stream.infoHash || stream.ytId) {
            setActiveStream(stream);
            setAutoSelectedByArconte(false);
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
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <p className="text-xs text-white/50">{activeStream.addonName}</p>
                            {autoSelectedByArconte && (
                                <span className="text-[10px] uppercase font-black tracking-widest text-amber-200 bg-amber-500/15 px-2 py-0.5 rounded-full">
                                    Auto selecionada pelo Arconte
                                </span>
                            )}
                            {activeStream.arconteSignal?.label && (
                                <span className={`text-[10px] uppercase font-black tracking-widest px-2 py-0.5 rounded-full ${
                                    activeStream.arconteSignal?.trustLevel === 'high'
                                        ? 'text-amber-200 bg-amber-500/15'
                                        : activeStream.arconteSignal?.trustLevel === 'medium'
                                            ? 'text-cyan-200 bg-cyan-500/15'
                                            : 'text-white/70 bg-white/5'
                                }`}>
                                    {activeStream.arconteSignal.label}
                                </span>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            setActiveStream(null);
                            setAutoSelectedByArconte(false);
                        }}
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4">
            <div
                onClick={onClose}
                className="absolute inset-0 bg-black/90 backdrop-blur-xl transition-opacity"
            />

            <div className="relative w-full max-w-5xl bg-[#0f0f1a] border border-white/10 rounded-[1.5rem] sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[92vh] sm:h-[85vh]">
                {activeStream ? (
                    renderPlayer()
                ) : (
                    <>
                        <div className="p-4 sm:p-8 border-b border-white/5 bg-gradient-to-r from-cyan-900/20 to-blue-900/20 flex justify-between items-start gap-4">
                            <div className="min-w-0">
                                <div className="flex items-center gap-3 mb-2 min-w-0">
                                    <div className="p-2 bg-cyan-500/10 rounded-lg text-cyan-400">
                                        {type === 'movie' ? <Film size={20} /> : <Tv size={20} />}
                                    </div>
                                    <h2 className="text-lg sm:text-2xl font-black uppercase italic tracking-tight text-white truncate">{title}</h2>
                                </div>
                                <p className="text-xs sm:text-sm text-white/40 pl-1">
                                    Selecione uma fonte de transmissao via addon
                                </p>
                                {!loading && !error && rankedStreams.length > 0 && (
                                    <div className="flex flex-col gap-3 mt-4 pl-1">
                                        <div className={`text-[10px] uppercase font-black tracking-widest px-3 py-2 rounded-xl border ${
                                            availabilityHint.tone === 'emerald'
                                                ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20'
                                                : availabilityHint.tone === 'sky'
                                                    ? 'text-sky-300 bg-sky-500/10 border-sky-500/20'
                                                    : 'text-amber-300 bg-amber-500/10 border-amber-500/20'
                                        }`}>
                                            {availabilityHint.label}
                                        </div>
                                        <div className={`text-[10px] uppercase font-black tracking-widest px-3 py-2 rounded-xl border ${
                                            confidenceHint.tone === 'emerald'
                                                ? 'text-emerald-200 bg-emerald-500/10 border-emerald-500/20'
                                                : confidenceHint.tone === 'sky'
                                                    ? 'text-sky-200 bg-sky-500/10 border-sky-500/20'
                                                    : confidenceHint.tone === 'amber'
                                                        ? 'text-amber-200 bg-amber-500/10 border-amber-500/20'
                                                        : 'text-white/70 bg-white/5 border-white/10'
                                        }`}>
                                            {confidenceHint.label}
                                        </div>
                                        {bestSourceSummary && (
                                            <div className="text-[11px] text-white/80 bg-white/5 border border-white/10 rounded-xl px-3 py-3">
                                                <span className="font-black uppercase tracking-widest text-white">Melhor fonte agora</span>
                                                <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase font-black tracking-widest">
                                                    <span className="text-cyan-200 bg-cyan-500/15 px-2 py-1 rounded-full">
                                                        {bestSourceSummary.provider}
                                                    </span>
                                                    <span className="text-white/70 bg-white/5 px-2 py-1 rounded-full">
                                                        via {bestSourceSummary.addonName}
                                                    </span>
                                                    {bestSourceSummary.peers ? (
                                                        <span className="text-lime-200 bg-lime-500/15 px-2 py-1 rounded-full">
                                                            {bestSourceSummary.peers} peers ativos
                                                        </span>
                                                    ) : null}
                                                    {bestSourceSummary.seeds ? (
                                                        <span className="text-sky-200 bg-sky-500/15 px-2 py-1 rounded-full">
                                                            {bestSourceSummary.seeds} seeds
                                                        </span>
                                                    ) : null}
                                                    {!bestSourceSummary.peers && !bestSourceSummary.seeds && bestSourceSummary.swarm > 0 ? (
                                                        <span className="text-violet-200 bg-violet-500/15 px-2 py-1 rounded-full">
                                                            swarm {bestSourceSummary.swarm}
                                                        </span>
                                                    ) : null}
                                                    <span className={`px-2 py-1 rounded-full ${bestSourceSummary.sourceStrength.className}`}>
                                                        forca {bestSourceSummary.sourceStrength.label}
                                                    </span>
                                                    {filteredStreams[0]?.arconteSignal?.label && (
                                                        <span className={`px-2 py-1 rounded-full ${
                                                            filteredStreams[0]?.arconteSignal?.trustLevel === 'high'
                                                                ? 'text-amber-200 bg-amber-500/15'
                                                                : filteredStreams[0]?.arconteSignal?.trustLevel === 'medium'
                                                                    ? 'text-cyan-200 bg-cyan-500/15'
                                                                    : 'text-white/70 bg-white/5'
                                                        }`}>
                                                            {filteredStreams[0]?.arconteSignal?.label}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                        <div className="flex flex-wrap gap-2 overflow-x-auto pb-1 sm:pb-0">
                                        {configuredAddonCount > 0 && (
                                            <span className="text-[10px] uppercase font-black tracking-widest text-white/70 bg-white/5 px-3 py-1 rounded-full">
                                                {configuredAddonCount} addons ativos
                                            </span>
                                        )}
                                        {streamSummary.respondingAddons > 0 && (
                                            <span className="text-[10px] uppercase font-black tracking-widest text-cyan-300 bg-cyan-500/15 px-3 py-1 rounded-full">
                                                {streamSummary.respondingAddons} addons responderam
                                            </span>
                                        )}
                                        {streamSummary.providerCount > 0 && (
                                            <span className="text-[10px] uppercase font-black tracking-widest text-fuchsia-300 bg-fuchsia-500/15 px-3 py-1 rounded-full">
                                                {streamSummary.providerCount} provedores
                                            </span>
                                        )}
                                        {streamSummary.activeSwarmSources > 0 && (
                                            <span className="text-[10px] uppercase font-black tracking-widest text-emerald-300 bg-emerald-500/15 px-3 py-1 rounded-full">
                                                {streamSummary.activeSwarmSources} com swarm ativo
                                            </span>
                                        )}
                                        {streamSummary.trustedByArconte > 0 && (
                                            <span className="text-[10px] uppercase font-black tracking-widest text-amber-300 bg-amber-500/15 px-3 py-1 rounded-full">
                                                {streamSummary.trustedByArconte} com confianca do Arconte
                                            </span>
                                        )}
                                        {streamSummary.totalPeers > 0 && (
                                            <span className="text-[10px] uppercase font-black tracking-widest text-lime-300 bg-lime-500/15 px-3 py-1 rounded-full">
                                                {streamSummary.totalPeers} peers visiveis
                                            </span>
                                        )}
                                        {streamSummary.totalSeeds > 0 && (
                                            <span className="text-[10px] uppercase font-black tracking-widest text-sky-300 bg-sky-500/15 px-3 py-1 rounded-full">
                                                {streamSummary.totalSeeds} seeds visiveis
                                            </span>
                                        )}
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
                                    </div>
                                )}
                            </div>
                            <button onClick={onClose} className="p-2 text-white/40 hover:text-white transition-colors">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-8">
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
                                        <div className="flex flex-wrap gap-2 overflow-x-auto pb-1 sm:pb-0">
                                            <button
                                                onClick={() => setPreferPortugueseAudio(!preferPortugueseAudio)}
                                                className={`px-3 py-1.5 rounded-lg text-[10px] uppercase font-black tracking-widest transition-colors ${preferPortugueseAudio ? 'bg-emerald-500 text-black' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                                            >
                                                Preferir audio PT-BR
                                            </button>
                                            <button
                                                onClick={() => setAcceptPortugueseSubtitles(!acceptPortugueseSubtitles)}
                                                className={`px-3 py-1.5 rounded-lg text-[10px] uppercase font-black tracking-widest transition-colors ${acceptPortugueseSubtitles ? 'bg-sky-500 text-black' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                                            >
                                                Aceitar legenda PT
                                            </button>
                                            <button
                                                onClick={() => setSelectedAddon('all')}
                                                className={`px-3 py-1.5 rounded-lg text-[10px] uppercase font-black tracking-widest transition-colors ${selectedAddon === 'all' ? 'bg-cyan-500 text-black' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                                            >
                                                Todos ({rankedStreams.length})
                                            </button>
                                            <button
                                                onClick={() => setOnlyPortuguese((current) => !current)}
                                                className={`px-3 py-1.5 rounded-lg text-[10px] uppercase font-black tracking-widest transition-colors ${onlyPortuguese ? 'bg-emerald-500 text-black' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                                            >
                                                So PT-BR
                                            </button>
                                            <button
                                                onClick={() => setOnlyStrongSources((current) => !current)}
                                                className={`px-3 py-1.5 rounded-lg text-[10px] uppercase font-black tracking-widest transition-colors ${onlyStrongSources ? 'bg-cyan-400 text-black' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                                            >
                                                So fontes fortes
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
                                        (() => {
                                            const swarmStats = extractSwarmStats(stream);
                                            const providerLabel = extractProviderLabel(stream);
                                            const streamKey = stream.infoHash || stream.url || `${stream.addonName || 'addon'}:${stream.title || stream.name || 'stream'}`;
                                            const isBestNow = streamKey === bestStreamKey;
                                            const sourceStrength = getSourceStrength(stream);
                                            return (
                                        <motion.div
                                            key={`${stream.addonName || 'addon'}-${idx}`}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: idx * 0.05 }}
                                            className={`group flex items-center justify-between p-4 rounded-xl transition-all ${
                                                isBestNow
                                                    ? 'bg-cyan-500/10 border border-cyan-400/40 shadow-[0_0_0_1px_rgba(34,211,238,0.15)]'
                                                    : 'bg-white/5 hover:bg-white/10 border border-white/5 hover:border-cyan-500/30'
                                            }`}
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
                                                        {isBestNow && (
                                                            <span className="text-[9px] uppercase font-black text-cyan-200 bg-cyan-500/20 px-2 py-0.5 rounded-sm">
                                                                Melhor agora
                                                            </span>
                                                        )}
                                                        <span className={`text-[9px] uppercase font-black px-2 py-0.5 rounded-sm ${sourceStrength.className}`}>
                                                            {sourceStrength.label}
                                                        </span>
                                                        {stream.arconteSignal?.label && (
                                                            <span className={`text-[9px] uppercase font-black px-2 py-0.5 rounded-sm ${
                                                                stream.arconteSignal?.trustLevel === 'high'
                                                                    ? 'text-amber-200 bg-amber-500/15'
                                                                    : stream.arconteSignal?.trustLevel === 'medium'
                                                                        ? 'text-cyan-200 bg-cyan-500/15'
                                                                        : 'text-white/70 bg-white/5'
                                                            }`}>
                                                                {stream.arconteSignal.label}
                                                            </span>
                                                        )}
                                                        <span className="text-[10px] uppercase font-black tracking-widest text-white/30 bg-white/5 px-2 py-0.5 rounded-sm">
                                                            {stream.addonName || 'Unknown Addon'}
                                                        </span>
                                                        {providerLabel && (
                                                            <span className="text-[9px] uppercase font-black text-fuchsia-300 bg-fuchsia-500/15 px-2 py-0.5 rounded-sm">
                                                                {providerLabel}
                                                            </span>
                                                        )}
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
                                                        {getPortugueseAudioScore(stream) <= 0 && getPortugueseSubtitleScore(stream) > 0 && (
                                                            <span className="text-[9px] uppercase font-black text-sky-300 bg-sky-500/15 px-2 py-0.5 rounded-sm">
                                                                So legenda PT
                                                            </span>
                                                        )}
                                                        {getPortugueseAudioScore(stream) <= 0 && hasGenericMultiAudio(stream) && (
                                                            <span className="text-[9px] uppercase font-black text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded-sm">
                                                                Dual Audio
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
                                                        {swarmStats.peers !== null && (
                                                            <span className="text-[9px] uppercase font-black text-white/70 bg-white/5 px-2 py-0.5 rounded-sm">
                                                                {swarmStats.peers} peers
                                                            </span>
                                                        )}
                                                        {swarmStats.seeds !== null && (
                                                            <span className="text-[9px] uppercase font-black text-emerald-300 bg-emerald-500/15 px-2 py-0.5 rounded-sm">
                                                                {swarmStats.seeds} seeds
                                                            </span>
                                                        )}
                                                        {swarmStats.peers === null && swarmStats.seeds === null && swarmStats.swarm > 0 && (
                                                            <span className="text-[9px] uppercase font-black text-white/70 bg-white/5 px-2 py-0.5 rounded-sm">
                                                                swarm {swarmStats.swarm}
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
                                            );
                                        })()
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
