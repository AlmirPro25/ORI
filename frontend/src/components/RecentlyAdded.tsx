import React from 'react';
import { Clock } from 'lucide-react';
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

export const RecentlyAdded: React.FC = () => {
    const { feed, loading } = useDiscoveryFeed();
    const fallbackImage = `data:image/svg+xml;utf8,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450">
            <rect width="800" height="450" fill="#0a1019"/>
            <circle cx="620" cy="120" r="90" fill="#22d3ee" fill-opacity="0.12"/>
            <text x="60" y="220" fill="#f8fafc" font-size="48" font-family="Arial" font-weight="700">ARCONTE</text>
            <text x="60" y="280" fill="#67e8f9" font-size="24" font-family="Arial">conteúdo real em sincronização</text>
        </svg>
    `)}`;

    const videos = React.useMemo(() => {
        if (!feed) return [];
        return (
            feed.rows.find((row) => row.id === 'fresh-discoveries')?.items ||
            feed.spotlight ||
            []
        ).slice(0, 10);
    }, [feed]);

    if (loading || videos.length === 0) return null;

    return (
        <div className="px-6 md:px-16 py-16 relative overflow-hidden">
            <div className="absolute top-0 left-1/4 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[120px] -z-10" />

            <div className="flex items-center gap-6 mb-12">
                <div className="bg-primary/10 p-4 rounded-[1.5rem] border border-primary/20 backdrop-blur-3xl shadow-glow-sm">
                    <Clock className="text-primary w-6 h-6 animate-pulse" />
                </div>
                <div>
                    <h2 className="text-3xl font-black tracking-[-0.02em] text-white uppercase italic flex items-center gap-3">
                        Arconte <span className="text-gradient-primary">No Controle</span>
                    </h2>
                    <p className="text-[10px] text-white/30 font-black uppercase tracking-[0.4em] mt-1 ml-0.5">Novidades reais e prateleiras vivas</p>
                </div>
            </div>

            <div className="flex gap-8 overflow-x-auto pb-12 no-scrollbar snap-x snap-mandatory">
                {videos.map((video, idx) => (
                    <motion.div
                        key={`${video.kind}-${video.id}`}
                        initial={{ opacity: 0, scale: 0.9, x: 20 }}
                        whileInView={{ opacity: 1, scale: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: idx * 0.1, duration: 0.8, ease: 'easeOut' }}
                        className="flex-shrink-0 w-80 snap-start group"
                    >
                        <Link to={video.href}>
                            <div className="relative aspect-video rounded-[2.5rem] overflow-hidden border border-white/5 transition-all duration-700 group-hover:border-primary/40 shadow-2xl group-hover:shadow-primary/10">
                                <img
                                    src={resolveImage(video)}
                                    alt={video.title}
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).src = fallbackImage;
                                    }}
                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000 opacity-60 group-hover:opacity-100 grayscale-[0.5] group-hover:grayscale-0"
                                />

                                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent flex flex-col justify-end p-8">
                                    <div className="flex items-center gap-2 mb-3 translate-y-4 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-500">
                                        <div className="p-1 px-2 bg-primary/20 backdrop-blur-md rounded-lg border border-primary/20">
                                            <span className="text-[8px] font-black uppercase text-primary tracking-[0.2em]">{video.badge} • {getSafetyLabel(video)}</span>
                                        </div>
                                    </div>
                                    <h3 className="text-xl font-black text-white/80 truncate group-hover:text-white transition-colors tracking-tight uppercase italic leading-none">
                                        {video.title}
                                    </h3>
                                    <p className="text-[10px] uppercase tracking-[0.2em] text-white/35 mt-2">
                                        {video.isPortuguese ? 'PT-BR em foco' : video.category}
                                    </p>
                                </div>

                                <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
                            </div>
                        </Link>
                    </motion.div>
                ))}
            </div>
        </div>
    );
};
