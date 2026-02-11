import React from 'react';
import { Video } from '@/types/schema';
import { Play, Plus, Trash2, Loader2, AlertTriangle, Sparkles, Bookmark } from 'lucide-react';
import { Link } from 'react-router-dom';
import { STORAGE_BASE_URL } from '@/lib/axios';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/stores/auth.store';
import { useVideoFeed } from '@/hooks/useVideos';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/axios';
import VideoService from '@/services/api/video.service';
import { MediaBadges } from './MediaBadges';

interface VideoCardProps {
    video: Video;
}

export const VideoCard: React.FC<VideoCardProps> = ({ video }) => {
    const { user } = useAuthStore();
    const { refresh } = useVideoFeed();
    const [isDeleting, setIsDeleting] = React.useState(false);
    const [isFavorited, setIsFavorited] = React.useState(false);
    const isAdmin = user?.role === 'ADMIN';

    React.useEffect(() => {
        if (user && video.id) {
            checkStatus();
        }
    }, [user, video.id]);

    const checkStatus = async () => {
        try {
            const res = await apiClient.get(`/users/${user?.id}/favorites/${video.id}/status`);
            setIsFavorited(res.data.favorited);
        } catch (e) { }
    };

    // Placeholder para thumbnail caso não exista
    const thumbnail = video.thumbnailPath
        ? video.thumbnailPath.startsWith('http')
            ? video.thumbnailPath // É uma URL externa (Nexus/AI)
            : `${STORAGE_BASE_URL}/${video.thumbnailPath}` // É arquivo local
        : video.status === 'NEXUS'
            ? `https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=400&auto=format&fit=crop` // Visual Cyber
            : `https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop`;

    const handleDelete = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!window.confirm(`Deseja realmente excluir o vídeo "${video.title}"?`)) return;

        setIsDeleting(true);
        try {
            await VideoService.delete(video.id);
            refresh();
        } catch (err) {
            console.error('Failed to delete video:', err);
            alert('Falha ao excluir vídeo.');
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            whileHover={{ scale: 1.05, y: -10 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className={cn(
                "group relative flex-shrink-0 w-64 md:w-80 aspect-video rounded-[2.5rem] overflow-hidden cursor-pointer shadow-2xl transition-all duration-700 border",
                video.status === 'NEXUS' ? 'border-primary/40 shadow-primary/10' : 'border-white/5',
                "bg-black/40 backdrop-blur-3xl"
            )}
        >
            <img
                src={thumbnail}
                alt={video.title}
                className="w-full h-full object-cover transition-all duration-1000 group-hover:scale-110 opacity-60 group-hover:opacity-100 grayscale-[0.2] group-hover:grayscale-0"
            />

            {/* Status Tags */}
            <div className="absolute inset-x-0 top-0 p-6 flex justify-between items-start z-20">
                {video.category && (
                    <span className="bg-black/60 backdrop-blur-2xl text-primary text-[8px] font-black px-4 py-1.5 rounded-xl border border-primary/20 uppercase tracking-[0.2em] shadow-glow-sm">
                        {video.category}
                    </span>
                )}
                {video.status === 'NEXUS' && (
                    <div className="flex items-center gap-2 bg-primary text-black text-[8px] font-black px-4 py-1.5 rounded-xl shadow-glow">
                        <Sparkles size={12} fill="black" />
                        <span className="uppercase tracking-widest italic">NEXUS LINK</span>
                    </div>
                )}
            </div>

            {/* Bottom Info Overlay */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/90 to-transparent p-6 pt-16 translate-y-4 group-hover:translate-y-0 transition-transform duration-700">
                <h3 className="text-white font-black text-lg mb-2 truncate tracking-tight group-hover:text-primary transition-colors uppercase italic leading-none">{video.title}</h3>

                {/* Media Badges */}
                <MediaBadges
                    audioTracks={(video as any).audioTracks}
                    subtitleTracks={(video as any).subtitleTracks}
                    hasPortuguese={(video as any).hasPortuguese}
                    hasDubbed={(video as any).hasDubbed}
                />

                <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-all duration-500 scale-95 group-hover:scale-100 mt-4">
                    {video.status === 'READY' || video.status === 'NEXUS' ? (
                        <Link to={`/videos/${video.id}`} className="flex-1">
                            <button className="w-full bg-white text-black h-12 rounded-[1.2rem] flex items-center justify-center gap-3 hover:bg-primary hover:shadow-glow-sm transition-all transform active:scale-95 group/btn">
                                <Play size={16} fill="black" className="group-hover/btn:scale-125 transition-transform" />
                                <span className="text-[10px] font-black uppercase tracking-[0.2em]">Transmitir</span>
                            </button>
                        </Link>
                    ) : (
                        <div className="flex-1 bg-white/5 backdrop-blur-2xl text-primary h-12 rounded-[1.2rem] text-[10px] font-black uppercase text-center border border-primary/20 flex items-center justify-center gap-3">
                            {video.status === 'FAILED' ? <AlertTriangle size={14} className="text-red-500" /> : <Loader2 size={14} className="animate-spin" />}
                            <span className="tracking-widest italic">{video.status}</span>
                        </div>
                    )}

                    <button
                        onClick={async (e) => {
                            e.preventDefault();
                            if (!user) return alert('Faça login para salvar!');
                            try {
                                const res = await apiClient.post(`/users/${user.id}/favorites/${video.id}`);
                                setIsFavorited(res.data.favorited);
                            } catch (e) {
                                console.error('Failed to toggle favorite');
                            }
                        }}
                        className={cn(
                            "h-12 w-12 rounded-[1.2rem] transition-all border flex items-center justify-center",
                            isFavorited
                                ? "bg-primary/20 border-primary text-primary shadow-glow-sm"
                                : "bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10"
                        )}
                    >
                        {isFavorited ? <Bookmark size={20} fill="currentColor" /> : <Plus size={20} />}
                    </button>

                    {isAdmin && (
                        <button
                            onClick={handleDelete}
                            disabled={isDeleting}
                            className="h-12 w-12 bg-red-500/10 hover:bg-red-500 text-white rounded-[1.2rem] transition-all border border-red-500/20 flex items-center justify-center"
                        >
                            {isDeleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                        </button>
                    )}
                </div>

                <div className="mt-5 flex items-center justify-between text-[8px] font-black uppercase tracking-[0.3em] text-white/30">
                    <span className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary/40 group-hover:bg-primary animate-pulse" />
                        {video.status === 'NEXUS' ? 'Neural Link Online' : 'Broadcasting Layer 1'}
                    </span>
                    <span className="bg-white/5 px-3 py-1 rounded-lg border border-white/5 group-hover:text-white/60 transition-colors">v1.2.4</span>
                </div>
            </div>

            {/* Interactive Glow on Hover */}
            <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none blur-3xl rounded-full" />
        </motion.div>
    );
};
