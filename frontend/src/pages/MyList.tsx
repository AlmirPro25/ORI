import React, { useEffect } from 'react';
import { VideoCard } from '@/components/VideoCard';
import { Bookmark, Ghost } from 'lucide-react';
import { motion } from 'framer-motion';
import { ExperienceLoader } from '@/components/ExperienceLoader';
import { useFavorites } from '@/hooks/useFavorites';
import { io } from 'socket.io-client';
import { SOCKET_URL } from '@/lib/endpoints';

export const MyList: React.FC = () => {
    const { favorites, loading, refresh } = useFavorites();
    const videos = favorites;

    useEffect(() => {
        const socket = io(SOCKET_URL);
        
        socket.on('favorite_added', () => {
            refresh(true); // Atualiza silenciosamente para manter a fluidez
        });

        return () => { socket.disconnect(); };
    }, [refresh]);

    if (loading) {
        return (
            <div className="min-h-screen bg-[#050505] pt-24 pb-20 px-4 sm:px-6 md:px-12">
                <ExperienceLoader label="Sincronizando o cofre" variant="catalog" className="px-0" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#050505] pt-24 pb-20 px-4 sm:px-6 md:px-12 relative overflow-hidden">
            {/* Background Glows */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[150px] -z-10" />
            <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-accent/5 rounded-full blur-[120px] -z-10" />

            <header className="mb-10 md:mb-12 space-y-4 relative">
                <div className="flex items-center gap-3 sm:gap-4 text-primary">
                    <Ghost size={28} className="sm:w-9 sm:h-9 animate-pulse" />
                    <h1 className="text-3xl sm:text-4xl md:text-6xl font-black tracking-tighter uppercase italic">
                        O <span className="text-white not-italic">COFRE</span>
                    </h1>
                </div>
                <div className="w-32 h-1 bg-gradient-to-r from-primary to-transparent rounded-full" />
                <p className="text-white/40 font-mono text-[10px] uppercase tracking-[0.3em] font-black">
                    NEXUS REPOSITORY // {videos.length} ATIVOS DE ALTA PRIORIDADE
                </p>
            </header>

            {videos.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 sm:gap-6 md:gap-8">
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
                <div className="flex flex-col items-center justify-center py-20 sm:py-32 space-y-6">
                    <div className="bg-white/5 p-8 sm:p-12 rounded-[2rem] border border-white/5 shadow-2xl">
                        <Bookmark size={64} className="sm:w-20 sm:h-20 text-white/10" />
                    </div>
                    <div className="text-center space-y-4">
                        <h2 className="text-2xl sm:text-3xl font-black text-white uppercase italic tracking-tighter">Vazio Digital</h2>
                        <p className="text-white/30 max-w-sm text-sm uppercase font-bold tracking-tight">
                            Nenhum ativo foi salvo no Cofre. Explore o catálogo ou use o Nexus Search para preencher sua biblioteca privativa.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};
