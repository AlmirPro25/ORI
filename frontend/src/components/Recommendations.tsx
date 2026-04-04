import React from 'react';
import { Sparkles, Play, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { STORAGE_BASE_URL } from '@/lib/axios';
import { useDiscoveryFeed } from '@/hooks/useDiscovery';
import { DiscoveryItem } from '@/types/discovery';

const resolveImage = (item: DiscoveryItem) => {
    const image = item.image || item.backdrop || '';
    if (!image) return '';
    return image.startsWith('http') ? image : `${STORAGE_BASE_URL}/${image}`;
};

const getSafetyLabel = (item: DiscoveryItem) => {
    if (item.safetyLabel === 'kids-safe') return 'Kids Safe';
    if (item.safetyLabel === 'family-safe') return 'Family Safe';
    if (item.safetyLabel === 'adult') return 'Adulto';
    return 'Geral';
};

export const Recommendations: React.FC = () => {
    const { feed, loading } = useDiscoveryFeed();

    const videos = React.useMemo(() => {
        if (!feed) return [];
        const hour = new Date().getHours();
        const preferredRowId = hour < 18 ? 'light-now' : hour < 23 ? 'movie-night' : 'marathon-mode';

        return (
            feed.rows.find((row) => row.id === preferredRowId)?.items ||
            feed.rows.find((row) => row.id === 'family-portuguese')?.items ||
            feed.rows.find((row) => row.id === 'because-you-like')?.items ||
            feed.spotlight ||
            []
        ).slice(0, 10);
    }, [feed]);

    if (loading || videos.length === 0) return null;

    return (
        <div className="px-6 md:px-16 py-20 relative">
            <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-8">
                <div className="flex items-center gap-6">
                    <div className="bg-accent/10 p-5 rounded-[2rem] border border-accent/20 backdrop-blur-3xl shadow-[0_0_40px_rgba(var(--accent)/0.1)]">
                        <Sparkles className="text-accent w-8 h-8 animate-pulse" />
                    </div>
                    <div>
                        <h2 className="text-4xl font-black tracking-[-0.04em] text-white uppercase italic leading-none">
                            Mood <span className="text-gradient-primary">Do Momento</span>
                        </h2>
                        <p className="text-[10px] text-white/30 font-black uppercase tracking-[0.5em] mt-2 ml-0.5">A vitrine muda junto com o horario e o jeito da casa</p>
                    </div>
                </div>

                <Link to="/addons" className="group flex items-center gap-4 px-6 py-3 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all backdrop-blur-3xl">
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 group-hover:text-white">Expandir fontes</span>
                    <ChevronRight size={16} className="text-primary group-hover:translate-x-1 transition-transform" />
                </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
                {videos.map((video, idx) => (
                    <motion.div
                        key={`${video.kind}-${video.id}`}
                        initial={{ opacity: 0, y: 40 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: idx * 0.05, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                        className="group relative"
                    >
                        <Link to={video.href}>
                            <div className="aspect-[2/3] rounded-[2rem] overflow-hidden border border-white/5 bg-white/[0.03] relative shadow-2xl transition-all duration-700 group-hover:border-primary/50 group-hover:-translate-y-2">
                                <img
                                    src={resolveImage(video)}
                                    alt={video.title}
                                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-1000 grayscale-[0.15] group-hover:grayscale-0"
                                />

                                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent opacity-90 group-hover:opacity-100 transition-opacity" />

                                <div className="absolute inset-0 flex items-center justify-center translate-y-8 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-500">
                                    <div className="bg-primary text-black p-4 rounded-full shadow-[0_0_40px_rgba(var(--primary)/0.5)] scale-90 group-hover:scale-100 transition-transform">
                                        <Play size={22} fill="currentColor" />
                                    </div>
                                </div>

                                <div className="absolute top-3 left-3 right-3 flex items-start justify-between">
                                    <span className="px-2.5 py-1 bg-black/60 backdrop-blur-2xl rounded-lg text-[7px] font-black uppercase tracking-[0.16em] text-white/85 border border-white/10">
                                        {video.badge}
                                    </span>
                                    <span className="px-2 py-1 bg-primary/15 backdrop-blur-2xl rounded-lg text-[7px] font-black uppercase tracking-[0.16em] text-primary border border-primary/20">
                                        {getSafetyLabel(video)}
                                    </span>
                                </div>

                                <div className="absolute inset-x-0 bottom-0 p-4">
                                    <h3 className="text-base font-black text-white line-clamp-2 group-hover:text-primary transition-colors uppercase italic tracking-tight">
                                        {video.title}
                                    </h3>
                                    <p className="text-[9px] text-white/55 font-black uppercase tracking-[0.18em] mt-2">
                                        {video.isPortuguese ? 'Prioridade PT-BR' : video.category}
                                    </p>
                                </div>
                            </div>
                        </Link>
                    </motion.div>
                ))}
            </div>
        </div>
    );
};
