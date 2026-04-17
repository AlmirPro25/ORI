import React from 'react';
import { Video } from '@/types/schema';
import { Play, Plus, Trash2, Loader2, AlertTriangle, Sparkles, Bookmark } from 'lucide-react';
import { Link } from 'react-router-dom';
import { STORAGE_BASE_URL } from '@/lib/axios';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/lib/utils';
import VideoService from '@/services/api/video.service';
import { MediaBadges } from './MediaBadges';
import { prefetchVideoExperience } from '@/lib/route-prefetch';
import { useFavorites } from '@/hooks/useFavorites';

interface VideoCardProps {
    video: Video;
    discoveryMeta?: {
        clickReadyScore?: number;
        arconteTrustLabel?: string;
        isCatalogBoosted?: boolean;
    };
    languageHint?: {
        tone: 'strong' | 'subtitle' | 'weak';
        label: string;
        detail?: string;
    } | null;
    variant?: 'landscape' | 'poster';
    onDeleted?: () => void;
}

export const VideoCard: React.FC<VideoCardProps> = ({ video, discoveryMeta, languageHint, variant = 'landscape', onDeleted }) => {
    const { user } = useAuthStore();
    const { isFavorited, toggleFavorite } = useFavorites();
    const cardRef = React.useRef<HTMLDivElement | null>(null);
    const [isDeleting, setIsDeleting] = React.useState(false);
    const isAdmin = user?.role === 'ADMIN';
    const isPosterVariant = variant === 'poster';
    const favorited = isFavorited(video.id);
    const isPlayableEntry = ['READY', 'NEXUS', 'CATALOG', 'REMOTE'].includes(String(video.status || ''));
    const readinessTone = React.useMemo(() => {
        const score = Number(discoveryMeta?.clickReadyScore || 0);
        if (score >= 80) return { label: 'Pronto para clicar', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30' };
        if (score >= 45) return { label: 'Boa chance de play', className: 'bg-sky-500/15 text-sky-300 border-sky-400/30' };
        if (score > 0) return { label: 'Catalogo promissor', className: 'bg-amber-500/15 text-amber-200 border-amber-400/30' };
        return null;
    }, [discoveryMeta?.clickReadyScore]);

    const thumbnail = video.thumbnailPath
        ? video.thumbnailPath.startsWith('http')
            ? video.thumbnailPath
            : `${STORAGE_BASE_URL}/${video.thumbnailPath}`
        : video.status === 'NEXUS'
            ? `https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=400&auto=format&fit=crop`
            : `https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop`;

    const handleDelete = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!window.confirm(`Deseja realmente excluir o vÃ­deo "${video.title}"?`)) return;

        setIsDeleting(true);
        try {
            await VideoService.delete(video.id);
            onDeleted?.();
        } catch (err) {
            console.error('Failed to delete video:', err);
            alert('Falha ao excluir vÃ­deo.');
        } finally {
            setIsDeleting(false);
        }
    };

    const detailsPath = `/videos/${video.id}`;
    const handlePrefetch = (priority: 'immediate' | 'idle' = 'immediate') => prefetchVideoExperience({
        id: video.id,
        status: video.status,
        hasStream: Boolean(video.hlsPath || video.storageKey),
        hasMagnet: Boolean(video.hlsPath?.startsWith('magnet:')),
    }, priority);

    React.useEffect(() => {
        const node = cardRef.current;
        if (!node) return;

        if (typeof IntersectionObserver === 'undefined') {
            handlePrefetch('idle');
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                if (!entry?.isIntersecting) return;
                handlePrefetch('idle');
                observer.disconnect();
            },
            {
                rootMargin: '240px 160px',
                threshold: 0.01,
            }
        );

        observer.observe(node);
        return () => observer.disconnect();
    }, [detailsPath]);

    return (
        <motion.div
            ref={cardRef}
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            whileHover={{ scale: 1.05, y: -10 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className={cn(
                'group relative flex-shrink-0 overflow-hidden cursor-pointer shadow-2xl transition-all duration-700 border bg-black/40 backdrop-blur-3xl',
                isPosterVariant ? 'w-[9.5rem] sm:w-[11rem] md:w-[13rem] aspect-[2/3] rounded-[1.5rem] sm:rounded-[2rem]' : 'w-[17rem] sm:w-72 md:w-80 aspect-video rounded-[1.75rem] md:rounded-[2.5rem]',
                video.status === 'NEXUS' ? 'border-primary/40 shadow-primary/10' : 'border-white/5'
            )}
        >
            <img
                src={thumbnail}
                alt={video.title}
                className={cn(
                    'w-full h-full object-cover transition-all duration-1000 group-hover:scale-110 group-hover:opacity-100 group-hover:grayscale-0',
                    isPosterVariant ? 'opacity-85 grayscale-0' : 'opacity-60 grayscale-[0.2]'
                )}
            />

            <div className={cn('absolute inset-x-0 top-0 flex justify-between items-start z-20', isPosterVariant ? 'p-2.5 sm:p-3' : 'p-4 sm:p-6')}>
                <div className={cn('flex flex-wrap items-start gap-2', isPosterVariant ? 'max-w-[62%]' : 'max-w-[70%]')}>
                    {video.category && (
                        <span className={cn(
                            'bg-black/60 backdrop-blur-2xl text-primary font-black border border-primary/20 uppercase shadow-glow-sm',
                            isPosterVariant ? 'text-[7px] px-2 py-1 rounded-lg tracking-[0.12em]' : 'text-[8px] px-4 py-1.5 rounded-xl tracking-[0.2em]'
                        )}>
                            {video.category}
                        </span>
                    )}
                    {!isPosterVariant && readinessTone && (
                        <span className={cn('font-black border uppercase text-[8px] px-4 py-1.5 rounded-xl tracking-[0.18em]', readinessTone.className)}>
                            {readinessTone.label}
                        </span>
                    )}
                    {!isPosterVariant && discoveryMeta?.isCatalogBoosted && (
                        <span className="bg-fuchsia-500/15 text-fuchsia-200 font-black border border-fuchsia-400/20 uppercase text-[8px] px-4 py-1.5 rounded-xl tracking-[0.18em]">
                            Radar do Arconte
                        </span>
                    )}
                    {languageHint && (
                        <span className={cn(
                            'font-black border uppercase',
                            isPosterVariant ? 'text-[7px] px-2 py-1 rounded-lg tracking-[0.12em]' : 'text-[8px] px-4 py-1.5 rounded-xl tracking-[0.18em]',
                            languageHint.tone === 'strong'
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/20'
                                : languageHint.tone === 'subtitle'
                                    ? 'bg-cyan-500/15 text-cyan-300 border-cyan-400/20'
                                    : 'bg-white/5 text-white/55 border-white/10'
                        )}>
                            {languageHint.label}
                        </span>
                    )}
                </div>

                <div className="flex flex-col items-end gap-2">
                    {video.status === 'NEXUS' && (
                        <div className={cn(
                            'flex items-center gap-2 bg-primary text-black font-black shadow-glow',
                            isPosterVariant ? 'text-[7px] px-2 py-1 rounded-lg' : 'text-[8px] px-4 py-1.5 rounded-xl'
                        )}>
                            <Sparkles size={12} fill="black" />
                            <span className="uppercase tracking-widest italic">NEXUS LINK</span>
                        </div>
                    )}
                    {discoveryMeta?.clickReadyScore ? (
                        <span className={cn(
                            'bg-black/60 backdrop-blur-2xl text-white/70 font-black border border-white/10 uppercase',
                            isPosterVariant ? 'text-[7px] px-2 py-1 rounded-lg tracking-[0.12em]' : 'text-[8px] px-3 py-1 rounded-xl tracking-[0.18em]'
                        )}>
                            {Math.round(discoveryMeta.clickReadyScore)} pts
                        </span>
                    ) : null}
                </div>
            </div>

            <div className={cn(
                'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/90 to-transparent transition-transform duration-700',
                isPosterVariant ? 'p-3 sm:p-4 pt-16 sm:pt-20' : 'p-3.5 sm:p-6 pt-12 sm:pt-16 translate-y-0 sm:translate-y-4 group-hover:translate-y-0'
            )}>
                <h3 className={cn(
                    'text-white font-black tracking-tight group-hover:text-primary transition-colors uppercase italic leading-none',
                    isPosterVariant ? 'text-sm sm:text-base mb-1.5 sm:mb-2 line-clamp-2' : 'text-base sm:text-lg mb-2 truncate'
                )}>
                    {video.title}
                </h3>

                {!isPosterVariant && discoveryMeta?.arconteTrustLabel && (
                    <div className="mb-3">
                        <span className="inline-flex items-center gap-2 bg-white/5 border border-white/10 font-black uppercase text-white/75 text-[9px] tracking-[0.18em] px-3 py-1.5 rounded-xl">
                            <Sparkles size={10} className="text-primary" />
                            {discoveryMeta.arconteTrustLabel}
                        </span>
                    </div>
                )}

                {!isPosterVariant ? (
                    <MediaBadges
                        audioTracks={(video as any).audioTracks}
                        subtitleTracks={(video as any).subtitleTracks}
                        hasPortuguese={(video as any).hasPortuguese}
                        hasDubbed={(video as any).hasDubbed}
                    />
                ) : (
                    <div className="mb-1">
                        <p className="text-[8px] sm:text-[9px] text-white/55 uppercase tracking-[0.14em] sm:tracking-[0.18em]">
                            {video.status === 'CATALOG' ? 'Catalogado para abrir' : 'Pronto para assistir'}
                        </p>
                        {languageHint?.detail && (
                            <p className="text-[8px] sm:text-[9px] text-white/35 mt-1">
                                {languageHint.detail}
                            </p>
                        )}
                    </div>
                )}

                <div className={cn(
                    'flex items-center gap-2.5 sm:gap-3 transition-all duration-500 scale-100 sm:scale-95 group-hover:scale-100',
                    isPosterVariant ? 'opacity-100 mt-2.5 sm:mt-3' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 mt-3 sm:mt-4'
                )}>
                    {isPlayableEntry ? (
                        <Link
                            to={detailsPath}
                            onMouseEnter={() => handlePrefetch('immediate')}
                            onFocus={() => handlePrefetch('immediate')}
                            onTouchStart={() => handlePrefetch('immediate')}
                            className="flex-1"
                        >
                            <button className={cn(
                                'w-full bg-white text-black flex items-center justify-center gap-3 hover:bg-primary hover:shadow-glow-sm transition-all transform active:scale-95 group/btn',
                                isPosterVariant ? 'h-11 rounded-[1rem]' : 'h-11 sm:h-12 rounded-[1rem] sm:rounded-[1.2rem]'
                            )}>
                                <Play size={16} fill="black" className="group-hover/btn:scale-125 transition-transform" />
                                <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                                    {video.status === 'CATALOG' ? 'Abrir' : 'Transmitir'}
                                </span>
                            </button>
                        </Link>
                    ) : (
                        <div className={cn(
                            'flex-1 bg-white/5 backdrop-blur-2xl text-primary text-[10px] font-black uppercase text-center border border-primary/20 flex items-center justify-center gap-3',
                            isPosterVariant ? 'h-11 rounded-[1rem]' : 'h-11 sm:h-12 rounded-[1rem] sm:rounded-[1.2rem]'
                        )}>
                            {video.status === 'FAILED' ? <AlertTriangle size={14} className="text-red-500" /> : <Loader2 size={14} className="animate-spin" />}
                            <span className="tracking-widest italic">{video.status}</span>
                        </div>
                    )}

                    {!isPosterVariant && (
                        <button
                            onClick={async (e) => {
                                e.preventDefault();
                                if (!user) return alert('FaÃ§a login para salvar!');
                                try {
                                    await toggleFavorite(video.id);
                                } catch (e) {
                                    console.error('Failed to toggle favorite');
                                }
                            }}
                            className={cn(
                                'transition-all border flex items-center justify-center h-11 w-11 sm:h-12 sm:w-12 rounded-[1rem] sm:rounded-[1.2rem]',
                                favorited ? 'bg-primary/20 border-primary text-primary shadow-glow-sm' : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'
                            )}
                        >
                            {favorited ? <Bookmark size={20} fill="currentColor" /> : <Plus size={20} />}
                        </button>
                    )}

                    {isAdmin && !isPosterVariant && (
                        <button
                            onClick={handleDelete}
                            disabled={isDeleting}
                            className="bg-red-500/10 hover:bg-red-500 text-white transition-all border border-red-500/20 flex items-center justify-center h-11 w-11 sm:h-12 sm:w-12 rounded-[1rem] sm:rounded-[1.2rem]"
                        >
                            {isDeleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                        </button>
                    )}
                </div>

                {!isPosterVariant && (
                    <div className="flex items-center justify-between font-black uppercase text-white/30 mt-5 text-[8px] tracking-[0.3em]">
                        <span className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary/40 group-hover:bg-primary animate-pulse" />
                            {video.status === 'NEXUS' ? 'Neural Link Online' : 'Broadcast Layer 1'}
                        </span>
                        <span className="bg-white/5 border border-white/5 group-hover:text-white/60 transition-colors px-3 py-1 rounded-lg">
                            v1.2.4
                        </span>
                    </div>
                )}
            </div>

            <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none blur-3xl rounded-full" />
        </motion.div>
    );
};
