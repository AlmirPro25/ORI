import React from 'react';
import { motion } from 'framer-motion';
import { useVideoFeed } from '@/hooks/useVideos';
import { VideoCard } from './VideoCard';
import { Loader2, ChevronRight, Frown, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface VideoSectionProps {
    title: string;
    videos: any[];
    loading?: boolean;
    icon?: React.ReactNode;
}

const VideoSection = ({ title, videos, loading, icon }: VideoSectionProps) => {
    const scrollRef = React.useRef<HTMLDivElement>(null);

    const scroll = (direction: 'left' | 'right') => {
        if (scrollRef.current) {
            const { scrollLeft, clientWidth } = scrollRef.current;
            const scrollTo = direction === 'left' ? scrollLeft - clientWidth : scrollLeft + clientWidth;
            scrollRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
        }
    };

    if (loading) return (
        <div className="space-y-8 py-12 px-6 md:px-16">
            <div className="flex items-center gap-6 mb-8">
                <Skeleton className="h-12 w-12 rounded-[1.2rem] bg-white/5" />
                <Skeleton className="h-10 w-64 bg-white/5" />
            </div>
            <div className="flex items-center gap-8 overflow-hidden">
                {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="w-64 md:w-80 flex-shrink-0 space-y-4">
                        <Skeleton className="w-full aspect-video rounded-[2.5rem] bg-white/5" />
                        <div className="space-y-2 px-2">
                            <Skeleton className="h-5 w-3/4 bg-white/5" />
                            <Skeleton className="h-4 w-1/2 bg-white/5 opacity-50" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    if (videos.length === 0) return null;

    return (
        <section className="space-y-10 py-16 group/section relative overflow-hidden">
            <div className="flex flex-col gap-3 px-6 md:px-16 relative z-10 transition-transform duration-700 group-hover/section:translate-x-2">
                <div className="flex items-center gap-6">
                    {icon && <div className="p-3.5 bg-white/5 rounded-[1.2rem] border border-white/10 backdrop-blur-3xl shadow-2xl">{icon}</div>}
                    <h2 className="text-3xl md:text-4xl font-black tracking-[-0.04em] text-white/90 group-hover/section:text-primary transition-all uppercase italic leading-none">
                        {title}
                    </h2>
                    <div className="h-0.5 w-32 bg-gradient-to-r from-primary/60 to-transparent rounded-full opacity-0 group-hover/section:opacity-100 transition-opacity duration-700" />
                </div>
                <div className="h-px w-full bg-gradient-to-r from-white/10 via-white/5 to-transparent absolute bottom-0 left-0 hidden md:block" />
            </div>

            <div className="relative group/slider mt-4">
                {/* Botões de Navegação (Premium) */}
                <button
                    onClick={() => scroll('left')}
                    className="absolute left-6 top-1/2 -translate-y-1/2 z-30 w-16 h-16 rounded-full bg-black/40 backdrop-blur-2xl border border-white/10 text-white opacity-0 group-hover/slider:opacity-100 transition-all duration-500 scale-90 hover:scale-100 hover:bg-primary hover:text-black flex items-center justify-center -translate-x-4 group-hover/slider:translate-x-0 hidden md:flex"
                >
                    <ChevronRight size={32} className="rotate-180" />
                </button>

                <div
                    ref={scrollRef}
                    className="flex overflow-x-auto gap-8 px-6 md:px-16 pb-12 pt-4 no-scrollbar scroll-smooth snap-x snap-mandatory"
                >
                    {videos.map((video) => (
                        <div key={video.id} className="snap-start">
                            <VideoCard video={video} />
                        </div>
                    ))}
                </div>

                <button
                    onClick={() => scroll('right')}
                    className="absolute right-6 top-1/2 -translate-y-1/2 z-30 w-16 h-16 rounded-full bg-black/40 backdrop-blur-2xl border border-white/10 text-white opacity-0 group-hover/slider:opacity-100 transition-all duration-500 scale-90 hover:scale-100 hover:bg-primary hover:text-black flex items-center justify-center translate-x-4 group-hover/slider:translate-x-0 hidden md:flex"
                >
                    <ChevronRight size={32} />
                </button>

                {/* Perspective Fades */}
                <div className="absolute top-0 right-0 bottom-0 w-32 bg-gradient-to-l from-background via-background/40 to-transparent pointer-events-none z-20 hidden md:block" />
                <div className="absolute top-0 left-0 bottom-0 w-32 bg-gradient-to-r from-background via-background/40 to-transparent pointer-events-none z-20 hidden md:block" />
            </div>
        </section>
    );
};

export const VideoList: React.FC = () => {
    const { videos, loading, error, refresh } = useVideoFeed();

    if (error) {
        return (
            <div className="container mx-auto px-6 py-32 text-center relative z-20">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="glass-card p-16 max-w-2xl mx-auto border-red-500/20 rounded-[3rem] backdrop-blur-3xl"
                >
                    <div className="w-24 h-24 bg-red-500/10 rounded-[2rem] flex items-center justify-center mx-auto mb-10 border border-red-500/20">
                        <Frown size={48} className="text-red-500" />
                    </div>
                    <h2 className="text-4xl font-black mb-4 text-white uppercase italic italic tracking-tighter">Sinal Interrompido</h2>
                    <p className="text-white/40 mb-10 text-sm uppercase tracking-[0.2em]">Uplink connection lost with the central media core.</p>
                    <Button
                        onClick={() => refresh()}
                        className="h-14 px-10 rounded-2xl border-red-500/50 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all font-black uppercase tracking-widest"
                        variant="outline"
                    >
                        Restabelecer Uplink
                    </Button>
                </motion.div>
            </div>
        );
    }

    const inProcessing = videos.filter(v => v.status === 'PROCESSING' || v.status === 'WAITING');
    const readyVideos = videos.filter(v => v.status === 'READY' || v.status === 'NEXUS');

    // Agrupar por categoria (apenas os READY)
    const categories = Array.from(new Set(readyVideos.map(v => v.category || 'Geral')));

    return (
        <div className="relative z-10 space-y-8 pb-32">
            {/* Safe spacing from Hero/Recommendations */}
            <div className="h-20" />

            {inProcessing.length > 0 && (
                <VideoSection
                    title="Em Laboratório"
                    videos={inProcessing}
                    loading={loading}
                    icon={<Loader2 className="animate-spin text-primary" size={24} />}
                />
            )}

            {readyVideos.length > 0 && (
                <VideoSection
                    title="Destaques Nexus"
                    videos={readyVideos.slice(0, 10)}
                    loading={loading}
                    icon={<Sparkles className="text-primary animate-pulse" size={24} />}
                />
            )}

            {categories.map(cat => (
                <VideoSection
                    key={cat}
                    title={cat}
                    videos={readyVideos.filter(v => (v.category || 'Geral') === cat)}
                    loading={loading}
                />
            ))}

            {videos.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center py-40 opacity-20">
                    <p className="text-xs font-black uppercase tracking-[1em] text-white">Catálogo Vazio</p>
                    <p className="text-[10px] font-mono mt-4">NO MEDIA ASSETS DETECTED IN INDEX</p>
                </div>
            )}
        </div>
    );
};
