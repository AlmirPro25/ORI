import { useState } from 'react';
import { Search, Download, Play, Loader2, Server, Wifi, HardDrive, Database, Music, FileText, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import { TorrentDownloadManager } from '@/components/TorrentDownloadManager';
import { PTBRBadges } from '@/components/PTBRBadges';
import { cn } from '@/lib/utils';

const NEXUS_API = 'http://localhost:3005';
const GATEWAY_URL = 'http://localhost:3333';

interface TorrentResult {
    title: string;
    magnetLink: string;
    size: string;
    seeds: number;
    peers: number;
    provider: string;
    quality?: string;
    year?: number;
}

interface TorrentPreview {
    videoFiles: number;
    audioFiles: number;
    subtitleFiles: number;
    totalFiles: number;
    hasMultipleAudio: boolean;
    hasSubtitles: boolean;
    languages: string[];
}

export function TorrentSearch() {
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState<'Movies' | 'TV' | 'Anime' | 'All'>('All');
    const [results, setResults] = useState<TorrentResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchMode, setSearchMode] = useState<'semantic' | 'ultra' | 'extended' | 'advanced' | 'ptbr'>('semantic');
    const [ptbrOnly, setPtbrOnly] = useState(false);
    const [selectedForDownload, setSelectedForDownload] = useState<TorrentResult | null>(null);
    const [torrentPreviews, setTorrentPreviews] = useState<Map<string, any>>(new Map());
    const [loadingPreview, setLoadingPreview] = useState<string | null>(null);
    const navigate = useNavigate();
    const location = useLocation();

    const handleSearch = async () => {
        if (!query.trim()) return;

        setLoading(true);
        try {
            const endpoint = searchMode === 'semantic' ? '/api/search/semantic' :
                searchMode === 'ptbr' ? '/api/search/ptbr' :
                searchMode === 'ultra' ? '/api/search/ultra' :
                searchMode === 'extended' ? '/api/search/extended' :
                    '/api/search/advanced';

            const response = await axios.post(`${NEXUS_API}${endpoint}`, {
                query: query.trim(),
                category,
                limit: 15,
                prioritizePTBR: true,
                ptbrOnly: ptbrOnly,
                useAI: true
            });

            console.log(`📊 Busca ${searchMode.toUpperCase()}:`, response.data);
            setResults(response.data.results || []);
        } catch (error) {
            console.error('Erro na busca:', error);
            alert('Erro ao buscar torrents. Verifique se o Nexus está rodando.');
        } finally {
            setLoading(false);
        }
    };

    const getTorrentPreview = async (magnetLink: string) => {
        const cached = torrentPreviews.get(magnetLink);
        if (cached) return cached;

        setLoadingPreview(magnetLink);
        try {
            const res = await fetch(`${GATEWAY_URL}/api/torrent/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ magnetURI: magnetLink, preview: true })
            });

            const data = await res.json();
            if (res.status === 202 || data?.pending) {
                setTorrentPreviews(prev => new Map(prev).set(magnetLink, 'pending'));
                return 'pending';
            }

            if (!res.ok) throw new Error(data?.error || 'Falha ao carregar preview');

            const files = data.files || [];

            const audioFiles = files.filter((f: any) => f.name.match(/\.(mp3|aac|ac3|dts|flac|ogg|opus|m4a)$/i));
            const subtitleFiles = files.filter((f: any) => f.name.match(/\.(srt|vtt|sub|ass)$/i));
            const languages = new Set<string>();

            [...audioFiles, ...subtitleFiles].forEach((f: any) => {
                const name = f.name.toLowerCase();
                if (name.includes('pt') || name.includes('portuguese') || name.includes('dublado')) languages.add('PT');
                if (name.includes('en') || name.includes('english')) languages.add('EN');
                if (name.includes('es') || name.includes('spanish')) languages.add('ES');
                if (name.includes('jp') || name.includes('japanese')) languages.add('JP');
            });

            const preview: TorrentPreview = {
                videoFiles: files.filter((f: any) => f.name.match(/\.(mp4|mkv|webm|avi|mov)$/i)).length,
                audioFiles: audioFiles.length,
                subtitleFiles: subtitleFiles.length,
                totalFiles: files.length,
                hasMultipleAudio: audioFiles.length > 0,
                hasSubtitles: subtitleFiles.length > 0,
                languages: Array.from(languages)
            };

            setTorrentPreviews(prev => new Map(prev).set(magnetLink, preview));
            return preview;
        } catch (error) {
            console.error('Preview error:', error);
            setTorrentPreviews(prev => new Map(prev).set(magnetLink, 'failed'));
            return 'failed';
        } finally {
            setLoadingPreview(null);
        }
    };

    const handleAddToCatalog = async (result: TorrentResult) => {
        try {
            await axios.post('http://localhost:3000/api/v1/videos/auto-ingest', {
                title: result.title,
                description: `Provider: ${result.provider} | Seeds: ${result.seeds} | Size: ${result.size}`,
                category: 'Geral',
                externalSource: result.magnetLink,
                thumbnailUrl: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?q=80&w=1280&auto=format&fit=crop',
                tags: [result.provider, category, result.quality || 'HD'].filter(Boolean)
            });

            alert('✅ Adicionado ao catálogo! Processando...');
        } catch (error) {
            console.error('Erro ao adicionar:', error);
            alert('❌ Erro ao adicionar ao catálogo');
        }
    };

    const handleWatchNow = async (result: TorrentResult) => {
        // Enviar para o catálogo automaticamente para que o histórico funcione e apareça na Home
        const tmdbData = (location as any).state?.tmdb;

        try {
            axios.post('http://localhost:3000/api/v1/videos/auto-ingest', {
                title: tmdbData?.title || result.title,
                description: tmdbData?.overview || `Provider: ${result.provider} | Seeds: ${result.seeds} | Size: ${result.size}`,
                category: tmdbData?.media_type === 'tv' ? 'Series' : (category === 'All' ? 'Movies' : category),
                externalSource: result.magnetLink,
                thumbnailUrl: tmdbData?.backdrop_path || tmdbData?.poster_path || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=1280&auto=format&fit=crop',
                tags: [result.provider, result.quality || 'HD', 'Instant', tmdbData ? 'Enriched' : null].filter(Boolean)
            }).catch(e => console.warn('Auto-ingest silently failed:', e));
        } catch (e) { }

        const infoHash = result.magnetLink.match(/btih:([a-zA-Z0-9]+)/)?.[1] || 'stream';
        navigate(`/video/${infoHash}`, {
            state: {
                magnetLink: result.magnetLink,
                title: result.title,
                provider: result.provider
            }
        });
    };

    return (
        <div className="min-h-screen bg-background text-white relative overflow-hidden flex flex-col pt-24">
            {/* Ambient Background */}
            <div className="absolute inset-0 z-0">
                <div className="absolute top-0 left-1/4 w-[800px] h-[800px] bg-cyan-500/10 rounded-full blur-[150px] animate-pulse" />
                <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-[150px] animate-pulse delay-1000" />
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 mix-blend-overlay" />
            </div>

            <div className="container mx-auto px-6 relative z-10 max-w-6xl">
                {/* Header Section */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center space-y-6 mb-16"
                >
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-mono uppercase tracking-widest mb-4">
                        <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                        Decentralized Search Protocol
                    </div>

                    <h1 className="text-6xl md:text-7xl font-black uppercase italic tracking-tighter leading-none mb-2">
                        Nexus <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">Deep Search</span>
                    </h1>
                    <p className="text-xl text-white/40 max-w-2xl mx-auto font-medium">
                        Indexação neural de múltiplas fontes torrent em tempo real. Acesso direto à rede descentralizada.
                    </p>
                </motion.div>

                {/* Search Container */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 }}
                    className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-[2rem] p-8 shadow-2xl relative overflow-hidden group mb-12"
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

                    <div className="relative z-10 flex flex-col md:flex-row gap-4 mb-8">
                        <div className="flex-1 relative group/input">
                            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-white/30 group-focus-within/input:text-cyan-400 transition-colors" size={24} />
                            <Input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                                placeholder="Buscar filmes, séries, anime..."
                                className="pl-16 h-20 bg-white/5 border-white/10 rounded-2xl text-xl text-white placeholder:text-white/20 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all shadow-inner"
                            />
                        </div>
                        <Button
                            onClick={handleSearch}
                            disabled={loading || !query.trim()}
                            className="h-20 px-12 rounded-2xl bg-white text-black font-black uppercase tracking-widest text-lg hover:bg-cyan-400 transition-all shadow-glow hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                        >
                            {loading ? <Loader2 className="animate-spin" /> : 'Buscar'}
                        </Button>
                    </div>

                    {/* Filters & Mode */}
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6 relative z-10">
                        <div className="flex bg-white/5 p-1.5 rounded-xl border border-white/10">
                            {(['All', 'Movies', 'TV', 'Anime'] as const).map((cat) => (
                                <button
                                    key={cat}
                                    onClick={() => setCategory(cat)}
                                    className={cn(
                                        "px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all",
                                        category === cat
                                            ? "bg-white text-black shadow-lg scale-105"
                                            : "text-white/40 hover:text-white hover:bg-white/5"
                                    )}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center gap-4 bg-white/5 px-4 py-2 rounded-xl border border-white/10">
                            <span className="text-[10px] font-black uppercase text-white/20 tracking-widest">Modo</span>
                            <div className="flex gap-2">
                                {(['semantic', 'ptbr', 'ultra', 'extended', 'advanced'] as const).map((mode) => (
                                    <button
                                        key={mode}
                                        onClick={() => setSearchMode(mode)}
                                        className={cn(
                                            "px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                                            searchMode === mode
                                                ? mode === 'semantic'
                                                    ? "bg-purple-500 text-white shadow-lg scale-105"
                                                    : mode === 'ptbr' 
                                                        ? "bg-green-500 text-black shadow-lg scale-105"
                                                        : "bg-cyan-400 text-black shadow-lg scale-105"
                                                : "text-white/40 hover:text-white hover:bg-white/5"
                                        )}
                                        title={
                                            mode === 'semantic' ? '🧠 Busca Inteligente com IA' :
                                            mode === 'ptbr' ? '🇧🇷 Busca Prioritária PT-BR' : 
                                            mode.toUpperCase()
                                        }
                                    >
                                        {mode === 'semantic' ? '🧠 IA' : mode === 'ptbr' ? '🇧🇷 PT-BR' : mode}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Toggle PT-BR Only */}
                        <button
                            onClick={() => setPtbrOnly(!ptbrOnly)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-xl border transition-all",
                                ptbrOnly
                                    ? "bg-green-500/20 border-green-500/50 text-green-300"
                                    : "bg-white/5 border-white/10 text-white/40 hover:text-white"
                            )}
                        >
                            <span className="text-[10px] font-black uppercase tracking-widest">
                                {ptbrOnly ? '✓ Apenas PT-BR' : 'Todos os idiomas'}
                            </span>
                        </button>
                    </div>
                </motion.div>

                {/* Results Section */}
                <AnimatePresence mode="wait">
                    {loading && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex flex-col items-center justify-center py-20 gap-6"
                        >
                            <div className="relative">
                                <div className="w-24 h-24 border-4 border-white/10 border-t-cyan-400 rounded-full animate-spin" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Database className="text-cyan-400 animate-pulse" size={32} />
                                </div>
                            </div>
                            <p className="text-cyan-400/80 font-mono text-sm uppercase tracking-widest animate-pulse">Scanning Decentralized Nodes...</p>
                        </motion.div>
                    )}

                    {!loading && results.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="space-y-4 pb-20"
                        >
                            <div className="flex justify-between items-end mb-6 px-4">
                                <h3 className="text-2xl font-black italic uppercase text-white">Resultados <span className="text-white/20">({results.length})</span></h3>
                            </div>

                            {results.map((result, index) => {
                                const previewState = torrentPreviews.get(result.magnetLink);
                                const previewDetails = typeof previewState === 'object' ? previewState : null;

                                return (
                                <motion.div
                                    key={index}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                    className="group bg-white/5 hover:bg-white/10 border border-white/10 hover:border-cyan-500/30 rounded-2xl p-6 transition-all hover:scale-[1.01] hover:shadow-2xl relative overflow-hidden"
                                >
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity" />

                                    <div className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-center relative z-10">
                                        <div className="flex-1 space-y-3">
                                            {/* PT-BR Badges - Destaque no topo */}
                                            <PTBRBadges title={result.title} />
                                            
                                            <div className="flex flex-wrap gap-2">
                                                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-violet-500/20 text-violet-300 border border-violet-500/20">
                                                    {result.provider}
                                                </span>
                                                {result.quality && (
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-yellow-500/20 text-yellow-300 border border-yellow-500/20">
                                                        {result.quality}
                                                    </span>
                                                )}
                                                <button
                                                    onClick={() => getTorrentPreview(result.magnetLink)}
                                                    className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/20 hover:bg-cyan-500/30 transition-colors flex items-center gap-1"
                                                >
                                                    {loadingPreview === result.magnetLink ? (
                                                        <Loader2 size={10} className="animate-spin" />
                                                    ) : (
                                                        <Info size={10} />
                                                    )}
                                                    {previewState === 'pending' ? 'AGUARDANDO' : 'INFO'}
                                                </button>
                                                {previewState === 'pending' && (
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/20">
                                                        Metadata pendente
                                                    </span>
                                                )}
                                                {previewState === 'failed' && (
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-red-500/20 text-red-300 border border-red-500/20">
                                                        Preview indisponivel
                                                    </span>
                                                )}
                                                {previewDetails?.hasMultipleAudio && (
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-green-500/20 text-green-300 border border-green-500/20 flex items-center gap-1">
                                                        <Music size={10} /> {torrentPreviews.get(result.magnetLink)?.audioFiles} ÁUDIOS
                                                    </span>
                                                )}
                                                {typeof torrentPreviews.get(result.magnetLink) === 'object' && torrentPreviews.get(result.magnetLink)?.hasSubtitles && (
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-blue-500/20 text-blue-300 border border-blue-500/20 flex items-center gap-1">
                                                        <FileText size={10} /> {torrentPreviews.get(result.magnetLink)?.subtitleFiles} LEGENDAS
                                                    </span>
                                                )}
                                                {typeof torrentPreviews.get(result.magnetLink) === 'object' && torrentPreviews.get(result.magnetLink)?.languages.map((lang: string) => (
                                                    <span key={lang} className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-purple-500/20 text-purple-300 border border-purple-500/20">
                                                        {lang}
                                                    </span>
                                                ))}
                                            </div>
                                            <h4 className="text-lg font-bold text-white leading-tight group-hover:text-cyan-400 transition-colors">
                                                {result.title}
                                            </h4>
                                            <div className="flex items-center gap-6 text-xs font-mono text-white/50">
                                                <span className="flex items-center gap-1.5 text-green-400">
                                                    <Wifi size={14} /> {result.seeds} SEEDS
                                                </span>
                                                <span className="flex items-center gap-1.5 text-blue-400">
                                                    <HardDrive size={14} /> {result.size}
                                                </span>
                                                <span className="flex items-center gap-1.5">
                                                    <Server size={14} /> {result.peers} PEERS
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3 w-full md:w-auto">
                                            <Button
                                                onClick={() => handleWatchNow(result)}
                                                className="flex-1 md:flex-none h-12 px-6 rounded-xl bg-cyan-500 text-black font-bold hover:bg-cyan-400 hover:scale-105 transition-all"
                                            >
                                                <Play size={18} className="mr-2 fill-black" /> Assistir
                                            </Button>
                                            <Button
                                                onClick={() => setSelectedForDownload(result)}
                                                variant="outline"
                                                className="h-12 w-12 rounded-xl border-white/10 bg-black/40 hover:bg-white/20 hover:border-white/30 p-0"
                                                title="Baixar para Servidor"
                                            >
                                                <Server size={18} className="text-purple-400" />
                                            </Button>
                                            <Button
                                                onClick={() => handleAddToCatalog(result)}
                                                variant="outline"
                                                className="h-12 w-12 rounded-xl border-white/10 bg-black/40 hover:bg-white/20 hover:border-white/30 p-0"
                                                title="Adicionar ao Catálogo"
                                            >
                                                <Download size={18} className="text-white/60" />
                                            </Button>
                                        </div>
                                    </div>
                                </motion.div>
                                );
                            })}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Download Modal */}
            <AnimatePresence>
                {selectedForDownload && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="bg-[#0a0a0b] rounded-[2rem] p-8 max-w-lg w-full border border-white/10 shadow-2xl relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/20 blur-[60px] -z-10" />

                            <h3 className="text-2xl font-black italic uppercase mb-2">
                                Iniciar <span className="text-purple-500">Download</span>
                            </h3>
                            <p className="text-white/40 text-sm mb-8 font-mono border-b border-white/10 pb-4">
                                {selectedForDownload.title}
                            </p>

                            <TorrentDownloadManager
                                magnetURI={selectedForDownload.magnetLink}
                                title={selectedForDownload.title}
                                onComplete={() => {
                                    alert('✅ Download completo! Vídeo disponível na biblioteca.');
                                    setSelectedForDownload(null);
                                    navigate('/');
                                }}
                            />

                            <Button
                                onClick={() => setSelectedForDownload(null)}
                                variant="ghost"
                                className="w-full mt-6 h-12 rounded-xl text-white/40 hover:text-white hover:bg-white/5 font-bold uppercase tracking-widest text-xs"
                            >
                                Cancelar Operação
                            </Button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
