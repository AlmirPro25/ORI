import React, { useEffect, useState } from 'react';
import { Sparkles, Play, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import apiClient from '@/lib/axios';
import { STORAGE_BASE_URL } from '@/lib/axios';
import { useAuthStore } from '@/stores/auth.store';

interface RecommendedVideo {
    id: string;
    title: string;
    category: string;
    thumbnailPath: string;
    views: number;
}

export const Recommendations: React.FC = () => {
    const [videos, setVideos] = useState<RecommendedVideo[]>([]);
    const [loading, setLoading] = useState(true);
    const { user } = useAuthStore();

    useEffect(() => {
        const fetchRecommendations = async () => {
            try {
                const res = await apiClient.get(`/recommendations?userId=${user?.id || ''}`);
                setVideos(Array.isArray(res.data) ? res.data : []);
            } catch (e) {
                console.error('Falha ao buscar recomendações');
            } finally {
                setLoading(false);
            }
        };

        fetchRecommendations();
    }, [user]);

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
                            Neural <span className="text-gradient-primary">Predictions</span>
                        </h2>
                        <p className="text-[10px] text-white/30 font-black uppercase tracking-[0.5em] mt-2 ml-0.5">Customized Evolutionary Feed</p>
                    </div>
                </div>

                <Link to="/torrents" className="group flex items-center gap-4 px-6 py-3 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all backdrop-blur-3xl">
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 group-hover:text-white">Expand Nexus Index</span>
                    <ChevronRight size={16} className="text-primary group-hover:translate-x-1 transition-transform" />
                </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-10">
                {videos.map((video, idx) => (
                    <motion.div
                        key={video.id}
                        initial={{ opacity: 0, y: 40 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: idx * 0.05, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                        className="group relative"
                    >
                        <Link to={`/videos/${video.id}`}>
                            <div className="aspect-[16/10] rounded-[2.8rem] overflow-hidden border border-white/5 bg-white/5 relative mb-6 shadow-2xl transition-all duration-700 group-hover:border-primary/50 group-hover:-translate-y-2">
                                <img
                                    src={video.thumbnailPath?.startsWith('http')
                                        ? video.thumbnailPath
                                        : `${STORAGE_BASE_URL}/${video.thumbnailPath}`}
                                    alt={video.title}
                                    className="w-full h-full object-cover opacity-60 group-hover:opacity-100 group-hover:scale-110 transition-all duration-1000 grayscale-[0.3] group-hover:grayscale-0"
                                />

                                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-80 group-hover:opacity-100 transition-opacity" />

                                <div className="absolute inset-0 flex items-center justify-center translate-y-8 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-500">
                                    <div className="bg-primary text-black p-5 rounded-full shadow-[0_0_40px_rgba(var(--primary)/0.5)] scale-90 group-hover:scale-100 transition-transform">
                                        <Play size={28} fill="currentColor" />
                                    </div>
                                </div>

                                <div className="absolute top-6 right-6 translate-x-6 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-500">
                                    <span className="px-4 py-1.5 bg-black/60 backdrop-blur-2xl rounded-xl text-[9px] font-black uppercase tracking-widest text-primary border border-primary/20">
                                        {video.category}
                                    </span>
                                </div>
                            </div>

                            <div className="px-3 space-y-2">
                                <h3 className="text-lg font-black text-white/70 truncate group-hover:text-primary transition-colors uppercase italic tracking-tight">
                                    {video.title}
                                </h3>
                                <div className="flex items-center gap-3">
                                    <div className="w-1.5 h-1.5 rounded-full bg-primary/20 group-hover:bg-primary transition-colors animate-pulse" />
                                    <p className="text-[9px] text-white/20 font-black uppercase tracking-[0.2em] group-hover:text-white/40 transition-colors">
                                        {video.views.toLocaleString()} Transmission Recorders
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
