import React, { useState } from 'react';
import {
    Loader2,
    Package, Save, Info, AlertTriangle, Layers, Star, FileVideo, HardDrive
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import SeriesService from '@/services/api/series.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSeriesList } from '@/hooks/useSeries';

export const SeriesDeepImport: React.FC = () => {
    const { series: allSeries } = useSeriesList();
    const [magnetLink, setMagnetLink] = useState('');
    const [exploring, setExploring] = useState(false);
    const [metadata, setMetadata] = useState<any>(null);
    const [selectedSeriesId, setSelectedSeriesId] = useState<string>('');
    const [ingesting, setIngesting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleExplore = async () => {
        if (!magnetLink.trim()) return;
        setExploring(true);
        setError(null);
        setSuccess(false);
        setMetadata(null);
        try {
            const data = await SeriesService.explore(magnetLink);
            setMetadata(data);
        } catch (err: any) {
            setError(err.message || 'Falha ao explorar torrent');
        } finally {
            setExploring(false);
        }
    };

    const handleBulkIngest = async () => {
        if (!selectedSeriesId || !metadata || !metadata.suggestedEpisodes) return;
        setIngesting(true);
        setError(null);
        try {
            const episodesToIngest = metadata.suggestedEpisodes.map((ep: any) => ({
                seasonNumber: ep.season,
                episodeNumber: ep.episode,
                title: `${ep.name}`, // Usar nome detectado ou gerado pelo backend
                fileIndex: ep.index,
                filePath: ep.path,
                quality: ep.quality // Enviar qualidade detectada
            }));

            await SeriesService.bulkIngest(selectedSeriesId, magnetLink, episodesToIngest);
            setSuccess(true);
            setMetadata(null);
            setMagnetLink('');
        } catch (err: any) {
            setError(err.message || 'Falha na ingestão em massa');
        } finally {
            setIngesting(false);
        }
    };

    return (
        <div className="space-y-6 sm:space-y-8">
            <header className="space-y-2">
                <h2 className="text-xl sm:text-2xl font-black uppercase italic tracking-tighter text-white leading-tight">
                    Deep <span className="text-primary">Series</span> Ingester <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded ml-2 not-italic">V2.5 INTELLIGENCE</span>
                </h2>
                <p className="text-[10px] sm:text-xs font-medium text-white/30 uppercase tracking-[0.18em] sm:tracking-widest">
                    Análise profunda de torrents com detecção de episódios, qualidade e specials
                </p>
            </header>

            {/* Input Section */}
            <div className="bg-white/5 p-4 sm:p-6 rounded-[1.5rem] sm:rounded-3xl border border-white/10 space-y-4 shadow-xl">
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                    <div className="flex-1 relative">
                        <Input
                            value={magnetLink}
                            onChange={(e) => setMagnetLink(e.target.value)}
                            placeholder="Magnet Link ou Hash do Torrent..."
                            className="bg-black/40 border-white/10 h-12 sm:h-14 pl-4 sm:pl-6 pr-12 rounded-2xl text-sm sm:text-base text-white placeholder:text-white/20"
                        />
                        {exploring && (
                            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                <Loader2 className="animate-spin text-primary" size={20} />
                            </div>
                        )}
                    </div>
                    <Button
                        onClick={handleExplore}
                        disabled={exploring || !magnetLink}
                        className="h-12 sm:h-14 w-full sm:w-auto px-6 sm:px-8 rounded-2xl bg-primary text-black font-black uppercase tracking-[0.18em] sm:tracking-widest hover:bg-primary/90 transition-all shadow-glow"
                    >
                        {exploring ? 'Analisando...' : 'Escanear'}
                    </Button>
                </div>
                {error && (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400">
                        <AlertTriangle size={16} />
                        <p className="text-[10px] font-bold uppercase tracking-widest">{error}</p>
                    </div>
                )}
                {success && (
                    <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3 text-emerald-400">
                        <Package size={16} />
                        <p className="text-[10px] font-bold uppercase tracking-widest">Sucesso! Os episódios foram catalogados na biblioteca.</p>
                    </div>
                )}
            </div>

            {/* Analysis Results */}
            <AnimatePresence>
                {metadata && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="space-y-5 sm:space-y-6"
                    >
                        {/* Warnings Section */}
                        {metadata.warnings && metadata.warnings.length > 0 && (
                            <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 space-y-2">
                                <div className="flex items-center gap-2 text-amber-400 mb-2">
                                    <AlertTriangle size={16} />
                                    <span className="text-xs font-bold uppercase tracking-widest">Avisos de Integridade</span>
                                </div>
                                <ul className="space-y-1">
                                    {metadata.warnings.map((w: string, idx: number) => (
                                        <li key={idx} className="text-[10px] text-amber-300/70 font-mono">• {w}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Summary Card */}
                        <div className="bg-white/5 border border-white/10 rounded-[1.5rem] sm:rounded-3xl p-4 sm:p-8 relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4 sm:p-8 opacity-5">
                                <Package size={120} />
                            </div>

                            <div className="relative space-y-5 sm:space-y-6">
                                <div>
                                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Torrent Metadata</span>
                                        {metadata.qualityProfile && (
                                            <span className="px-2 py-0.5 rounded bg-white/10 text-[9px] font-bold text-white/60 uppercase border border-white/5">
                                                {metadata.qualityProfile}
                                            </span>
                                        )}
                                        {metadata.isSeasonPack && (
                                            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-[9px] font-bold text-emerald-400 uppercase border border-emerald-500/20">
                                                Season Pack
                                            </span>
                                        )}
                                    </div>
                                    <h3 className="text-lg sm:text-xl font-bold text-white max-w-2xl leading-tight">{metadata.name}</h3>
                                    <p className="text-[9px] sm:text-[10px] font-mono text-white/30 mt-2 uppercase tracking-tighter truncate max-w-xl">{metadata.infoHash}</p>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
                                    <div className="space-y-1">
                                        <p className="text-[9px] font-black text-white/20 uppercase tracking-widest">Tamanho Total</p>
                                        <p className="text-lg sm:text-xl font-bold flex items-center gap-2">
                                            {(metadata.totalSize / 1024 / 1024 / 1024).toFixed(2)} GB
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[9px] font-black text-white/20 uppercase tracking-widest">Arquivos</p>
                                        <p className="text-lg sm:text-xl font-bold">{metadata.totalFiles}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[9px] font-black text-primary uppercase tracking-widest">Episódios Detectados</p>
                                        <p className="text-lg sm:text-xl font-bold text-primary">{metadata.suggestedEpisodes.length}</p>
                                    </div>
                                </div>

                                <div className="pt-5 sm:pt-6 border-t border-white/5">
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black uppercase text-white/40 tracking-widest flex items-center gap-2">
                                            Vincular à Série Existente
                                            {metadata.detectedSeriesName && (
                                                <span className="text-primary normal-case font-normal">(Sugerido: "{metadata.detectedSeriesName}")</span>
                                            )}
                                        </label>
                                        <select
                                            value={selectedSeriesId}
                                            onChange={(e) => setSelectedSeriesId(e.target.value)}
                                            className="w-full h-11 sm:h-12 bg-black/40 border border-white/10 rounded-xl px-4 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
                                        >
                                            <option value="">Selecione uma série...</option>
                                            {allSeries.map(s => (
                                                <option key={s.id} value={s.id}>{s.title}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Episodes List */}
                        <div className="bg-white/5 border border-white/10 rounded-[1.5rem] sm:rounded-3xl overflow-hidden">
                            <div className="p-4 bg-white/[0.03] border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Mapeamento de Arquivos</span>
                                <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-1 rounded">
                                    {metadata.suggestedEpisodes.length} Episódios Prontos
                                </span>
                            </div>
                            <div className="max-h-[500px] overflow-y-auto divide-y divide-white/5">
                                {metadata.suggestedEpisodes.map((ep: any, idx: number) => (
                                    <div key={idx} className="p-4 flex items-start sm:items-center gap-3 sm:gap-4 hover:bg-white/[0.02] transition-colors group">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black shrink-0 border border-white/5 ${ep.isSpecial ? 'bg-amber-500/10 text-amber-400' : 'bg-white/5 text-primary'}`}>
                                            {ep.isSpecial ? <Star size={16} /> : (
                                                <div className="text-center leading-none">
                                                    <span className="text-[9px] opacity-50 block">S{ep.season}</span>
                                                    <span className="text-lg">E{ep.episode}</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0 space-y-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="text-xs font-bold text-white truncate">{ep.name}</p>
                                                {ep.isMulti && (
                                                    <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-[9px] text-blue-400 font-bold border border-blue-500/20 flex items-center gap-1">
                                                        <Layers size={8} /> MULTI
                                                    </span>
                                                )}
                                                {ep.quality && (
                                                    <span className="px-1.5 py-0.5 rounded bg-white/5 text-[9px] text-white/30 font-mono border border-white/5">
                                                        {ep.quality}
                                                    </span>
                                                )}
                                                {ep.codec && (
                                                    <span className="px-1.5 py-0.5 rounded bg-white/5 text-[9px] text-white/30 font-mono border border-white/5">
                                                        {ep.codec}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono text-white/30">
                                                <span className="flex items-center gap-1.5 truncate max-w-[220px] sm:max-w-[300px]" title={ep.path}>
                                                    <HardDrive size={10} /> {ep.path}
                                                </span>
                                                <span className="hidden sm:inline opacity-30">|</span>
                                                <span>Index: {ep.index}</span>
                                                <span className="hidden sm:inline opacity-30">|</span>
                                                <span>{(ep.size / 1024 / 1024).toFixed(1)} MB</span>
                                            </div>
                                        </div>

                                        <div className="hidden sm:block opacity-0 group-hover:opacity-100 transition-opacity">
                                            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-green-400">
                                                <FileVideo size={14} />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="p-4 sm:p-6 bg-white/[0.02] border-t border-white/5">
                                <Button
                                    onClick={handleBulkIngest}
                                    disabled={!selectedSeriesId || ingesting}
                                    className="w-full h-12 sm:h-14 bg-primary text-black font-black uppercase tracking-[0.18em] sm:tracking-widest hover:scale-[1.01] transition-all shadow-glow flex items-center justify-center gap-2"
                                >
                                    {ingesting ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                                    <span>Confirmar Ingestão Blindada</span>
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {!metadata && !exploring && !success && (
                <div className="py-16 sm:py-20 flex flex-col items-center justify-center text-center space-y-6 opacity-30">
                    <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center text-white/20 border border-white/10">
                        <Info size={40} />
                    </div>
                    <div className="max-w-md space-y-2">
                        <h4 className="text-white font-bold uppercase tracking-tight">O que isso faz?</h4>
                        <p className="text-white/50 text-[10px] font-medium uppercase tracking-widest leading-relaxed">
                            Insira um magnet link. A Inteligência V2 irá escanear, filtrar lixo, detectar duplicatas e preparar sua série para consumo imediato.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};
