import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import apiClient from '@/lib/axios';
import { STORAGE_BASE_URL } from '@/lib/axios';

interface Video {
    id: string;
    title: string;
    thumbnailPath: string;
    tags: string;
    createdAt: string;
}

export const RecentlyAdded: React.FC = () => {
    const [videos, setVideos] = useState<Video[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchRecent = async () => {
            try {
                // Buscar vídeos com a tag 'Autobot' que o Arconte adiciona
                // Buscar últimos vídeos adicionados
                const res = await apiClient.get('/videos?limit=20');
                const data = Array.isArray(res.data) ? res.data : (res.data.videos || []);

                // Filtrar os 10 mais recentes, priorizando os do Arconte (mas mostrando outros se não houver)
                const recentVideos = data
                    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .slice(0, 10);

                console.log('📜 Arconte Feed:', recentVideos.length, 'vídeos encontrados');
                setVideos(recentVideos);
            } catch (e) {
                console.error('Falha ao buscar feeds recentes');
            } finally {
                setLoading(false);
            }
        };

        fetchRecent();
    }, []);

    if (loading || videos.length === 0) return null;

    return (
        <div className="px-6 md:px-16 py-16 relative overflow-hidden">
            {/* Ambient Background Glow */}
            <div className="absolute top-0 left-1/4 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[120px] -z-10" />

            <div className="flex items-center gap-6 mb-12">
                <div className="bg-primary/10 p-4 rounded-[1.5rem] border border-primary/20 backdrop-blur-3xl shadow-glow-sm">
                    <Clock className="text-primary w-6 h-6 animate-pulse" />
                </div>
                <div>
                    <h2 className="text-3xl font-black tracking-[-0.02em] text-white uppercase italic flex items-center gap-3">
                        Arconte <span className="text-gradient-primary">Discoveries</span>
                    </h2>
                    <p className="text-[10px] text-white/30 font-black uppercase tracking-[0.4em] mt-1 ml-0.5">Automated Neural Indexing Interface</p>
                </div>
            </div>

            <div className="flex gap-8 overflow-x-auto pb-12 no-scrollbar snap-x snap-mandatory">
                {videos.map((video, idx) => (
                    <motion.div
                        key={video.id}
                        initial={{ opacity: 0, scale: 0.9, x: 20 }}
                        whileInView={{ opacity: 1, scale: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: idx * 0.1, duration: 0.8, ease: "easeOut" }}
                        className="flex-shrink-0 w-80 snap-start group"
                    >
                        <Link to={`/videos/${video.id}`}>
                            <div className="relative aspect-video rounded-[2.5rem] overflow-hidden border border-white/5 transition-all duration-700 group-hover:border-primary/40 shadow-2xl group-hover:shadow-primary/10">
                                <img
                                    src={video.thumbnailPath?.startsWith('http')
                                        ? video.thumbnailPath
                                        : `${STORAGE_BASE_URL}/${video.thumbnailPath}`}
                                    alt={video.title}
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?q=80&w=500';
                                    }}
                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000 opacity-60 group-hover:opacity-100 grayscale-[0.5] group-hover:grayscale-0"
                                />

                                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent flex flex-col justify-end p-8">
                                    <div className="flex items-center gap-2 mb-3 translate-y-4 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-500">
                                        <div className="p-1 px-2 bg-primary/20 backdrop-blur-md rounded-lg border border-primary/20">
                                            <span className="text-[8px] font-black uppercase text-primary tracking-[0.2em]">Nexus Certified</span>
                                        </div>
                                    </div>
                                    <h3 className="text-xl font-black text-white/80 truncate group-hover:text-white transition-colors tracking-tight uppercase italic leading-none">
                                        {video.title}
                                    </h3>
                                </div>

                                {/* Hover Glow Effect */}
                                <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
                            </div>
                        </Link>
                    </motion.div>
                ))}
            </div>
        </div>
    );
};
