import React, { useMemo } from 'react';
import { useVideoFeed } from '@/hooks/useVideos';
import { VideoCard } from '@/components/VideoCard';
import { motion } from 'framer-motion';
import { Film, Loader2 } from 'lucide-react';
import { Video } from '@/types/schema';
import { useDiscoveryFeed } from '@/hooks/useDiscovery';

const CATALOG_STATUSES = new Set(['READY', 'REMOTE', 'CATALOG', 'NEXUS']);

const MOVIE_TERMS = [
    'filme', 'filmes', 'movie', 'movies', 'acao', 'aÃ§Ã£o', 'drama',
    'comedia', 'comÃ©dia', 'documentario', 'documentÃ¡rio', 'animacao',
    'animaÃ§Ã£o', 'terror', 'sci-fi', 'ficcao cientifica', 'ficÃ§Ã£o cientÃ­fica'
];

function isMovieLike(video: Video) {
    const category = (video.category || '').toLowerCase();
    const title = (video.title || '').toLowerCase();
    const tags = (video.tags || '').toLowerCase();

    if (category === 'series' || tags.includes('series')) return false;
    return MOVIE_TERMS.some(term => category.includes(term) || title.includes(term) || tags.includes(term));
}

function hasPortuguesePriority(video: Video) {
    const haystack = `${video.title || ''} ${video.tags || ''} ${video.category || ''}`.toLowerCase();
    return Boolean(
        video.hasDubbed ||
        video.hasPortuguese ||
        video.hasPortugueseAudio ||
        video.hasPortugueseSubs ||
        /dublado|dual audio|pt-br|portugues|legendado/.test(haystack)
    );
}

function getDiscoveryReadiness(meta?: {
    clickReadyScore?: number;
    arconteTrustLabel?: string;
    isCatalogBoosted?: boolean;
}) {
    const score = Number(meta?.clickReadyScore || 0);
    return score + (meta?.arconteTrustLabel ? 12 : 0) + (meta?.isCatalogBoosted ? 8 : 0);
}

export const MoviesPage: React.FC = () => {
    const { videos, loading } = useVideoFeed();
    const { feed, loading: discoveryLoading } = useDiscoveryFeed();
    const discoveryMetaById = useMemo(() => {
        return new Map(
            (feed?.movies || [])
                .filter((item) => item.kind === 'video')
                .map((item) => [
                    item.id,
                    {
                        clickReadyScore: item.clickReadyScore,
                        arconteTrustLabel: item.arconteTrustLabel,
                        isCatalogBoosted: item.isCatalogBoosted,
                    },
                ])
        );
    }, [feed]);

    const movies = useMemo(() => {
        const videosById = new Map(videos.map((video) => [video.id, video]));
        const discoveryMovieIds = new Set(
            (feed?.movies || []).filter((item) => item.kind === 'video').map((item) => item.id)
        );
        const baseMovies = videos.filter(video =>
            CATALOG_STATUSES.has(video.status) &&
            (isMovieLike(video) || discoveryMovieIds.has(video.id))
        );
        const discoveryOrder = new Map(
            (feed?.movies || []).filter((item) => item.kind === 'video').map((item, index) => [item.id, index])
        );
        const discoveryPortuguese = new Set(
            (feed?.movies || [])
                .filter((item) => item.kind === 'video' && (item.isPortuguese || item.isDubbed))
                .map((item) => item.id)
        );
        const synthesizedDiscoveryMovies = (feed?.movies || [])
            .filter((item) => item.kind === 'video')
            .map((item) => {
                const existing = videosById.get(item.id);
                if (existing) return existing;

                return {
                    id: item.id,
                    title: item.title,
                    originalTitle: item.title,
                    description: item.subtitle,
                    category: item.category || 'Movies',
                    status: (item.status as Video['status']) || 'CATALOG',
                    originalFilename: item.title,
                    storageKey: '',
                    hlsPath: null,
                    thumbnailPath: item.image,
                    hasDubbed: item.isDubbed,
                    hasPortuguese: item.isPortuguese,
                    hasPortugueseAudio: item.isDubbed,
                    hasPortugueseSubs: item.isPortuguese,
                    tags: Array.isArray(item.tags) ? item.tags.join(', ') : '',
                    duration: null,
                    views: item.views || 0,
                    userId: 'nexus-agent-system',
                    createdAt: item.createdAt,
                    updatedAt: item.createdAt,
                } as Video;
            });

        const mergedMovies = [...baseMovies];
        for (const candidate of synthesizedDiscoveryMovies) {
            if (!mergedMovies.some((video) => video.id === candidate.id)) mergedMovies.push(candidate);
        }

        return [...mergedMovies].sort((a, b) => {
            const indexA = discoveryOrder.get(a.id);
            const indexB = discoveryOrder.get(b.id);
            const ptbrA = discoveryPortuguese.has(a.id) || hasPortuguesePriority(a);
            const ptbrB = discoveryPortuguese.has(b.id) || hasPortuguesePriority(b);
            const readinessA = getDiscoveryReadiness(discoveryMetaById.get(a.id));
            const readinessB = getDiscoveryReadiness(discoveryMetaById.get(b.id));

            if (ptbrA !== ptbrB) return ptbrA ? -1 : 1;
            if (Math.abs(readinessA - readinessB) >= 10) return readinessB - readinessA;
            if (indexA !== undefined && indexB !== undefined) return indexA - indexB;
            if (indexA !== undefined) return -1;
            if (indexB !== undefined) return 1;
            if (readinessA !== readinessB) return readinessB - readinessA;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
    }, [videos, feed, discoveryMetaById]);

    if (loading || discoveryLoading) {
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
                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-6"
                >
                    <div className="flex items-center gap-4">
                        <div className="p-4 bg-gradient-to-br from-primary/10 to-purple-500/10 rounded-2xl border border-primary/20">
                            <Film className="w-8 h-8 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">
                                Filmes <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-400">Nexus</span>
                            </h1>
                            <p className="text-white/30 text-sm font-medium mt-1">
                                {movies.length} filme{movies.length !== 1 ? 's' : ''} no catalogo
                            </p>
                        </div>
                    </div>

                    <p className="max-w-xl text-white/35 text-sm md:text-right">
                        Longas-metragens organizados pelo feed editorial do Arconte.
                    </p>
                </motion.div>

                {movies.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
                        {movies.map((video, idx) => (
                            <motion.div
                                key={video.id}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: idx * 0.05 }}
                                className="flex justify-center"
                            >
                                <VideoCard video={video} discoveryMeta={discoveryMetaById.get(video.id)} variant="poster" />
                            </motion.div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-20 opacity-50">
                        <p className="text-xl font-mono uppercase tracking-widest">Nenhum filme detectado no indice.</p>
                        <p className="text-sm mt-4 text-white/40">
                            O backend esta online, mas sua base local ainda nao possui filmes catalogados.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};
