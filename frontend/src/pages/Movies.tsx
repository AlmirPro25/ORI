import React, { useMemo } from 'react';
import { useVideoFeed } from '@/hooks/useVideos';
import { VideoCard } from '@/components/VideoCard';
import { motion } from 'framer-motion';
import { Film } from 'lucide-react';
import { Video } from '@/types/schema';
import { useDiscoveryFeed } from '@/hooks/useDiscovery';
import { ExperienceLoader } from '@/components/ExperienceLoader';
import { getPtbrCoverageHint } from '@/lib/ptbr-coverage';

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
                        ptbrConfidence: item.ptbrConfidence,
                        ptbrCoverageLabel: item.ptbrCoverageLabel,
                        isPortuguese: item.isPortuguese,
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
            const ptbrConfidenceA = Number(discoveryMetaById.get(a.id)?.ptbrConfidence || 0);
            const ptbrConfidenceB = Number(discoveryMetaById.get(b.id)?.ptbrConfidence || 0);
            const ptbrA = discoveryPortuguese.has(a.id) || hasPortuguesePriority(a);
            const ptbrB = discoveryPortuguese.has(b.id) || hasPortuguesePriority(b);
            const readinessA = getDiscoveryReadiness(discoveryMetaById.get(a.id));
            const readinessB = getDiscoveryReadiness(discoveryMetaById.get(b.id));

            if (ptbrConfidenceA !== ptbrConfidenceB) return ptbrConfidenceB - ptbrConfidenceA;
            if (ptbrA !== ptbrB) return ptbrA ? -1 : 1;
            if (Math.abs(readinessA - readinessB) >= 10) return readinessB - readinessA;
            if (indexA !== undefined && indexB !== undefined) return indexA - indexB;
            if (indexA !== undefined) return -1;
            if (indexB !== undefined) return 1;
            if (readinessA !== readinessB) return readinessB - readinessA;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
    }, [videos, feed, discoveryMetaById]);

    const getMovieLanguageHint = React.useCallback((video: Video) => {
        const discoveryHint = getPtbrCoverageHint({
            ptbrCoverageLabel: discoveryMetaById.get(video.id)?.ptbrCoverageLabel,
            isPortuguese: discoveryMetaById.get(video.id)?.isPortuguese,
        });
        if (discoveryHint) return discoveryHint;
        if (video.hasPortugueseAudio || video.hasDubbed) {
            return { tone: 'strong' as const, label: 'PT-BR forte' };
        }
        if (video.hasPortugueseSubs || video.hasPortuguese) {
            return { tone: 'subtitle' as const, label: 'Mais legenda' };
        }
        if (hasPortuguesePriority(video)) {
            return { tone: 'weak' as const, label: 'Cobertura instavel' };
        }
        return null;
    }, [discoveryMetaById]);

    if (loading || discoveryLoading) {
        return (
            <div className="min-h-screen bg-background pt-24 px-4 sm:px-6 pb-20">
                <ExperienceLoader label="Carregando catalogo de filmes" variant="catalog" className="px-0" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background pt-24 px-4 sm:px-6 pb-20">
            <div className="max-w-7xl mx-auto space-y-8 sm:space-y-12">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 sm:gap-6"
                >
                    <div className="flex items-start sm:items-center gap-4">
                        <div className="p-3 sm:p-4 bg-gradient-to-br from-primary/10 to-purple-500/10 rounded-2xl border border-primary/20">
                            <Film className="w-8 h-8 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-4xl md:text-5xl font-black text-white tracking-tight leading-tight">
                                Filmes <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-400">Nexus</span>
                            </h1>
                            <p className="text-white/30 text-xs sm:text-sm font-medium mt-1">
                                {movies.length} filme{movies.length !== 1 ? 's' : ''} no catalogo
                            </p>
                        </div>
                    </div>

                <p className="max-w-xl text-white/35 text-sm md:text-right">
                        Longas-metragens organizados pelo feed editorial do Arconte.
                    </p>
                </motion.div>

                {movies.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-4 md:gap-5">
                        {movies.map((video, idx) => (
                            <motion.div
                                key={video.id}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: idx * 0.05 }}
                                className="flex justify-center min-w-0"
                            >
                                <VideoCard video={video} discoveryMeta={discoveryMetaById.get(video.id)} languageHint={getMovieLanguageHint(video)} variant="poster" />
                            </motion.div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-16 sm:py-20 opacity-50">
                        <p className="text-lg sm:text-xl font-mono uppercase tracking-[0.16em] sm:tracking-widest">Nenhum filme detectado no indice.</p>
                        <p className="text-sm mt-4 text-white/40 max-w-md mx-auto">
                            O backend esta online, mas sua base local ainda nao possui filmes catalogados.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};
