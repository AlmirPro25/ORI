import React, { useEffect, useState } from 'react';
import { Play, RotateCcw } from 'lucide-react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import apiClient from '@/lib/axios';
import { STORAGE_BASE_URL } from '@/lib/axios';
import { useAuthStore } from '@/stores/auth.store';

interface HistoryItem {
    id: string;
    lastTime: number;
    video: {
        id: string;
        title: string;
        thumbnailPath: string;
        duration?: number;
    };
    updatedAt: string;
}

export const ContinueWatching: React.FC = () => {
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const { user } = useAuthStore();

    useEffect(() => {
        const fetchHistory = async () => {
            if (!user) return;
            try {
                const res = await apiClient.get(`/users/${user.id}/history`);
                setHistory(Array.isArray(res.data) ? res.data : []);
            } catch (e) {
                console.error('Falha ao buscar histÃ³rico');
            } finally {
                setLoading(false);
            }
        };

        fetchHistory();
    }, [user]);

    const resumableHistory = React.useMemo(() => {
        return history.filter((item) => {
            const duration = Number(item.video.duration || 0);
            const lastTime = Number(item.lastTime || 0);

            if (lastTime < 60) return false;
            if (duration > 0 && lastTime >= duration * 0.92) return false;

            return true;
        });
    }, [history]);

    if (loading || resumableHistory.length === 0) return null;

    return (
        <div className="px-4 sm:px-6 md:px-16 py-10 md:py-12 relative overflow-hidden">
            <div className="flex items-center gap-4 md:gap-6 mb-8 md:mb-10">
                <div className="bg-primary/10 p-3 md:p-4 rounded-[1.5rem] border border-primary/20 backdrop-blur-3xl shadow-glow-sm">
                    <RotateCcw className="text-primary w-6 h-6" />
                </div>
                <div>
                    <h2 className="text-2xl sm:text-3xl font-black tracking-[-0.02em] text-white uppercase italic flex items-center gap-3">
                        Continue <span className="text-gradient-primary">Watching</span>
                    </h2>
                    <p className="text-[9px] md:text-[10px] text-white/30 font-black uppercase tracking-[0.22em] md:tracking-[0.4em] mt-1 ml-0.5">Neural Session Resumption</p>
                </div>
            </div>

            <div className="flex gap-3 sm:gap-5 overflow-x-auto pb-8 no-scrollbar snap-x snap-mandatory">
                {resumableHistory.map((item, idx) => (
                    <motion.div
                        key={item.id}
                        initial={{ opacity: 0, scale: 0.9, x: 20 }}
                        whileInView={{ opacity: 1, scale: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: idx * 0.1, duration: 0.8 }}
                        className="flex-shrink-0 w-[9.5rem] sm:w-[11rem] md:w-[13rem] snap-start group"
                    >
                        <Link to={`/videos/${item.video.id}`}>
                            <div className="relative aspect-[2/3] rounded-[2rem] overflow-hidden border border-white/5 bg-white/[0.02] transition-all duration-700 group-hover:border-primary/40 shadow-2xl">
                                <img
                                    src={item.video.thumbnailPath?.startsWith('http')
                                        ? item.video.thumbnailPath
                                        : `${STORAGE_BASE_URL}/${item.video.thumbnailPath}`}
                                    alt={item.video.title}
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?q=80&w=500';
                                    }}
                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000 opacity-80 group-hover:opacity-100"
                                />

                                <div className="absolute bottom-0 left-0 w-full h-1.5 bg-white/10">
                                    <div
                                        className="h-full bg-primary shadow-[0_0_10px_rgba(var(--primary)/0.8)]"
                                        style={{ width: `${Math.min(100, (item.lastTime / (item.video.duration || 3600)) * 100)}%` }}
                                    />
                                </div>

                                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent flex flex-col justify-end p-4">
                                    <h3 className="text-base font-black text-white/90 line-clamp-2 group-hover:text-primary transition-colors tracking-tight uppercase italic leading-none mb-2">
                                        {item.video.title}
                                    </h3>
                                    <p className="text-[9px] text-primary font-black uppercase tracking-widest flex items-center gap-2">
                                        <Play size={10} fill="currentColor" /> {Math.floor(item.lastTime / 60)}m restantes
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
