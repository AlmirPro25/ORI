/**
 * 📺 SERIES LIST PAGE
 * Página de listagem de séries com grid de cards premium.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Tv, Loader2, Plus, Film, Layers,
    CheckCircle, Search,
    Sparkles
} from 'lucide-react';
import { useSeriesList } from '@/hooks/useSeries';
import { useDiscoveryFeed } from '@/hooks/useDiscovery';
import SeriesService from '@/services/api/series.service';
import { Series } from '@/types/series';

// ==========================================
// SERIES CARD COMPONENT
// ==========================================
const SeriesCard: React.FC<{ series: Series; index: number }> = ({ series, index }) => {
    const navigate = useNavigate();

    let genres: string[] = [];
    try {
        genres = series.genres ? JSON.parse(series.genres) : [];
    } catch {
        genres = series.genres ? series.genres.split(',').map((g: string) => g.trim()) : [];
    }

    const progress = series.progress || 0;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: index * 0.05, duration: 0.4 }}
            onClick={() => navigate(`/series/${series.id}`)}
            className="group relative cursor-pointer"
        >
            {/* Card */}
            <div className="relative aspect-[2/3] rounded-2xl overflow-hidden bg-white/[0.02] border border-white/5 hover:border-primary/30 transition-all duration-500 shadow-lg hover:shadow-2xl hover:shadow-primary/10">
                {/* Poster */}
                {series.poster ? (
                    <img
                        src={series.poster}
                        alt={series.title}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10">
                        <Tv className="w-12 h-12 text-white/10" />
                    </div>
                )}

                {/* Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent opacity-70 group-hover:opacity-90 transition-opacity duration-500" />

                {/* Status Badge */}
                <div className="absolute top-3 right-3">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest ${series.status === 'ONGOING' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20' :
                        series.status === 'ENDED' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/20' :
                            'bg-red-500/20 text-red-400 border border-red-500/20'
                        }`}>
                        {series.status === 'ONGOING' ? 'Em Andamento' : series.status === 'ENDED' ? 'Completa' : 'Cancelada'}
                    </span>
                </div>

                {/* Progress Bar */}
                {progress > 0 && (
                    <div className="absolute top-0 left-0 right-0 h-1 bg-black/40">
                        <div
                            className="h-full bg-gradient-to-r from-primary to-emerald-400 transition-all duration-500"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                )}

                {/* Bottom Info */}
                <div className="absolute bottom-0 left-0 right-0 p-4 space-y-2">
                    <h3 className="text-base font-bold text-white leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                        {series.title}
                    </h3>

                    <div className="flex items-center gap-3 text-[11px] text-white/40">
                        <div className="flex items-center gap-1">
                            <Layers className="w-3 h-3" />
                            <span>{series.totalSeasons}T</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Film className="w-3 h-3" />
                            <span>{series.totalEpisodes}E</span>
                        </div>
                        {(series.readyEpisodes ?? 0) > 0 && (
                            <div className="flex items-center gap-1 text-emerald-400">
                                <CheckCircle className="w-3 h-3" />
                                <span>{series.readyEpisodes}</span>
                            </div>
                        )}
                    </div>

                    {genres.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                            {genres.slice(0, 2).map(g => (
                                <span key={g} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-white/30">
                                    {g}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* Hover Play Button */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
                    <div className="w-14 h-14 rounded-full bg-primary/90 flex items-center justify-center shadow-2xl shadow-primary/40 backdrop-blur-sm border border-white/20 transform scale-75 group-hover:scale-100 transition-transform">
                        <Tv className="w-6 h-6 text-white" />
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

// ==========================================
// ADD SERIES MODAL
// ==========================================
const AddSeriesModal: React.FC<{ open: boolean; onClose: () => void; onCreated: () => void }> = ({ open, onClose, onCreated }) => {
    const [title, setTitle] = useState('');
    const [overview, setOverview] = useState('');
    const [poster, setPoster] = useState('');
    const [backdrop, setBackdrop] = useState('');
    const [creating, setCreating] = useState(false);

    const handleCreate = async () => {
        if (!title.trim()) return;
        setCreating(true);
        try {
            await SeriesService.create({ title, overview: overview || undefined, poster: poster || undefined, backdrop: backdrop || undefined });
            onCreated();
            onClose();
            setTitle('');
            setOverview('');
            setPoster('');
            setBackdrop('');
        } catch (err) {
            console.error('Create series error:', err);
        } finally {
            setCreating(false);
        }
    };

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-xl p-6"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.9, y: 20 }}
                        onClick={e => e.stopPropagation()}
                        className="glass-card rounded-3xl p-8 max-w-lg w-full space-y-6"
                    >
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-primary/10 rounded-xl border border-primary/20">
                                <Plus className="w-5 h-5 text-primary" />
                            </div>
                            <h2 className="text-xl font-bold text-white">Adicionar Série</h2>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5 block">Título *</label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    placeholder="Ex: Breaking Bad"
                                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/20 outline-none focus:border-primary/50 transition-colors"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5 block">Sinopse</label>
                                <textarea
                                    value={overview}
                                    onChange={e => setOverview(e.target.value)}
                                    rows={3}
                                    placeholder="Uma breve descrição..."
                                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/20 outline-none focus:border-primary/50 transition-colors resize-none"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5 block">URL do Poster</label>
                                    <input
                                        type="text"
                                        value={poster}
                                        onChange={e => setPoster(e.target.value)}
                                        placeholder="https://..."
                                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/20 outline-none focus:border-primary/50 transition-colors text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5 block">URL do Backdrop</label>
                                    <input
                                        type="text"
                                        value={backdrop}
                                        onChange={e => setBackdrop(e.target.value)}
                                        placeholder="https://..."
                                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/20 outline-none focus:border-primary/50 transition-colors text-sm"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 pt-2">
                            <button
                                onClick={handleCreate}
                                disabled={creating || !title.trim()}
                                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-lg shadow-primary/20"
                            >
                                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                Criar Série
                            </button>
                            <button
                                onClick={onClose}
                                className="px-6 py-3 bg-white/5 text-white/60 font-semibold rounded-xl hover:bg-white/10 transition-colors"
                            >
                                Cancelar
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

// ==========================================
// SERIES LIST PAGE
// ==========================================
export const SeriesPage: React.FC = () => {
    const { series, loading, error: _error, refresh } = useSeriesList();
    const { feed } = useDiscoveryFeed();
    const [searchQuery, setSearchQuery] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);

    const filteredSeries = React.useMemo(() => {
        const portugueseSeries = new Set(
            (feed?.series || [])
                .filter((item) => item.kind === 'series' && (item.isPortuguese || item.isDubbed))
                .map((item) => item.id)
        );
        const discoveryOrder = new Map(
            (feed?.series || [])
                .filter((item) => item.kind === 'series')
                .map((item, index) => [item.id, index])
        );

        const rankedSeries = [...series].sort((a, b) => {
            const indexA = discoveryOrder.get(a.id);
            const indexB = discoveryOrder.get(b.id);
            const ptbrA = portugueseSeries.has(a.id);
            const ptbrB = portugueseSeries.has(b.id);

            if (ptbrA !== ptbrB) return ptbrA ? -1 : 1;

            if (indexA !== undefined && indexB !== undefined) return indexA - indexB;
            if (indexA !== undefined) return -1;
            if (indexB !== undefined) return 1;

            return (Number(b.progress) || 0) - (Number(a.progress) || 0);
        });

        if (!searchQuery.trim()) return rankedSeries;
        const q = searchQuery.toLowerCase();
        return rankedSeries.filter(s =>
            s.title.toLowerCase().includes(q) ||
            s.genres?.toLowerCase().includes(q)
        );
    }, [series, searchQuery, feed]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="animate-spin text-primary" size={48} />
                    <p className="text-white/40 font-medium">Carregando séries...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background pt-24 px-6 pb-20">
            <div className="max-w-7xl mx-auto space-y-8">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-6"
                >
                    <div className="flex items-center gap-4">
                        <div className="p-4 bg-gradient-to-br from-purple-500/10 to-primary/10 rounded-2xl border border-purple-500/20">
                            <Tv className="w-8 h-8 text-purple-400" />
                        </div>
                        <div>
                            <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">
                                Séries <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-primary">Nexus</span>
                            </h1>
                            <p className="text-white/30 text-sm font-medium mt-1">
                                {series.length} série{series.length !== 1 ? 's' : ''} no catálogo
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Buscar séries..."
                                className="w-64 pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-white placeholder-white/20 outline-none focus:border-primary/50 transition-colors text-sm"
                            />
                        </div>

                        {/* Add Series */}
                        <button
                            onClick={() => setShowAddModal(true)}
                            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white font-semibold rounded-xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
                        >
                            <Plus className="w-4 h-4" />
                            <span className="hidden md:inline">Adicionar</span>
                        </button>
                    </div>
                </motion.div>

                {/* Series Grid */}
                {filteredSeries.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
                        {filteredSeries.map((s, idx) => (
                            <SeriesCard key={s.id} series={s} index={idx} />
                        ))}
                    </div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col items-center justify-center py-32 text-center"
                    >
                        <div className="p-6 bg-white/[0.02] rounded-3xl border border-white/5 mb-6">
                            <Sparkles className="w-16 h-16 text-white/10" />
                        </div>
                        <h2 className="text-xl font-bold text-white/50 mb-2">
                            {searchQuery ? 'Nenhuma série encontrada' : 'Nenhuma série no catálogo'}
                        </h2>
                        <p className="text-white/25 text-sm max-w-md">
                            {searchQuery
                                ? `Não encontramos resultados para "${searchQuery}". Tente outro termo.`
                                : 'Adicione sua primeira série ou faça uma ingestão automática de torrents para começar.'
                            }
                        </p>
                        {!searchQuery && (
                            <button
                                onClick={() => setShowAddModal(true)}
                                className="mt-6 flex items-center gap-2 px-6 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
                            >
                                <Plus className="w-4 h-4" />
                                Adicionar Primeira Série
                            </button>
                        )}
                    </motion.div>
                )}
            </div>

            {/* Add Series Modal */}
            <AddSeriesModal
                open={showAddModal}
                onClose={() => setShowAddModal(false)}
                onCreated={() => refresh()}
            />
        </div>
    );
};
