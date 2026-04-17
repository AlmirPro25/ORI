import React from 'react';
import { motion } from 'framer-motion';
import { useVideoFeed } from '@/hooks/useVideos';
import { useDiscoveryFeed } from '@/hooks/useDiscovery';
import { VideoCard } from './VideoCard';
import { Loader2, ChevronRight, Frown, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getPtbrCoverageHint } from '@/lib/ptbr-coverage';

interface VideoSectionProps {
    title: string;
    videos: any[];
    loading?: boolean;
    icon?: React.ReactNode;
    accentTone?: 'default' | 'portuguese' | 'ready';
}

const getDiscoveryReadiness = (video: any) => {
    const score = Number(video?.clickReadyScore || 0);
    const trustBoost = video?.arconteTrustLabel ? 12 : 0;
    const radarBoost = video?.isCatalogBoosted ? 8 : 0;
    return score + trustBoost + radarBoost;
};

const sortByDiscoveryReadiness = (videos: any[]) => {
    return [...videos].sort((a, b) => {
        const readinessA = getDiscoveryReadiness(a);
        const readinessB = getDiscoveryReadiness(b);
        const ptbrA = Number(a?.ptbrConfidence || 0);
        const ptbrB = Number(b?.ptbrConfidence || 0);

        if (ptbrA !== ptbrB) return ptbrB - ptbrA;

        if (Math.abs(readinessA - readinessB) >= 10) return readinessB - readinessA;
        if (readinessA !== readinessB) return readinessB - readinessA;

        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });
};

const hasPortugueseValue = (video: any) => {
    if (Number(video?.ptbrConfidence || 0) >= 0.38) {
        return true;
    }
    const haystack = `${video?.title || ''} ${video?.tags || ''} ${video?.category || ''}`.toLowerCase();
    return Boolean(
        video?.hasDubbed ||
        video?.hasPortuguese ||
        video?.hasPortugueseAudio ||
        video?.hasPortugueseSubs ||
        video?.isPortuguese ||
        video?.isDubbed ||
        /dublado|dual audio|pt-br|portugues|legendado/.test(haystack)
    );
};

const VideoSection = ({ title, videos, loading, icon, accentTone = 'default' }: VideoSectionProps) => {
    const scrollRef = React.useRef<HTMLDivElement>(null);
    const accentClass = accentTone === 'portuguese'
        ? 'group-hover/section:text-cyan-300'
        : accentTone === 'ready'
            ? 'group-hover/section:text-emerald-300'
            : 'group-hover/section:text-primary';
    const lineClass = accentTone === 'portuguese'
        ? 'from-cyan-400/70'
        : accentTone === 'ready'
            ? 'from-emerald-400/70'
            : 'from-primary/60';

    const scroll = (direction: 'left' | 'right') => {
        if (scrollRef.current) {
            const { scrollLeft, clientWidth } = scrollRef.current;
            const scrollTo = direction === 'left' ? scrollLeft - clientWidth : scrollLeft + clientWidth;
            scrollRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
        }
    };

    if (loading) return (
        <div className="space-y-6 md:space-y-8 py-10 md:py-12 px-4 sm:px-6 md:px-16">
            <div className="flex items-center gap-4 md:gap-6 mb-6 md:mb-8">
                <Skeleton className="h-10 w-10 md:h-12 md:w-12 rounded-[1.2rem] bg-white/5" />
                <Skeleton className="h-8 md:h-10 w-48 md:w-64 bg-white/5" />
            </div>
            <div className="flex items-center gap-4 md:gap-8 overflow-hidden">
                {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="w-[9.5rem] sm:w-[11rem] md:w-[13rem] flex-shrink-0 space-y-4">
                        <Skeleton className="w-full aspect-[2/3] rounded-[2rem] bg-white/5" />
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
        <section className="space-y-6 md:space-y-10 py-10 md:py-16 group/section relative overflow-hidden">
            <div className="flex flex-col gap-3 px-4 sm:px-6 md:px-16 relative z-10 transition-transform duration-700 group-hover/section:translate-x-2">
                <div className="flex items-center gap-3 md:gap-6">
                    {icon && <div className="p-3 md:p-3.5 bg-white/5 rounded-[1.2rem] border border-white/10 backdrop-blur-3xl shadow-2xl">{icon}</div>}
                    <h2 className={`text-2xl sm:text-3xl md:text-4xl font-black tracking-[-0.04em] text-white/90 transition-all uppercase italic leading-none ${accentClass}`}>
                        {title}
                    </h2>
                    <div className={`hidden sm:block h-0.5 w-24 md:w-32 bg-gradient-to-r ${lineClass} to-transparent rounded-full opacity-0 group-hover/section:opacity-100 transition-opacity duration-700`} />
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
                    className="flex overflow-x-auto gap-4 sm:gap-6 md:gap-8 px-4 sm:px-6 md:px-16 pb-8 md:pb-12 pt-2 md:pt-4 no-scrollbar scroll-smooth snap-x snap-mandatory"
                >
                    {videos.map((video) => (
                        <div key={video.id} className="snap-start">
                            <VideoCard
                                video={video}
                                discoveryMeta={{
                                    clickReadyScore: video.clickReadyScore,
                                    arconteTrustLabel: video.arconteTrustLabel,
                                    isCatalogBoosted: video.isCatalogBoosted,
                                }}
                                languageHint={getPtbrCoverageHint(video)}
                                variant="poster"
                            />
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
    const { feed } = useDiscoveryFeed();
    const inProcessing = videos.filter(v => v.status === 'PROCESSING' || v.status === 'WAITING');
    const readyVideos = videos.filter(v => v.status === 'READY' || v.status === 'NEXUS');
    const byId = React.useMemo(() => new Map(videos.map((video) => [video.id, video])), [videos]);
    const discoveryRows = React.useMemo(() => {
        if (!feed?.rows?.length) return [];

        return feed.rows
            .map((row) => ({
                title: row.title,
                videos: sortByDiscoveryReadiness(
                    row.items
                        .filter((item) => item.kind === 'video')
                        .map((item) => {
                            const baseVideo = byId.get(item.id);
                            if (!baseVideo) return null;
                            return {
                                ...baseVideo,
                                clickReadyScore: item.clickReadyScore,
                                arconteTrustLabel: item.arconteTrustLabel,
                                isCatalogBoosted: item.isCatalogBoosted,
                                ptbrConfidence: item.ptbrConfidence,
                                ptbrCoverageLabel: item.ptbrCoverageLabel,
                            };
                        })
                        .filter(Boolean) as any[]
                ),
            }))
            .filter((row) => row.videos.length > 0);
    }, [feed, byId]);
    const watchNowVideos = React.useMemo(() => {
        const pool = discoveryRows.flatMap((row) => row.videos);
        const deduped = new Map<string, any>();

        for (const video of pool) {
            if (!video?.id) continue;
            if (!deduped.has(video.id)) {
                deduped.set(video.id, video);
            }
        }

        return sortByDiscoveryReadiness(
            Array.from(deduped.values()).filter((video) => getDiscoveryReadiness(video) >= 45)
        ).slice(0, 10);
    }, [discoveryRows]);
    const portugueseForYouVideos = React.useMemo(() => {
        const pool = discoveryRows.flatMap((row) => row.videos);
        const deduped = new Map<string, any>();

        for (const video of pool) {
            if (!video?.id) continue;
            if (!deduped.has(video.id)) {
                deduped.set(video.id, video);
            }
        }

        return sortByDiscoveryReadiness(
            Array.from(deduped.values()).filter((video) =>
                hasPortugueseValue(video) && getDiscoveryReadiness(video) >= 35
            )
        ).slice(0, 10);
    }, [discoveryRows]);
    const categories = Array.from(new Set(readyVideos.map(v => v.category || 'Geral')));

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

    return (
        <div className="relative z-10 space-y-8 pb-32">
            {/* Safe spacing from Hero/Recommendations */}
            <div className="h-8 md:h-20" />

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
                    videos={discoveryRows[0]?.videos?.slice(0, 10) || readyVideos.slice(0, 10)}
                    loading={loading}
                    icon={<Sparkles className="text-primary animate-pulse" size={24} />}
                />
            )}

            {watchNowVideos.length > 0 && (
                <VideoSection
                    title="Assistir Agora"
                    videos={watchNowVideos}
                    loading={loading}
                    icon={<Sparkles className="text-emerald-300 animate-pulse" size={24} />}
                    accentTone="ready"
                />
            )}

            {portugueseForYouVideos.length > 0 && (
                <VideoSection
                    title="Em Portugues Para Voce"
                    videos={portugueseForYouVideos}
                    loading={loading}
                    icon={<Sparkles className="text-cyan-300 animate-pulse" size={24} />}
                    accentTone="portuguese"
                />
            )}

            {discoveryRows.length > 0 ? discoveryRows.slice(1, 7).map((row) => (
                <VideoSection
                    key={row.title}
                    title={row.title}
                    videos={row.videos}
                    loading={loading}
                />
            )) : categories.map(cat => (
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
