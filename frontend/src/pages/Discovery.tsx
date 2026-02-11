import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, Loader2, Play, Youtube, Clock, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Video {
    youtubeId: string;
    title: string;
    thumbnail: string;
    channelTitle: string;
    description: string;
    publishedAt: string;
    duration?: string;
}

export function Discovery() {
    const [query, setQuery] = useState('');
    const [videos, setVideos] = useState<Video[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Busca inicial padrão
    useEffect(() => {
        handleSearch('Cyberpunk 2077 documentary');
    }, []);

    const handleSearch = async (e?: React.FormEvent | string) => {
        if (e && typeof e !== 'string') e.preventDefault();

        const searchTerm = typeof e === 'string' ? e : query;
        if (!searchTerm.trim()) return;

        setLoading(true);
        setError(null);

        try {
            const res = await fetch(`http://localhost:3000/api/search?q=${encodeURIComponent(searchTerm)}`);
            if (!res.ok) throw new Error('Falha na frequência do sinal.');
            const data = await res.json();
            setVideos(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background pt-32 pb-20 px-6 md:px-12">

            {/* Header / Search Area */}
            <div className="max-w-4xl mx-auto mb-16 text-center">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="inline-flex p-3 rounded-2xl bg-primary/10 border border-primary/20 mb-6"
                >
                    <Shield className="text-primary" size={32} />
                </motion.div>

                <h1 className="text-4xl md:text-6xl font-black text-white tracking-widest uppercase italic mb-6">
                    Global <span className="text-primary shadow-glow">Discovery</span>
                </h1>

                <p className="text-gray-500 font-mono text-xs uppercase tracking-[0.3em] mb-12">
                    Sovereignty Protocol v1 // Universal Data Mining
                </p>

                <form onSubmit={handleSearch} className="relative group">
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Pesquisar na rede global..."
                        className="w-full bg-surface border border-white/10 rounded-2xl h-16 pl-16 pr-32 text-white font-bold placeholder:text-gray-600 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/5 transition-all"
                    />
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-primary transition-colors" size={24} />

                    <button
                        type="submit"
                        disabled={loading}
                        className="absolute right-3 top-1/2 -translate-y-1/2 bg-primary text-background font-black tracking-widest uppercase px-6 h-10 rounded-xl hover:bg-emerald-400 transition-all flex items-center gap-2"
                    >
                        {loading ? <Loader2 className="animate-spin" size={18} /> : 'Minerar'}
                    </button>
                </form>
            </div>

            {/* Error State */}
            {error && (
                <div className="max-w-xl mx-auto p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm text-center font-bold uppercase tracking-widest mb-12">
                    {error}
                </div>
            )}

            {/* Results Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                {loading && videos.length === 0 ? (
                    Array(8).fill(0).map((_, i) => (
                        <div key={i} className="aspect-video bg-white/5 rounded-2xl animate-pulse" />
                    ))
                ) : (
                    videos.map((video) => (
                        <motion.div
                            key={video.youtubeId}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            whileHover={{ y: -5 }}
                            className="group relative"
                        >
                            <Link to={`/watch/yt/${video.youtubeId}`} className="block">
                                <div className="aspect-video bg-black rounded-2xl overflow-hidden border border-white/5 group-hover:border-primary/40 transition-all relative">
                                    <img
                                        src={video.thumbnail}
                                        alt={video.title}
                                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 opacity-80 group-hover:opacity-100"
                                    />

                                    <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60" />

                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center shadow-glow">
                                            <Play className="text-background fill-background ml-1" size={32} />
                                        </div>
                                    </div>

                                    <div className="absolute bottom-2 right-2 bg-black/80 px-2 py-1 rounded text-[10px] font-mono text-white/60">
                                        YT.SIGNAL
                                    </div>
                                </div>

                                <div className="mt-4 space-y-2">
                                    <h3 className="text-sm font-bold text-white line-clamp-2 leading-tight group-hover:text-primary transition-colors uppercase tracking-tight">
                                        {video.title}
                                    </h3>
                                    <div className="flex items-center justify-between text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                                        <span className="flex items-center gap-1">
                                            <Youtube size={12} className="text-red-500" />
                                            {video.channelTitle}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <Clock size={12} />
                                            {new Date(video.publishedAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                            </Link>
                        </motion.div>
                    ))
                )}
            </div>
        </div>
    );
}
