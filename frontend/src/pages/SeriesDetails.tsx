/**
 * 📺 SERIES DETAILS PAGE
 * Página de detalhes de uma série com seletor de temporadas,
 * lista de episódios e ações de download.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Tv, Loader2, Download, ArrowLeft, Calendar,
    Film, ChevronDown, Layers, DownloadCloud,
    CheckCircle, AlertCircle
} from 'lucide-react';
import { useSeriesDetails } from '@/hooks/useSeries';
import { EpisodeCard } from '@/components/EpisodeCard';
import SeriesService from '@/services/api/series.service';

export const SeriesDetailsPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { series, loading, error, refresh } = useSeriesDetails(id);
    const [selectedSeason, setSelectedSeason] = useState(1);
    const [downloading, setDownloading] = useState(false);
    const [seasonDropdownOpen, setSeasonDropdownOpen] = useState(false);

    const currentSeason = useMemo(() => {
        return series?.seasons?.find(s => s.seasonNumber === selectedSeason);
    }, [series, selectedSeason]);

    const currentEpisodes = useMemo(() => {
        return currentSeason?.episodes || [];
    }, [currentSeason]);

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

    const handleDownloadSeason = useCallback(async () => {
        if (!id || downloading) return;
        setDownloading(true);
        try {
            await SeriesService.downloadSeason(id, selectedSeason);
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
            await SeriesService.downloadSeries(id);
            setTimeout(() => refresh(), 1000);
        } catch (err) {
            console.error('Download series error:', err);
        } finally {
            setDownloading(false);
        }
    }, [id, downloading, refresh]);

    // Set first available season on load
    React.useEffect(() => {
        if (series?.seasons?.length && !series.seasons.find(s => s.seasonNumber === selectedSeason)) {
            setSelectedSeason(series.seasons[0].seasonNumber);
        }
    }, [series]);

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
            <div className="relative h-[55vh] md:h-[65vh] overflow-hidden">
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
                    className="absolute top-24 left-6 md:left-12 z-20 flex items-center gap-2 px-4 py-2 rounded-xl bg-black/30 backdrop-blur-lg text-white/80 hover:text-white hover:bg-black/50 transition-all border border-white/10"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="text-sm font-medium">Séries</span>
                </button>

                {/* Series Info */}
                <div className="absolute bottom-0 left-0 right-0 p-6 md:p-12 z-10">
                    <div className="max-w-7xl mx-auto flex gap-8 items-end">
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
                            <div className="flex items-center gap-2">
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
                                className="text-4xl md:text-6xl font-black text-white tracking-tight"
                            >
                                {series.title}
                            </motion.h1>

                            {/* Meta */}
                            <div className="flex items-center gap-4 text-sm text-white/40">
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

                            {/* Overview */}
                            {series.overview && (
                                <p className="text-white/50 text-sm md:text-base max-w-2xl leading-relaxed line-clamp-3">
                                    {series.overview}
                                </p>
                            )}

                            {/* Actions */}
                            <div className="flex items-center gap-3 pt-2">
                                <button
                                    onClick={handleDownloadSeason}
                                    disabled={downloading}
                                    className="flex items-center gap-2 px-6 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
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
                                    className="flex items-center gap-2 px-5 py-3 bg-white/5 text-white/70 font-semibold rounded-xl hover:bg-white/10 transition-all border border-white/10 disabled:opacity-50"
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
            <div className="max-w-7xl mx-auto px-6 md:px-12 pb-20 pt-8">
                {/* Season Selector */}
                <div className="flex items-center justify-between mb-8">
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
                    <div className="flex items-center gap-4 text-sm text-white/40">
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
                                <EpisodeCard episode={episode} onDownload={refresh} />
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
        </div>
    );
};
