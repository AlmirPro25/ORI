import React, { useEffect, useState } from 'react';
import { VideoCard } from '@/components/VideoCard';
import { Bookmark, Loader2, Ghost } from 'lucide-react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { useAuthStore } from '@/stores/auth.store';

const API_BASE = 'http://localhost:3000/api/v1';

export const MyList: React.FC = () => {
    const { user } = useAuthStore();
    const [videos, setVideos] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;

        const fetchFavorites = async () => {
            try {
                const response = await axios.get(`${API_BASE}/users/${user.id}/favorites`);
                setVideos(response.data);
            } catch (error) {
                console.error("Erro ao buscar favoritos:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchFavorites();
    }, [user]);

    if (loading) {
        return (
            <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center space-y-4">
                <Loader2 className="animate-spin text-primary" size={48} />
                <p className="text-muted-foreground font-mono uppercase tracking-[0.2em] animate-pulse italic">Sincronizando O Cofre...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#050505] pt-24 pb-20 px-4 md:px-12 relative overflow-hidden">
            {/* Background Glows */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[150px] -z-10" />
            <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-accent/5 rounded-full blur-[120px] -z-10" />

            <header className="mb-12 space-y-4 relative">
                <div className="flex items-center gap-4 text-primary">
                    <Ghost size={36} className="animate-pulse" />
                    <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase italic">
                        O <span className="text-white not-italic">COFRE</span>
                    </h1>
                </div>
                <div className="w-32 h-1 bg-gradient-to-r from-primary to-transparent rounded-full" />
                <p className="text-white/40 font-mono text-[10px] uppercase tracking-[0.3em] font-black">
                    NEXUS REPOSITORY // {videos.length} ATIVOS DE ALTA PRIORIDADE
                </p>
            </header>

            {videos.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-8">
                    {videos.map((video, index) => (
                        <motion.div
                            key={video.id}
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                        >
                            <VideoCard video={video} />
                        </motion.div>
                    ))}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-32 space-y-6">
                    <div className="bg-white/5 p-12 rounded-[2rem] border border-white/5 shadow-2xl">
                        <Bookmark size={80} className="text-white/10" />
                    </div>
                    <div className="text-center space-y-4">
                        <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter">Vazio Digital</h2>
                        <p className="text-white/30 max-w-sm text-sm uppercase font-bold tracking-tight">
                            Nenhum ativo foi salvo no Cofre. Explore o catálogo ou use o Nexus Search para preencher sua biblioteca privativa.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};
