import React, { useMemo } from 'react';
import { useVideoFeed } from '@/hooks/useVideos';
import { VideoCard } from '@/components/VideoCard';
import { motion } from 'framer-motion';
import { Film, Loader2 } from 'lucide-react';

export const MoviesPage: React.FC = () => {
    const { videos, loading } = useVideoFeed();

    const movies = useMemo(() => {
        return videos.filter(v =>
            v.status === 'READY' &&
            (v.category === 'Filme' || v.category === 'Movies' || v.category === 'Ação' || v.category === 'Documentário') // Expanding definition of 'Movie' based on likely categories
        );
    }, [videos]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="animate-spin text-primary" size={48} />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background pt-24 px-6 pb-20">
            <div className="max-w-7xl mx-auto space-y-12">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-4 border-b border-white/10 pb-8"
                >
                    <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20">
                        <Film className="w-8 h-8 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter text-white">
                            Cine <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-500">Nexus</span>
                        </h1>
                        <p className="text-white/40 text-lg font-medium mt-2">
                            Longas-metragens processados e indexados pelo núcleo.
                        </p>
                    </div>
                </motion.div>

                {movies.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                        {movies.map((video, idx) => (
                            <motion.div
                                key={video.id}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: idx * 0.05 }}
                            >
                                <VideoCard video={video} />
                            </motion.div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-20 opacity-50">
                        <p className="text-xl font-mono uppercase tracking-widest">Nenhum filme detectado no índice.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
