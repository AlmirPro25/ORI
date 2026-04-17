/**
 * 📺 SERIES DETAILS PAGE
 * Página de detalhes de uma série com seletor de temporadas,
 * lista de episódios e ações de download.
 */

import React, { useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Tv, Loader2, Download, ArrowLeft, Calendar,
    Film, ChevronDown, Layers, DownloadCloud,
    CheckCircle, AlertCircle
} from 'lucide-react';
import { useSeriesDetails } from '@/hooks/useSeries';
import { useDiscoveryFeed } from '@/hooks/useDiscovery';
import { EpisodeCard } from '@/components/EpisodeCard';
import { AddonStreamDialog } from '@/components/AddonStreamDialog';
import SeriesService from '@/services/api/series.service';
import { Episode } from '@/types/series';
import { addonService } from '@/services/addon.service';
import { usePlaybackPreferencesStore } from '@/stores/playbackPreferences.store';
import { useAuthStore } from '@/stores/auth.store';
import { EpisodeMaterializationResponse, SeriesDownloadResponse, VideoSelectionTelemetrySnapshot } from '@/types/series';
import { getPtbrSignalSummary } from '@/lib/ptbr-coverage';

export const SeriesDetailsPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { series, loading, error, refresh } = useSeriesDetails(id);
    const { feed } = useDiscoveryFeed();
    const [selectedSeason, setSelectedSeason] = useState(1);
    const [downloading, setDownloading] = useState(false);
    const [showPtbrSignalDetails, setShowPtbrSignalDetails] = useState(false);
    const [seasonDropdownOpen, setSeasonDropdownOpen] = useState(false);
    const [addonDialog, setAddonDialog] = useState<{ isOpen: boolean; id: string; title: string }>({
        isOpen: false,
        id: '',
        title: '',
    });
    const [addonTargetEpisode, setAddonTargetEpisode] = useState<Episode | null>(null);
    const [autoResolvingEpisodeId, setAutoResolvingEpisodeId] = useState<string | null>(null);
    const [seriesResolutionStatus, setSeriesResolutionStatus] = useState<{
        scope: 'episode' | 'season' | 'series';
        message: string;
        source: 'nexus' | 'addons' | 'local';
        details?: string[];
    } | null>(null);
    const [videoSelectionInsight, setVideoSelectionInsight] = useState<{
        videoId: string;
        message: string;
        details: string[];
    } | null>(null);
    const [episodeLanguageHints, setEpisodeLanguageHints] = useState<Record<string, {
        tone: 'strong' | 'subtitle' | 'weak';
        label: string;
    }>>({});
    const loadedVideoSelectionIdsRef = useRef<Set<string>>(new Set());
    const { preferPortugueseAudio, acceptPortugueseSubtitles } = usePlaybackPreferencesStore();
    const { user } = useAuthStore();

    const currentSeason = useMemo(() => {
        return series?.seasons?.find(s => s.seasonNumber === selectedSeason);
    }, [series, selectedSeason]);

    const currentEpisodes = useMemo(() => {
        return currentSeason?.episodes || [];
    }, [currentSeason]);
    const discoverySeriesSignal = useMemo(() => {
        const item = (feed?.series || []).find((entry) => entry.kind === 'series' && entry.id === id) || null;
        return getPtbrSignalSummary(item);
    }, [feed, id]);

    // Statistics
    const stats = useMemo(() => {
        if (!series?.seasons) return { total: 0, ready: 0, downloading: 0 };
        const allEps = series.seasons.flatMap(s => s.episodes || []);
        return {
            total: allEps.length,
            ready: allEps.filter(e => e.status === 'READY').length,
            downloading: allEps.filter(e => ['DOWNLOADING', 'PROCESSING', 'QUEUED'].includes(e.status)).length,
        };
    }, [series]);

    const buildVideoSelectionInsight = useCallback((telemetry: VideoSelectionTelemetrySnapshot, videoId: string) => {
        const videoStats = telemetry.videos.find((item) => item.videoId === videoId);
        const latestSample = telemetry.recentSamples.find((item) => item.videoId === videoId);
        if (!videoStats || !latestSample) {
            return null;
        }

        const audioRate = telemetry.adaptivePatterns
            ?.filter((pattern) => latestSample.selectedFile.toLowerCase().includes('1080') ? pattern.pattern === 'quality:1080p' : true)
            .reduce((best, pattern) => Math.max(best, Number(pattern.audioPtBrRate || 0)), 0) || 0;
        const subtitleRate = telemetry.adaptivePatterns
            ?.reduce((best, pattern) => Math.max(best, Number(pattern.subtitlePtBrRate || 0)), 0) || 0;

        const details = [
            `Arquivo escolhido: ${latestSample.selectedFile}`,
            `Historico do video: ${videoStats.completed} completo(s), ${videoStats.fallbacks} fallback(s), ${videoStats.failed} falha(s)`,
        ];

        if (audioRate > 0 || subtitleRate > 0) {
            details.push(`Entrega historica PT-BR: audio ${audioRate.toFixed(0)}% | legenda ${subtitleRate.toFixed(0)}%`);
        }

        return {
            videoId,
            message: audioRate >= 50
                ? 'Esse padrao de arquivo costuma fechar com PT-BR real com boa frequencia.'
                : subtitleRate >= 50
                    ? 'Esse padrao de arquivo costuma fechar mais com legenda PT-BR do que com audio PT-BR.'
                    : 'Ainda temos pouco historico PT-BR confirmado para esse padrao de arquivo.',
            details,
        };
    }, []);

    const buildEpisodeLanguageHint = useCallback((telemetry: VideoSelectionTelemetrySnapshot, videoId: string) => {
        const videoStats = telemetry.videos.find((item) => item.videoId === videoId);
        if (!videoStats) {
            return null;
        }

        const audioHits = Number(videoStats.verifiedPtBrAudio || 0);
        const subtitleHits = Number(videoStats.verifiedPtBrSubtitle || 0);
        const samples = Math.max(1, Number(videoStats.samples || 0));
        const audioRate = (audioHits / samples) * 100;
        const subtitleRate = (subtitleHits / samples) * 100;

        if (audioRate >= 50) {
            return { tone: 'strong' as const, label: `PT-BR forte ${audioRate.toFixed(0)}%` };
        }
        if (subtitleRate >= 50) {
            return { tone: 'subtitle' as const, label: `Mais legenda ${subtitleRate.toFixed(0)}%` };
        }

        return { tone: 'weak' as const, label: 'Historico PT-BR fraco' };
    }, []);

    const handleDownloadSeason = useCallback(async () => {
        if (!id || downloading) return;
        setDownloading(true);
        try {
            const result = await SeriesService.downloadSeason(id, selectedSeason);
            const typedResult = result as SeriesDownloadResponse;
            setSeriesResolutionStatus({
                scope: 'season',
                message: typedResult.usedNexusDiscovery
                    ? `Temporada ${selectedSeason} resolveu ${typedResult.resolvedCount || 0} episodio(s) via Nexus antes da fila.`
                    : `Temporada ${selectedSeason} enviada para a fila com base nas fontes ja resolvidas.`,
                source: typedResult.usedNexusDiscovery ? 'nexus' : 'local',
                details: typedResult.usedNexusDiscovery
                    ? [`Resolvidos via Nexus: ${typedResult.resolvedCount || 0}`]
                    : ['Sem descoberta externa adicional nesta rodada.'],
            });
            setTimeout(() => refresh(), 1000);
        } catch (err) {
            console.error('Download season error:', err);
        } finally {
            setDownloading(false);
        }
    }, [id, selectedSeason, downloading, refresh]);

    const handleDownloadSeries = useCallback(async () => {
        if (!id || downloading) return;
        setDownloading(true);
        try {
            const result = await SeriesService.downloadSeries(id);
            const typedResult = result as SeriesDownloadResponse;
            setSeriesResolutionStatus({
                scope: 'series',
                message: typedResult.usedNexusDiscovery
                    ? `Serie completa usando Nexus para resolver ${typedResult.resolvedCount || 0} episodio(s) antes do download.`
                    : 'Serie completa enviada para a fila com base nas fontes ja conhecidas.',
                source: typedResult.usedNexusDiscovery ? 'nexus' : 'local',
                details: typedResult.usedNexusDiscovery
                    ? [`Resolvidos via Nexus: ${typedResult.resolvedCount || 0}`]
                    : ['Sem descoberta externa adicional nesta rodada.'],
            });
            setTimeout(() => refresh(), 1000);
        } catch (err) {
            console.error('Download series error:', err);
        } finally {
            setDownloading(false);
        }
    }, [id, downloading, refresh]);

    const handleOpenEpisodeAddons = useCallback((episode: Episode) => {
        if (!series) return;

        const baseId = series.imdbId || (series.tmdbId ? String(series.tmdbId) : '');
        if (!baseId) return;

        setAddonDialog({
            isOpen: true,
            id: `${baseId}:${episode.seasonNumber}:${episode.episodeNumber}`,
            title: `${series.title} S${String(episode.seasonNumber).padStart(2, '0')}E${String(episode.episodeNumber).padStart(2, '0')} - ${episode.title}`,
        });
        setAddonTargetEpisode(episode);
    }, [series]);

    const waitForEpisodeReady = useCallback(async (episodeId: string, attempts = 12, delayMs = 1500) => {
        for (let attempt = 0; attempt < attempts; attempt += 1) {
            const latestEpisode = await SeriesService.getEpisode(episodeId);
            if (latestEpisode.status === 'READY') {
                return latestEpisode;
            }

            await new Promise((resolve) => window.setTimeout(resolve, delayMs));
        }

        return null;
    }, []);

    const pickBestEpisodeStream = useCallback((streams: any[], episode: Episode) => {
        const normalizedTitle = `${series?.title || ''} S${String(episode.seasonNumber).padStart(2, '0')}E${String(episode.episodeNumber).padStart(2, '0')} ${episode.title || ''}`
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();

        const scoreStream = (stream: any) => {
            const text = [
                stream.title,
                stream.name,
                stream.description,
                stream.behaviorHints?.filename,
                stream.addonName,
            ]
                .filter(Boolean)
                .join(' ')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase();

            let score = 0;
            const prefersPortuguese = preferPortugueseAudio || acceptPortugueseSubtitles;
            const hasPtAudio = /\bdublado\b|\bpt-br\b|\bptbr\b|\bportugues\b|\bportuguese\b/.test(text);
            const hasPtSubtitle = /\blegenda pt\b|\blegenda pt-br\b|\bsub pt\b|\bsub pt-br\b|\bsubtitle pt\b|\blegendado\b/.test(text);
            const looksLikeSeasonPack = /\btemporada completa\b|\bcomplete season\b|\bseason pack\b|\bpack\b/.test(text);
            const looksLikeMultiEpisodePack = /\bs\d{2}e\d{2}\s*[-_]\s*e?\d{2}\b|\b\d{1,2}x\d{1,2}\s*[-_]\s*\d{1,2}\b/.test(text);

            if (/\bs\d{2}e\d{2}\b/.test(normalizedTitle)) {
                const match = normalizedTitle.match(/s(\d{2})e(\d{2})/);
                if (match) {
                    const [, season, ep] = match;
                    const seasonNum = String(Number(season));
                    const epNum = String(Number(ep));

                    if (
                        text.includes(`s${season}e${ep}`) ||
                        text.includes(`${seasonNum}x${epNum}`) ||
                        text.includes(`episode ${epNum}`) ||
                        text.includes(`episodio ${epNum}`)
                    ) {
                        score += 120;
                    } else {
                        score -= 120;
                    }

                    if (text.includes(`temporada ${seasonNum}`) || text.includes(`season ${seasonNum}`)) {
                        score -= 10;
                    }
                }
            }

            if (looksLikeSeasonPack) score -= 140;
            if (looksLikeMultiEpisodePack) score -= 120;

            if (hasPtAudio) score += 120;
            if (hasPtSubtitle) score += 45;
            if (prefersPortuguese && !hasPtAudio && !hasPtSubtitle) score -= 80;
            if (/\b1080\b/.test(text)) score += 20;
            if (/\b720\b/.test(text)) score += 10;
            if (/\btorrentio\b/.test(text)) score += 25;
            if (stream.infoHash || stream.url?.startsWith('magnet:')) score += 15;

            const swarmNumbers = [...text.matchAll(/(?:peer|seed|👤)[^\d]{0,6}(\d{1,5})/g)].map((m) => Number(m[1] || 0));
            if (swarmNumbers.length > 0) {
                score += Math.max(...swarmNumbers.slice(0, 3));
            }

            return score;
        };

        return [...streams]
            .filter((stream) => !!(stream?.url || stream?.infoHash))
            .sort((a, b) => scoreStream(b) - scoreStream(a))[0] || null;
    }, [acceptPortugueseSubtitles, preferPortugueseAudio, series?.title]);

    const handleWatchEpisode = useCallback(async (episode: Episode) => {
        if (episode.status === 'READY') {
            navigate(`/series/episode/${episode.id}`);
            return;
        }

        if (!series) return;

        const baseId = series.imdbId || (series.tmdbId ? String(series.tmdbId) : '');
        if (!baseId) {
            handleOpenEpisodeAddons(episode);
            return;
        }

        const lookupId = `${baseId}:${episode.seasonNumber}:${episode.episodeNumber}`;
        const displayTitle = `${series.title} S${String(episode.seasonNumber).padStart(2, '0')}E${String(episode.episodeNumber).padStart(2, '0')} - ${episode.title}`;

        setAutoResolvingEpisodeId(episode.id);
        setSeriesResolutionStatus({
            scope: 'episode',
            message: `Buscando ${series.title} S${String(episode.seasonNumber).padStart(2, '0')}E${String(episode.episodeNumber).padStart(2, '0')} na malha Nexus e nos addons...`,
            source: 'nexus',
            details: ['Preparando plano de busca por episodio e season pack.'],
        });
        setVideoSelectionInsight(null);
        try {
            if (['DOWNLOADING', 'PROCESSING', 'QUEUED'].includes(episode.status)) {
                const readyEpisode = await waitForEpisodeReady(episode.id, 10, 1500);
                if (readyEpisode) {
                    await refresh();
                    navigate(`/series/episode/${readyEpisode.id}`);
                    return;
                }

                await refresh();
                return;
            }

            try {
                const result = await SeriesService.materializeEpisodeFromAddon(episode.id, {});
                const typedResult = result as EpisodeMaterializationResponse;
                const trace = typedResult.resolutionTrace;
                let selectionInsight: {
                    videoId: string;
                    message: string;
                    details: string[];
                } | null = null;

                if (typedResult.videoId) {
                    try {
                        const telemetry = await SeriesService.getVideoSelectionTelemetry(typedResult.videoId);
                        selectionInsight = buildVideoSelectionInsight(telemetry, typedResult.videoId);
                        const languageHint = buildEpisodeLanguageHint(telemetry, typedResult.videoId);
                        if (languageHint) {
                            setEpisodeLanguageHints((current) => ({
                                ...current,
                                [episode.id]: languageHint,
                            }));
                        }
                    } catch (telemetryError) {
                        console.warn('Video selection telemetry unavailable:', telemetryError);
                    }
                }
                setSeriesResolutionStatus({
                    scope: 'episode',
                    message: typedResult.usedNexusDiscovery
                        ? `Fonte resolvida via ${typedResult.sourceSite || 'Nexus Series'}. Materializacao iniciada.`
                        : `Materializacao iniciada com fonte ja conhecida${typedResult.sourceSite ? ` em ${typedResult.sourceSite}` : ''}.`,
                    source: typedResult.usedNexusDiscovery ? 'nexus' : 'local',
                    details: trace ? [
                        `Consultas Nexus: ${(trace.queryAttempts || []).length}`,
                        `Candidatos Nexus: ${trace.nexusCandidates || 0}`,
                        `Fallback addons: ${trace.addonCandidates || 0}`,
                        `Escolha: ${trace.selectedSourceSite || 'desconhecida'}${trace.selectedTitle ? ` - ${trace.selectedTitle}` : ''}`,
                        ...(selectionInsight?.details || []),
                    ] : selectionInsight?.details,
                });
                setVideoSelectionInsight(selectionInsight);
                const readyEpisode = await waitForEpisodeReady(episode.id, 12, 1500);
                await refresh();

                if (readyEpisode) {
                    navigate(`/series/episode/${readyEpisode.id}`);
                    return;
                }
            } catch (autoResolveError) {
                console.warn('Episode backend auto-resolve fallbacking to addons:', autoResolveError);
                setSeriesResolutionStatus({
                    scope: 'episode',
                    message: 'A resolucao automatica nao fechou sozinha. Abrindo a camada de addons para completar a busca.',
                    source: 'addons',
                    details: ['O backend nao fechou uma fonte sozinho nesta tentativa.'],
                });
            }

            const results = await addonService.getStreams('series', lookupId, displayTitle, {
                preferPortugueseAudio,
                acceptPortugueseSubtitles,
                userId: user?.id,
            });

            const streams = Array.isArray(results) ? results : Array.isArray(results?.streams) ? results.streams : [];
            const bestStream = pickBestEpisodeStream(streams, episode);

            const bestStreamText = [
                bestStream?.title,
                bestStream?.name,
                bestStream?.description,
                bestStream?.behaviorHints?.filename,
            ]
                .filter(Boolean)
                .join(' ')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase();

            const bestHasPortugueseValue = /\bdublado\b|\bpt-br\b|\bptbr\b|\bportugues\b|\bportuguese\b|\blegenda pt\b|\bsub pt\b|\blegendado\b/.test(bestStreamText);

            if (!bestStream || ((preferPortugueseAudio || acceptPortugueseSubtitles) && !bestHasPortugueseValue)) {
                handleOpenEpisodeAddons(episode);
                return;
            }

            const magnetURI = bestStream.url?.startsWith('magnet:')
                ? bestStream.url
                : (bestStream.infoHash ? `magnet:?xt=urn:btih:${bestStream.infoHash}` : undefined);

            await SeriesService.materializeEpisodeFromAddon(episode.id, {
                magnetURI,
                infoHash: bestStream.infoHash,
                fileIndex: typeof bestStream.fileIdx === 'number' ? bestStream.fileIdx : undefined,
                filename: bestStream.behaviorHints?.filename,
                title: bestStream.title || bestStream.name,
                sources: Array.isArray(bestStream.sources) ? bestStream.sources : undefined,
            });
            setSeriesResolutionStatus({
                scope: 'episode',
                message: `Fonte confirmada em ${bestStream.addonName || 'addon'} e enviada para materializacao.`,
                source: 'addons',
                details: [
                    `Addon vencedor: ${bestStream.addonName || 'desconhecido'}`,
                    `Titulo: ${bestStream.title || bestStream.name || 'sem titulo'}`,
                ],
            });

            const readyEpisode = await waitForEpisodeReady(episode.id, 12, 1500);
            await refresh();

            if (readyEpisode) {
                navigate(`/series/episode/${readyEpisode.id}`);
                return;
            }
        } catch (err) {
            console.error('Episode auto-resolve error:', err);
            handleOpenEpisodeAddons(episode);
        } finally {
            setAutoResolvingEpisodeId(null);
        }
    }, [
        acceptPortugueseSubtitles,
        buildEpisodeLanguageHint,
        buildVideoSelectionInsight,
        handleOpenEpisodeAddons,
        navigate,
        pickBestEpisodeStream,
        preferPortugueseAudio,
        refresh,
        series,
        user?.id,
        waitForEpisodeReady,
    ]);

    // Set first available season on load
    React.useEffect(() => {
        if (series?.seasons?.length && !series.seasons.find(s => s.seasonNumber === selectedSeason)) {
            setSelectedSeason(series.seasons[0].seasonNumber);
        }
    }, [series]);

    React.useEffect(() => {
        const candidateEpisodes = currentEpisodes.filter((episode) => Boolean(episode.videoId));
        const pendingEpisodes = candidateEpisodes.filter((episode) => !loadedVideoSelectionIdsRef.current.has(String(episode.videoId)));
        if (!pendingEpisodes.length) {
            return;
        }

        let cancelled = false;

        (async () => {
            const results = await Promise.all(
                pendingEpisodes.map(async (episode) => {
                    const videoId = String(episode.videoId || '');
                    try {
                        const telemetry = await SeriesService.getVideoSelectionTelemetry(videoId);
                        return {
                            episodeId: episode.id,
                            videoId,
                            hint: buildEpisodeLanguageHint(telemetry, videoId),
                        };
                    } catch {
                        return {
                            episodeId: episode.id,
                            videoId,
                            hint: null,
                        };
                    }
                })
            );

            if (cancelled) {
                return;
            }

            const nextHints: Record<string, { tone: 'strong' | 'subtitle' | 'weak'; label: string }> = {};
            for (const result of results) {
                loadedVideoSelectionIdsRef.current.add(result.videoId);
                if (result.hint) {
                    nextHints[result.episodeId] = result.hint;
                }
            }

            if (Object.keys(nextHints).length > 0) {
                setEpisodeLanguageHints((current) => ({
                    ...current,
                    ...nextHints,
                }));
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [buildEpisodeLanguageHint, currentEpisodes]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="animate-spin text-primary" size={48} />
                    <p className="text-white/40 font-medium">Carregando série...</p>
                </div>
            </div>
        );
    }

    if (error || !series) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="text-center space-y-4">
                    <AlertCircle className="w-16 h-16 text-red-400 mx-auto" />
                    <p className="text-red-400 text-xl">{error || 'Série não encontrada'}</p>
                    <button onClick={() => navigate('/series')} className="px-6 py-2 bg-white/10 rounded-lg text-white">
                        Voltar para Séries
                    </button>
                </div>
            </div>
        );
    }

    // Parse genres
    let genres: string[] = [];
    try {
        genres = series.genres ? JSON.parse(series.genres) : [];
    } catch {
        genres = series.genres ? series.genres.split(',').map(g => g.trim()) : [];
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Hero Section */}
            <div className="relative h-[50vh] sm:h-[55vh] md:h-[65vh] overflow-hidden">
                {/* Backdrop Image */}
                {series.backdrop ? (
                    <img
                        src={series.backdrop}
                        alt={series.title}
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="w-full h-full bg-gradient-to-br from-primary/20 via-background to-accent/20" />
                )}

                {/* Gradient Overlays */}
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-background/80 to-transparent" />

                {/* Back Button */}
                <button
                    onClick={() => navigate('/series')}
                    className="absolute top-20 sm:top-24 left-4 sm:left-6 md:left-12 z-20 flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl bg-black/30 backdrop-blur-lg text-white/80 hover:text-white hover:bg-black/50 transition-all border border-white/10"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="text-sm font-medium">Séries</span>
                </button>

                {/* Series Info */}
                <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 md:p-12 z-10">
                    <div className="max-w-7xl mx-auto flex gap-4 md:gap-8 items-end">
                        {/* Poster */}
                        {series.poster && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="hidden md:block w-48 rounded-2xl overflow-hidden shadow-2xl shadow-black/50 border border-white/10 flex-shrink-0"
                            >
                                <img src={series.poster} alt={series.title} className="w-full h-auto" />
                            </motion.div>
                        )}

                        <div className="flex-1 space-y-4">
                            {/* Status Badge */}
                            <div className="flex flex-wrap items-center gap-2">
                                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${series.status === 'ONGOING' ? 'bg-emerald-500/15 text-emerald-400' :
                                    series.status === 'ENDED' ? 'bg-blue-500/15 text-blue-400' :
                                        'bg-red-500/15 text-red-400'
                                    }`}>
                                    {series.status === 'ONGOING' ? 'Em Andamento' : series.status === 'ENDED' ? 'Finalizada' : 'Cancelada'}
                                </span>

                                {genres.length > 0 && genres.slice(0, 3).map(g => (
                                    <span key={g} className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-white/5 text-white/40 border border-white/5">
                                        {g}
                                    </span>
                                ))}
                            </div>

                            {/* Title */}
                            <motion.h1
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="text-3xl sm:text-4xl md:text-6xl font-black text-white tracking-tight"
                            >
                                {series.title}
                            </motion.h1>

                            {/* Meta */}
                            <div className="flex flex-wrap items-center gap-3 md:gap-4 text-xs sm:text-sm text-white/40">
                                <div className="flex items-center gap-1.5">
                                    <Layers className="w-4 h-4" />
                                    <span>{series.totalSeasons} Temporada{series.totalSeasons !== 1 ? 's' : ''}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <Film className="w-4 h-4" />
                                    <span>{stats.total} Episódio{stats.total !== 1 ? 's' : ''}</span>
                                </div>
                                {stats.ready > 0 && (
                                    <div className="flex items-center gap-1.5 text-emerald-400">
                                        <CheckCircle className="w-4 h-4" />
                                        <span>{stats.ready} Pronto{stats.ready !== 1 ? 's' : ''}</span>
                                    </div>
                                )}
                                {series.firstAirDate && (
                                    <div className="flex items-center gap-1.5">
                                        <Calendar className="w-4 h-4" />
                                        <span>{new Date(series.firstAirDate).getFullYear()}</span>
                                    </div>
                                )}
                            </div>

                            {discoverySeriesSignal && (
                                <button
                                    type="button"
                                    onClick={() => setShowPtbrSignalDetails((current) => !current)}
                                    className={`inline-flex flex-col rounded-2xl border px-4 py-3 text-left transition-all hover:border-white/20 ${
                                    discoverySeriesSignal.tone === 'strong'
                                        ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200'
                                        : discoverySeriesSignal.tone === 'subtitle'
                                            ? 'border-cyan-400/20 bg-cyan-500/10 text-cyan-100'
                                            : 'border-white/10 bg-white/5 text-white/70'
                                }`}>
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                                        Sinal PT-BR aprendido {showPtbrSignalDetails ? '• aberto' : '• tocar para abrir'}
                                    </span>
                                    <span className="mt-2 text-sm font-semibold">
                                        {discoverySeriesSignal.label}
                                    </span>
                                    <span className="mt-1 text-xs text-current/80">
                                        {discoverySeriesSignal.detail}
                                    </span>
                                    {showPtbrSignalDetails && (
                                        <div className="mt-3 space-y-1 text-xs text-current/80">
                                            <p>Origem: {discoverySeriesSignal.sourceLabel}</p>
                                            <p>Confianca: {discoverySeriesSignal.confidenceLabel}</p>
                                            <p>Base: {discoverySeriesSignal.samplesLabel || 'sem amostras observadas'}</p>
                                            {discoverySeriesSignal.reasons.length > 0 && (
                                                <div className="pt-1 space-y-1">
                                                    {discoverySeriesSignal.reasons.map((reason) => (
                                                        <p key={reason}>Subiu por: {reason}</p>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </button>
                            )}

                            {/* Overview */}
                            {series.overview && (
                                <p className="text-white/50 text-sm md:text-base max-w-2xl leading-relaxed line-clamp-3">
                                    {series.overview}
                                </p>
                            )}

                            {/* Actions */}
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2">
                                <button
                                    onClick={handleDownloadSeason}
                                    disabled={downloading}
                                    className="flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 w-full sm:w-auto"
                                >
                                    {downloading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Download className="w-4 h-4" />
                                    )}
                                    Baixar Temporada {selectedSeason}
                                </button>

                                <button
                                    onClick={handleDownloadSeries}
                                    disabled={downloading}
                                    className="flex items-center justify-center gap-2 px-5 py-3 bg-white/5 text-white/70 font-semibold rounded-xl hover:bg-white/10 transition-all border border-white/10 disabled:opacity-50 w-full sm:w-auto"
                                >
                                    <DownloadCloud className="w-4 h-4" />
                                    Série Completa
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Section */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-12 pb-20 pt-8">
                {seriesResolutionStatus && (
                    <div className={`mb-6 rounded-2xl border px-4 py-3 text-sm backdrop-blur-xl ${
                        seriesResolutionStatus.source === 'nexus'
                            ? 'border-cyan-400/20 bg-cyan-500/10 text-cyan-100'
                            : seriesResolutionStatus.source === 'addons'
                                ? 'border-amber-400/20 bg-amber-500/10 text-amber-100'
                                : 'border-white/10 bg-white/5 text-white/80'
                    }`}>
                        <div className="flex items-center gap-2">
                            <Loader2 className={`h-4 w-4 ${autoResolvingEpisodeId ? 'animate-spin' : ''}`} />
                            <span className="font-semibold">
                                {seriesResolutionStatus.source === 'nexus'
                                    ? 'Nexus em acao'
                                    : seriesResolutionStatus.source === 'addons'
                                        ? 'Fallback de addons'
                                        : 'Fila local'}
                            </span>
                        </div>
                        <p className="mt-1 text-xs sm:text-sm opacity-90">{seriesResolutionStatus.message}</p>
                        {seriesResolutionStatus.details && seriesResolutionStatus.details.length > 0 && (
                            <div className="mt-2 space-y-1">
                                {seriesResolutionStatus.details.map((detail) => (
                                    <p key={detail} className="text-[11px] sm:text-xs opacity-75">{detail}</p>
                                ))}
                            </div>
                        )}
                        {videoSelectionInsight && (
                            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                                <p className="text-[11px] sm:text-xs font-semibold text-white/90">
                                    Cérebro do arquivo
                                </p>
                                <p className="mt-1 text-[11px] sm:text-xs text-white/75">
                                    {videoSelectionInsight.message}
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* Season Selector */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                    <div className="relative">
                        <button
                            onClick={() => setSeasonDropdownOpen(!seasonDropdownOpen)}
                            className="flex items-center gap-3 px-5 py-3 rounded-xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] transition-all"
                        >
                            <Tv className="w-4 h-4 text-primary" />
                            <span className="font-bold text-white">Temporada {selectedSeason}</span>
                            <ChevronDown className={`w-4 h-4 text-white/40 transition-transform ${seasonDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        <AnimatePresence>
                            {seasonDropdownOpen && (
                                <motion.div
                                    initial={{ opacity: 0, y: -5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -5 }}
                                    className="absolute top-full left-0 mt-2 z-50 min-w-[200px] glass-card rounded-xl overflow-hidden shadow-2xl"
                                >
                                    {series.seasons?.map(season => (
                                        <button
                                            key={season.id}
                                            onClick={() => {
                                                setSelectedSeason(season.seasonNumber);
                                                setSeasonDropdownOpen(false);
                                            }}
                                            className={`w-full flex items-center justify-between px-5 py-3 text-left hover:bg-white/5 transition-colors ${selectedSeason === season.seasonNumber ? 'bg-primary/10 text-primary' : 'text-white/70'
                                                }`}
                                        >
                                            <span className="font-medium">
                                                {season.name || `Temporada ${season.seasonNumber}`}
                                            </span>
                                            <span className="text-xs text-white/30">
                                                {season.episodes?.length || 0} eps
                                            </span>
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Season Stats */}
                    <div className="flex flex-wrap items-center gap-3 text-sm text-white/40">
                        <span>{currentEpisodes.length} episódio{currentEpisodes.length !== 1 ? 's' : ''}</span>
                        <span>•</span>
                        <span className="text-emerald-400">
                            {currentEpisodes.filter(e => e.status === 'READY').length} pronto{currentEpisodes.filter(e => e.status === 'READY').length !== 1 ? 's' : ''}
                        </span>
                    </div>
                </div>

                {/* Season Pills (alternative compact view) */}
                {(series.seasons?.length ?? 0) > 0 && (series.seasons?.length ?? 0) <= 10 && (
                    <div className="flex gap-2 mb-8 flex-wrap">
                        {series.seasons?.map(season => (
                            <button
                                key={season.id}
                                onClick={() => setSelectedSeason(season.seasonNumber)}
                                className={`px-4 py-2 rounded-xl font-semibold text-sm transition-all ${selectedSeason === season.seasonNumber
                                    ? 'bg-primary text-white shadow-lg shadow-primary/20'
                                    : 'bg-white/[0.03] text-white/50 hover:bg-white/[0.06] border border-white/5'
                                    }`}
                            >
                                T{season.seasonNumber}
                            </button>
                        ))}
                    </div>
                )}

                {/* Episodes List */}
                <div className="space-y-3">
                    {currentEpisodes.length > 0 ? (
                        currentEpisodes.map((episode, idx) => (
                            <motion.div
                                key={episode.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.03 }}
                            >
                                <EpisodeCard
                                    episode={autoResolvingEpisodeId === episode.id ? { ...episode, status: 'PROCESSING' } : episode}
                                    languageHint={episodeLanguageHints[episode.id] || null}
                                    onDownload={refresh}
                                    onOpenAddons={handleOpenEpisodeAddons}
                                    onWatch={handleWatchEpisode}
                                />
                            </motion.div>
                        ))
                    ) : (
                        <div className="text-center py-20">
                            <Film className="w-16 h-16 text-white/10 mx-auto mb-4" />
                            <p className="text-white/30 text-lg font-medium">Nenhum episódio nesta temporada</p>
                            <p className="text-white/20 text-sm mt-1">Adicione episódios ou faça uma ingestão automática</p>
                        </div>
                    )}
                </div>
            </div>

            <AddonStreamDialog
                isOpen={addonDialog.isOpen}
                onClose={() => {
                    setAddonDialog({ isOpen: false, id: '', title: '' });
                    setAddonTargetEpisode(null);
                }}
                type="series"
                id={addonDialog.id}
                title={addonDialog.title}
                onMaterializeStream={addonTargetEpisode ? async (stream) => {
                    const magnetURI = stream.url?.startsWith('magnet:')
                        ? stream.url
                        : (stream.infoHash ? `magnet:?xt=urn:btih:${stream.infoHash}` : undefined);
                    await SeriesService.materializeEpisodeFromAddon(addonTargetEpisode.id, {
                        magnetURI,
                        infoHash: stream.infoHash,
                        fileIndex: typeof stream.fileIdx === 'number' ? stream.fileIdx : undefined,
                        filename: stream.behaviorHints?.filename,
                        title: stream.title || stream.name,
                        sources: Array.isArray(stream.sources) ? stream.sources : undefined,
                    });
                    await refresh();
                } : undefined}
            />
        </div>
    );
};
