
import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { VideoCard } from '@/components/VideoCard';
import { Search, Loader2, Play, Shield, Download, Tv, Package, Star, Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import apiClient from '@/lib/axios';
import { AddonStreamDialog } from '@/components/AddonStreamDialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export const SearchPage: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const query = searchParams.get('q') || '';
    const navigate = useNavigate();
    const [searchInput, setSearchInput] = useState(query);
    const [aiRequestStatus, setAiRequestStatus] = useState<'idle' | 'loading' | 'done'>('idle');
    const [globalResults, setGlobalResults] = useState<{
        local: any[],
        youtube: any[],
        tmdb: any[],
        nexus: any[],
        series: any[],
        seriesMetadata: any,
        iptv: any[],
        searchTermsUsed: string[],
        ptbrMode: boolean,
        enrichment: any
    }>({
        local: [],
        youtube: [],
        tmdb: [],
        nexus: [],
        series: [],
        seriesMetadata: null,
        iptv: [],
        searchTermsUsed: [],
        ptbrMode: true,
        enrichment: null
    });
    const [searching, setSearching] = useState(false);
    const [ptbrFilter, setPtbrFilter] = useState(false);
    const [selectedSeason, setSelectedSeason] = useState<number | null>(null);

    const [streamDialog, setStreamDialog] = useState<{ isOpen: boolean, type: 'movie' | 'series', id: string, title: string }>({
        isOpen: false, type: 'movie', id: '', title: ''
    });

    const handleTmdbClick = (item: any) => {
        const params = new URLSearchParams();
        params.set('q', item.title || item.name);
        navigate(`/torrents?${params.toString()}`, { state: { tmdb: item } });
    };

    const handleImport = async (item: any, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm(`Deseja adicionar "${item.title || item.name}" à sua biblioteca?`)) return;

        try {
            const { data } = await apiClient.post('/videos/import', {
                tmdbId: item.id,
                title: item.title || item.name,
                overview: item.overview,
                poster_path: item.poster_path, // URL completa
                backdrop_path: item.backdrop_path,
                release_date: item.release_date || item.first_air_date,
                media_type: item.media_type
            });
            // alert('✅ Adicionado com sucesso! Agora aparece na sua Biblioteca.');
            navigate(`/video/${data.video.id}`);
        } catch (error) {
            console.error(error);
            alert('❌ Erro ao adicionar. Talvez já exista na biblioteca.');
        }
    };

    const handleAiSearch = async () => {
        setAiRequestStatus('loading');
        try {
            await apiClient.post('/ai/deep-search', { query });
            setAiRequestStatus('done');

            setTimeout(async () => {
                const res = await apiClient.get(`/search?q=${query}`);
                setGlobalResults(res.data);
            }, 3000);
        } catch (e) {
            console.error('Falha ao despachar Arconte.', e);
            setAiRequestStatus('idle');
        }
    };

    // Atualizar input quando query mudar
    React.useEffect(() => {
        setSearchInput(query);
    }, [query]);

    // Busca Global Híbrida
    React.useEffect(() => {
        const fetchGlobal = async () => {
            if (!query) return;
            setSearching(true);
            try {
                const res = await apiClient.get(`/search?q=${query}`);
                setGlobalResults(res.data);
            } catch (e) {
                console.error("Busca global falhou", e);
            } finally {
                setSearching(false);
            }
        };
        fetchGlobal();
    }, [query]);

    const handleSearch = () => {
        if (!searchInput.trim()) return;
        setSearchParams({ q: searchInput.trim() });
    };

    if (searching) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center space-y-6">
                <div className="relative">
                    <div className="absolute inset-0 bg-primary blur-2xl opacity-20 animate-pulse" />
                    <Loader2 className="animate-spin text-primary relative" size={64} />
                </div>
                <div className="text-center space-y-2">
                    <p className="text-white font-black uppercase tracking-[0.4em] text-xs">Synchronizing Global Nodes</p>
                    <p className="text-white/20 font-mono text-[10px] uppercase">Orion Search V3 — PT-BR Priority Active...</p>
                </div>
            </div>
        );
    }

    // Filtrar resultados Nexus por PT-BR se filtro ativo
    const filteredNexus = ptbrFilter
        ? (globalResults.nexus || []).filter((t: any) => t.hasPTBRAudio || t.hasPTBRSubs)
        : (globalResults.nexus || []);

    // Filtrar resultados de séries por temporada selecionada
    const filteredSeries = selectedSeason
        ? (globalResults.series || []).filter((t: any) => t.detectedSeason === selectedSeason || t.isCompletePack)
        : (globalResults.series || []);

    const totalEntities =
        (globalResults.local?.length || 0) +
        (globalResults.youtube?.length || 0) +
        (globalResults.tmdb?.length || 0) +
        filteredNexus.length +
        filteredSeries.length;

    const hasResults = totalEntities > 0;
    const ptbrCount = [...(globalResults.nexus || []), ...(globalResults.series || [])].filter((r: any) => r.hasPTBRAudio || r.hasPTBRSubs).length;

    const renderTorrentBadges = (torrent: any) => (
        <div className="flex items-center gap-1.5 flex-wrap">
            {torrent.hasPTBRAudio && (
                <span className="text-[7px] font-black px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded uppercase border border-green-500/20">🇧🇷 DUB</span>
            )}
            {torrent.hasPTBRSubs && !torrent.hasPTBRAudio && (
                <span className="text-[7px] font-black px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded uppercase border border-yellow-500/20">🇧🇷 LEG</span>
            )}
            {torrent.isCompletePack && (
                <span className="text-[7px] font-black px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded uppercase border border-purple-500/20">
                    <Package size={8} className="inline mr-0.5" />PACK
                </span>
            )}
            {torrent.isSeasonPack && !torrent.isCompletePack && (
                <span className="text-[7px] font-black px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 rounded uppercase border border-cyan-500/20">
                    <Tv size={8} className="inline mr-0.5" />S{torrent.detectedSeason || '?'}
                </span>
            )}
            <span className="text-[7px] font-black px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded uppercase border border-blue-500/20">{torrent.quality || 'HD'}</span>
        </div>
    );

    const renderTorrentCard = (torrent: any, index: number, colorAccent: string = 'green') => {
        // Camada 3: Tradução reversa - mostrar título PT + original
        const displayTitle = torrent.displayTitle || torrent.title;
        const originalTitle = torrent.originalTitle;
        const showTranslation = originalTitle && originalTitle !== displayTitle && originalTitle !== torrent.title;

        return (
            <motion.div
                key={torrent.id || index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                className={`group cursor-pointer bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 hover:border-${colorAccent}-500/50 transition-all hover:bg-white/[0.06] relative overflow-hidden w-72 md:w-auto flex-shrink-0 md:flex-shrink`}
                onClick={() => navigate(`/torrent-player?magnet=${encodeURIComponent(torrent.magnetLink)}&title=${encodeURIComponent(displayTitle)}`)}
            >
                {/* Score Glow */}
                {torrent.ptbrScore > 50 && (
                    <div className="absolute -top-10 -right-10 w-20 h-20 bg-green-500/10 rounded-full blur-2xl" />
                )}

                <div className="flex items-start justify-between mb-3">
                    {renderTorrentBadges(torrent)}
                    <div className="flex items-center gap-1 text-green-500 shrink-0 ml-2">
                        <Shield size={11} />
                        <span className="text-[10px] font-black">{torrent.seeds || 0}</span>
                    </div>
                </div>

                {/* Título principal (PT-BR se disponível) */}
                <h3 className="text-[11px] font-bold text-white/90 leading-tight line-clamp-2 mb-1 group-hover:text-green-400 transition-colors tracking-tight">
                    {displayTitle}
                </h3>
                {/* Título original (se diferente) */}
                {showTranslation && (
                    <p className="text-[9px] text-white/25 font-mono italic mb-2 truncate">
                        {originalTitle} (Original)
                    </p>
                )}
                {/* Título do torrent real (se diferente do display) */}
                {torrent.title !== displayTitle && (
                    <p className="text-[8px] text-white/15 font-mono truncate mb-2">
                        {torrent.title}
                    </p>
                )}

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-[9px] text-white/30 font-mono">{torrent.size || '—'}</span>
                        {torrent.sourceSite && (
                            <span className="text-[8px] text-white/15 font-mono uppercase">{torrent.sourceSite}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="p-1.5 bg-green-500/20 text-green-400 rounded-lg">
                            <Play size={12} />
                        </div>
                        <div className="p-1.5 bg-white/10 text-white/60 rounded-lg">
                            <Download size={12} />
                        </div>
                    </div>
                </div>
            </motion.div>
        );
    };

    return (
        <div className="min-h-screen bg-background pt-32 pb-20 px-6 md:px-12 relative overflow-hidden">
            <AddonStreamDialog
                isOpen={streamDialog.isOpen}
                onClose={() => setStreamDialog({ ...streamDialog, isOpen: false })}
                type={streamDialog.type}
                id={streamDialog.id}
                title={streamDialog.title}
            />

            {/* Ambient Background Glows */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[150px] -z-10" />
            <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-accent/5 rounded-full blur-[150px] -z-10" />
            {globalResults.seriesMetadata?.backdrop && (
                <div className="absolute inset-0 -z-20 opacity-[0.04]">
                    <img src={globalResults.seriesMetadata.backdrop} className="w-full h-full object-cover" alt="" />
                    <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-transparent" />
                </div>
            )}

            <div className="max-w-7xl mx-auto">
                {/* Search Bar */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-12 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 shadow-2xl"
                >
                    <div className="flex gap-4">
                        <div className="flex-1 relative group/input">
                            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-white/30 group-focus-within/input:text-primary transition-colors" size={20} />
                            <Input
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                                placeholder="Buscar filmes, séries, torrents..."
                                className="pl-14 h-14 bg-white/5 border-white/10 rounded-2xl text-lg text-white placeholder:text-white/20 focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                            />
                        </div>
                        <Button
                            onClick={handleSearch}
                            disabled={searching || !searchInput.trim()}
                            className="h-14 px-8 rounded-2xl bg-primary text-black font-black uppercase tracking-wider hover:bg-primary/90 transition-all disabled:opacity-50"
                        >
                            {searching ? <Loader2 className="animate-spin" size={20} /> : 'Buscar'}
                        </Button>
                    </div>
                </motion.div>

                <header className="mb-16 space-y-6 border-b border-white/5 pb-12">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                        <div className="space-y-4">
                            <motion.div
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="inline-flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-1.5 rounded-full"
                            >
                                <div className="w-1.5 h-1.5 bg-primary rounded-full animate-ping" />
                                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50 leading-none">Orion Search V4 — Semantic Intelligence {globalResults.enrichment ? '● TMDB Linked' : ''}</span>
                            </motion.div>

                            <h1 className="text-4xl md:text-7xl font-black tracking-[-0.05em] uppercase leading-none text-white">
                                <span className="text-white/30 italic font-serif lowercase">of</span> {globalResults.enrichment?.titlePt || query}
                            </h1>
                            {/* Tradução reversa: mostrar título original se TMDB traduziu */}
                            {globalResults.enrichment && globalResults.enrichment.titleEn !== query && (
                                <p className="text-xs text-white/25 font-mono italic mt-2">
                                    🎯 {globalResults.enrichment.titleEn} ({globalResults.enrichment.year}) — {globalResults.enrichment.originalTitle}
                                </p>
                            )}

                            {/* Search Terms Used */}
                            {globalResults.searchTermsUsed?.length > 1 && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                    {globalResults.searchTermsUsed.slice(0, 6).map((term, i) => (
                                        <span key={i} className="text-[8px] font-bold px-2 py-0.5 bg-white/5 text-white/25 rounded-full border border-white/5">
                                            {term}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="text-right space-y-3">
                            <div className="text-4xl md:text-6xl font-black text-primary italic tracking-tight leading-none">
                                {totalEntities}
                            </div>
                            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Entities Discovered</div>

                            {/* PT-BR Stats + Filter */}
                            {ptbrCount > 0 && (
                                <div className="flex items-center gap-3 justify-end">
                                    <span className="text-[9px] font-black text-green-500/60">🇧🇷 {ptbrCount} PT-BR</span>
                                    <button
                                        onClick={() => setPtbrFilter(!ptbrFilter)}
                                        className={`text-[8px] font-black uppercase px-3 py-1 rounded-full border transition-all ${ptbrFilter
                                            ? 'bg-green-500 text-black border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.4)]'
                                            : 'bg-white/5 text-white/40 border-white/10 hover:border-green-500/40'
                                            }`}
                                    >
                                        {ptbrFilter ? '🇧🇷 ONLY' : 'FILTER PT-BR'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                {hasResults ? (
                    <div className="space-y-20">
                        {/* ============================================ */}
                        {/* SERIES METADATA CARD */}
                        {/* ============================================ */}
                        {globalResults.seriesMetadata && (
                            <section>
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="w-1.5 h-6 bg-violet-500 rounded-full" />
                                    <h2 className="text-sm font-black uppercase tracking-[0.3em] text-white/80 italic">Série Detectada</h2>
                                    <span className="text-[9px] font-bold text-violet-500/60 bg-violet-500/10 px-2 py-0.5 rounded uppercase border border-violet-500/20">
                                        <Tv size={10} className="inline mr-1" />TMDB Intelligence
                                    </span>
                                </div>

                                <div className="relative bg-white/[0.03] border border-white/[0.06] rounded-3xl overflow-hidden">
                                    {/* ... Series metadata content ... */}
                                    {/* Keeping content simplified for brievity if needed, but regenerating full content */}
                                    {/* Backdrop */}
                                    {globalResults.seriesMetadata.backdrop && (
                                        <div className="absolute inset-0 opacity-20">
                                            <img src={globalResults.seriesMetadata.backdrop} className="w-full h-full object-cover" alt="" />
                                            <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-transparent" />
                                        </div>
                                    )}

                                    <div className="relative p-8 flex gap-8">
                                        {/* Poster */}
                                        {globalResults.seriesMetadata.poster && (
                                            <div className="hidden md:block w-40 shrink-0">
                                                <img src={globalResults.seriesMetadata.poster} className="w-full rounded-2xl border border-white/10 shadow-2xl" alt={globalResults.seriesMetadata.name} />
                                            </div>
                                        )}

                                        {/* Info */}
                                        <div className="flex-1 space-y-4">
                                            <div>
                                                <h3 className="text-2xl font-black text-white uppercase tracking-tight">{globalResults.seriesMetadata.name}</h3>
                                                {globalResults.seriesMetadata.original_name !== globalResults.seriesMetadata.name && (
                                                    <p className="text-xs text-white/30 font-mono italic mt-1">{globalResults.seriesMetadata.original_name}</p>
                                                )}
                                            </div>

                                            <div className="flex flex-wrap gap-3">
                                                {/* ... badges ... */}
                                                <span className="flex items-center gap-1.5 text-[10px] text-amber-400 font-bold">
                                                    <Star size={12} />{globalResults.seriesMetadata.vote_average?.toFixed(1)}
                                                </span>
                                            </div>

                                            <p className="text-xs text-white/40 leading-relaxed line-clamp-3">{globalResults.seriesMetadata.overview}</p>

                                            {/* Season Selector */}
                                            {globalResults.seriesMetadata.seasons?.length > 0 && (
                                                <div className="pt-4">
                                                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20 mb-3">Filtrar Temporada</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        <button
                                                            onClick={() => setSelectedSeason(null)}
                                                            className={`text-[10px] font-black px-3 py-1.5 rounded-xl border transition-all ${selectedSeason === null
                                                                ? 'bg-violet-500 text-white border-violet-500 shadow-[0_0_15px_rgba(139,92,246,0.4)]'
                                                                : 'bg-white/5 text-white/40 border-white/10 hover:border-violet-500/40'
                                                                }`}
                                                        >
                                                            TODAS
                                                        </button>
                                                        {globalResults.seriesMetadata.seasons.map((s: any) => (
                                                            <button
                                                                key={s.season_number}
                                                                onClick={() => setSelectedSeason(s.season_number)}
                                                                className={`text-[10px] font-black px-3 py-1.5 rounded-xl border transition-all ${selectedSeason === s.season_number
                                                                    ? 'bg-violet-500 text-white border-violet-500 shadow-[0_0_15px_rgba(139,92,246,0.4)]'
                                                                    : 'bg-white/5 text-white/40 border-white/10 hover:border-violet-500/40'
                                                                    }`}
                                                            >
                                                                T{s.season_number}
                                                                <span className="text-[8px] text-white/20 ml-1">({s.episode_count}ep)</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </section>
                        )}

                        {/* ============================================ */}
                        {/* SERIES TORRENTS */}
                        {/* ============================================ */}
                        {filteredSeries.length > 0 && (
                            <section>
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="w-1.5 h-6 bg-violet-500 rounded-full" />
                                    <h2 className="text-sm font-black uppercase tracking-[0.3em] text-white/80 italic">Séries P2P</h2>
                                    {/* ... badges ... */}
                                </div>
                                <div className="flex overflow-x-auto pb-4 gap-4 md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:pb-0 snap-x">
                                    {filteredSeries.map((torrent: any, index: number) => (
                                        <div key={index} className="snap-start">
                                            {renderTorrentCard(torrent, index, 'violet')}
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* ============================================ */}
                        {/* NEXUS P2P / TORRENTS */}
                        {/* ============================================ */}
                        {filteredNexus.length > 0 && (
                            <section>
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="w-1.5 h-6 bg-green-500 rounded-full" />
                                    <h2 className="text-sm font-black uppercase tracking-[0.3em] text-white/80 italic">P2P Network (Nexus)</h2>
                                    {/* ... badges ... */}
                                </div>
                                <div className="flex overflow-x-auto pb-4 gap-4 md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:pb-0 snap-x">
                                    {filteredNexus.map((torrent: any, index: number) => (
                                        <div key={index} className="snap-start">
                                            {renderTorrentCard(torrent, index)}
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* ============================================ */}
                        {/* TMDB / SUGGESTIONS */}
                        {/* ============================================ */}
                        {globalResults.tmdb?.length > 0 && (
                            <section>
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="w-1.5 h-6 bg-amber-500 rounded-full" />
                                    <h2 className="text-sm font-black uppercase tracking-[0.3em] text-white/80 italic">Global Suggestions (TMDB)</h2>
                                </div>
                                <div className="flex gap-8 overflow-x-auto pb-8 no-scrollbar snap-x">
                                    {globalResults.tmdb.map((item: any, index: number) => (
                                        <motion.div
                                            key={item.id}
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            whileInView={{ opacity: 1, scale: 1 }}
                                            viewport={{ once: true }}
                                            transition={{ delay: index * 0.05 }}
                                            className="flex-shrink-0 w-48 group cursor-pointer"
                                            onClick={() => handleTmdbClick(item)}
                                        >
                                            <div className="relative aspect-[2/3] rounded-[1.5rem] overflow-hidden border border-white/5 bg-white/5 mb-4 group-hover:border-amber-500/50 transition-all shadow-xl">
                                                {item.poster_path ? (
                                                    <img src={item.poster_path} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt={item.title} />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/5 to-white/10 text-white/10 uppercase font-black text-[8px] text-center p-4">Metadata Image Protocol Lost</div>
                                                )}
                                                <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black via-black/40 to-transparent">
                                                    <div className="flex items-center justify-between">
                                                        <span className={`text-[8px] font-black uppercase tracking-widest ${item.media_type === 'tv' ? 'text-violet-400' : 'text-amber-500'}`}>
                                                            {item.media_type === 'tv' ? '📺 Série' : '🎬 Filme'}
                                                        </span>
                                                        <span className="text-[8px] font-black text-white/40">{item.release_date?.split('-')[0]}</span>
                                                    </div>
                                                </div>

                                                {/* Search arrow and Addon Button */}
                                                <div className="absolute top-3 right-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setStreamDialog({
                                                                isOpen: true,
                                                                type: item.media_type === 'tv' ? 'series' : 'movie',
                                                                id: item.id.toString(),
                                                                title: item.title || item.name
                                                            });
                                                        }}
                                                        className="p-2 bg-black/60 hover:bg-cyan-500 rounded-lg text-white transition-colors shadow-lg"
                                                        title="Ver em Addons"
                                                    >
                                                        <Play size={14} fill="currentColor" />
                                                    </button>
                                                    <button
                                                        onClick={(e) => handleImport(item, e)}
                                                        className="p-2 bg-black/60 hover:bg-green-500 rounded-lg text-white hover:text-black transition-colors shadow-lg"
                                                        title="Adicionar à Biblioteca"
                                                    >
                                                        <Plus size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                            <h3 className="text-[11px] font-black text-white/90 truncate uppercase tracking-tight group-hover:text-amber-500 transition-colors">{item.title}</h3>
                                        </motion.div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* ============================================ */}
                        {/* LOCAL / LIBRARY */}
                        {/* ============================================ */}
                        {globalResults.local?.length > 0 && (
                            <section>
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="w-1.5 h-6 bg-primary rounded-full" />
                                    <h2 className="text-sm font-black uppercase tracking-[0.3em] text-white/80 italic">In Your Library</h2>
                                </div>
                                <div className="flex overflow-x-auto pb-4 gap-4 md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 md:pb-0 snap-x">
                                    {globalResults.local.map((video: any, index: number) => (
                                        <motion.div
                                            key={video.id}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: index * 0.05 }}
                                            className="snap-start"
                                        >
                                            <VideoCard video={video} />
                                        </motion.div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* ============================================ */}
                        {/* YOUTUBE */}
                        {/* ============================================ */}
                        {globalResults.youtube?.length > 0 && (
                            <section>
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="w-1.5 h-6 bg-red-600 rounded-full" />
                                    <h2 className="text-sm font-black uppercase tracking-[0.3em] text-white/80 italic">Global Web Discovery (Proxy)</h2>
                                </div>
                                <div className="flex overflow-x-auto pb-4 gap-4 md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 md:pb-0 snap-x">
                                    {globalResults.youtube.map((video: any, index: number) => (
                                        <motion.div
                                            key={video.youtubeId}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: index * 0.05 }}
                                            className="group cursor-pointer w-72 md:w-auto flex-shrink-0 md:flex-shrink snap-start"
                                            onClick={() => window.open(`https://www.youtube.com/watch?v=${video.youtubeId}`, '_blank')}
                                        >
                                            {/* ... youtube card content ... */}
                                            <div className="relative aspect-video rounded-[2rem] overflow-hidden border border-white/5 bg-white/5 mb-4 group-hover:border-red-600/50 transition-all shadow-2xl">
                                                <img src={video.thumbnail} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" alt={video.title} />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-6">
                                                    <span className="text-[8px] font-black uppercase tracking-widest text-red-500 mb-2">YouTube Live Source</span>
                                                    <h3 className="text-[13px] font-black text-white/90 truncate leading-none uppercase italic">{video.title}</h3>
                                                </div>
                                            </div>
                                            <p className="text-[9px] text-white/20 font-black uppercase tracking-[0.2em] px-2">{video.channelTitle}</p>
                                        </motion.div>
                                    ))}
                                </div>
                            </section>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-20">
                        {/* Empty State */}
                        <div className="relative group mb-12">
                            <div className="absolute inset-0 bg-primary opacity-10 blur-3xl group-hover:opacity-20 transition-opacity" />
                            <div className="relative glass-card p-12 rounded-[3.5rem] border border-white/5 shadow-2xl">
                                <Search size={80} className="text-white/10" strokeWidth={1} />
                            </div>
                        </div>

                        <div className="text-center space-y-12 max-w-2xl px-6">
                            <div className="space-y-4">
                                <h2 className="text-4xl md:text-5xl font-black text-white italic tracking-tighter uppercase leading-none">Signal Lost</h2>
                                <p className="text-white/30 text-sm font-medium leading-relaxed uppercase tracking-wider">
                                    O termo solicitado não retornou registros no cofre local. <br />
                                    Deseja despachar o <span className="text-white font-black">PROTOCOLO ARCONTE</span> para uma varredura profunda?
                                </p>
                            </div>

                            <div className="relative group pt-4">
                                {aiRequestStatus === 'idle' ? (
                                    <button
                                        onClick={handleAiSearch}
                                        className="relative h-20 px-12 rounded-[2rem] bg-primary text-black font-black uppercase text-xs tracking-[0.3em] italic hover:scale-[1.05] active:scale-[0.95] transition-all shadow-glow flex items-center gap-4 group"
                                    >
                                        <div className="w-1.5 h-1.5 bg-black rounded-full animate-pulse" />
                                        Initialize Deep-Search Arconte
                                        <div className="w-1.5 h-1.5 bg-black rounded-full animate-pulse" />
                                    </button>
                                ) : aiRequestStatus === 'loading' ? (
                                    <div className="flex flex-col items-center gap-10 bg-white/5 p-10 rounded-[3rem] border border-white/10 backdrop-blur-3xl shadow-2xl">
                                        {/* Loading content... */}
                                        <div className="flex items-center gap-8">
                                            <div className="relative">
                                                <div className="absolute inset-0 bg-primary blur-2xl opacity-40 animate-pulse" />
                                                <Loader2 className="animate-spin text-primary relative" size={48} />
                                            </div>
                                            <div className="h-0.5 w-32 bg-white/5 rounded-full overflow-hidden relative">
                                                <motion.div
                                                    className="h-full bg-primary shadow-glow"
                                                    animate={{ x: [-128, 128] }}
                                                    transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                                                />
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {['1337X', 'TPB', 'YTS', 'EZTV', 'BitSearch'].map(site => (
                                                    <span key={site} className="text-[9px] font-black text-white/20 border border-white/5 px-2 py-0.5 rounded-sm animate-pulse">{site}</span>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <p className="text-primary font-black text-[11px] uppercase tracking-[0.4em] text-center">
                                                Scrutinizing Global P2P Swarms
                                            </p>
                                            <p className="text-white/20 text-[9px] font-bold uppercase tracking-widest text-center italic">
                                                Forge Arconte is synthesizing the assets found...
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <motion.div
                                        initial={{ scale: 0.9, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        className="p-10 bg-green-500/5 border border-green-500/20 rounded-[3rem] backdrop-blur-3xl"
                                    >
                                        <div className="flex flex-col items-center gap-4">
                                            <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center text-black shadow-[0_0_30px_rgba(34,197,94,0.5)]">
                                                <div className="w-6 h-6 border-4 border-black border-t-transparent rounded-full animate-spin" />
                                            </div>
                                            <div className="text-center space-y-2">
                                                <h3 className="text-green-500 font-black uppercase tracking-[0.3em] text-xs">Synergy Protocol Engaged</h3>
                                                <p className="text-white/40 text-[9px] font-bold uppercase tracking-widest">Integrating new assets into the global nexus catalogue.</p>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
