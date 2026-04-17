import React from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { TorrentPlayer } from '@/components/TorrentPlayer';
import { motion } from 'framer-motion';
import { ArrowLeft, Share2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const TorrentPlayerPage: React.FC = () => {
    const { magnetBase64 } = useParams<{ magnetBase64: string }>();
    const navigate = useNavigate();
    const location = useLocation();

    // Tentar pegar do state primeiro para maior precisão
    const state = location.state as any;
    const magnetURI = state?.magnetLink || '';
    const title = state?.title || 'Nexus Stream';

    // Fallback ID
    const videoId = magnetBase64 || 'stream';

    if (!magnetURI) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-6">
                <div className="text-center space-y-4">
                    <h1 className="text-4xl font-black text-primary uppercase italic">Erro de Enxame</h1>
                    <p className="text-gray-400">Magnet link inválido ou corrompido.</p>
                    <Button onClick={() => navigate('/torrents')}>VOLTAR PARA BUSCA</Button>
                </div>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="min-h-screen bg-background pt-20 md:pt-32 pb-20 px-4 sm:px-6 md:px-12 relative overflow-hidden"
        >
            {/* Ambient FX */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[150px] -z-10" />
            <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-accent/5 rounded-full blur-[150px] -z-10" />

            <div className="max-w-7xl mx-auto space-y-6 md:space-y-12">
                {/* Header Evolution */}
                <div className="order-2 md:order-1 flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-8 pb-4 md:pb-8 border-b border-white/5">
                    <div className="flex items-start gap-3 sm:gap-6">
                        <button
                            onClick={() => navigate(-1)}
                            className="p-3 sm:p-4 bg-white/5 hover:bg-white/10 rounded-[1.2rem] sm:rounded-[1.5rem] border border-white/5 text-gray-400 hover:text-primary transition-all group"
                        >
                            <ArrowLeft size={24} className="group-hover:-translate-x-1 transition-transform" />
                        </button>
                        <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 px-3 py-1 rounded-full">
                                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping" />
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-green-500">Neural Link Active</span>
                                </div>
                                <span className="text-white/20 text-[10px] font-black uppercase tracking-widest">P2P Uplink Verified</span>
                            </div>
                            <h1 className="text-xl sm:text-3xl md:text-5xl font-black text-white italic tracking-tighter uppercase leading-none break-words">
                                <span className="text-white/40">Nexus:</span> <span className="text-gradient-primary">{title}</span>
                            </h1>
                        </div>
                    </div>

                    <div className="hidden sm:flex gap-4">
                        <button className="flex items-center justify-center gap-2 px-5 sm:px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-[0.18em] sm:tracking-widest text-white/60 hover:text-white hover:bg-white/10 transition-all w-full sm:w-auto">
                            <Share2 size={16} className="text-primary" /> Share Stream
                        </button>
                    </div>
                </div>

                {/* Player Frame Evolution */}
                <div className="order-1 md:order-2 relative group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 rounded-[3rem] blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
                    <div className="relative aspect-[16/9] min-h-[220px] sm:min-h-0 rounded-[1.5rem] sm:rounded-[2.5rem] overflow-hidden border border-white/10 bg-black/40 backdrop-blur-3xl shadow-2xl">
                        <TorrentPlayer
                            magnetURI={magnetURI}
                            videoId={videoId}
                        />
                    </div>
                </div>

                {/* Information Layer */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-8">
                    <div className="md:col-span-2 glass-card p-5 sm:p-8 md:p-10 rounded-[2rem] md:rounded-[2.5rem] flex flex-col sm:flex-row items-start gap-5 sm:gap-8">
                        <div className="w-14 h-14 sm:w-16 sm:h-16 bg-primary/10 rounded-3xl flex-shrink-0 flex items-center justify-center text-primary border border-primary/20">
                            <Info size={32} />
                        </div>
                        <div className="space-y-3">
                            <h4 className="text-lg sm:text-xl font-black text-white uppercase italic tracking-tight">Decentralized Streaming Protocol</h4>
                            <p className="text-sm text-white/50 leading-relaxed font-medium">
                                Você está consumindo este conteúdo através do enxame Nexus. Sua transmissão é mantida por <span className="text-white">múltiplos nós globais</span>, garantindo latência ultra-baixa e resiliência total a censura.
                            </p>
                        </div>
                    </div>

                    <div className="glass-card p-5 sm:p-8 md:p-10 rounded-[2rem] md:rounded-[2.5rem] flex flex-col justify-center gap-4 text-center">
                        <div className="text-3xl sm:text-4xl font-black text-primary">4K</div>
                        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Encryption Active</div>
                        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-primary w-[85%]" />
                        </div>
                        <div className="text-[9px] font-bold text-primary italic">Forge Performance: Optimal</div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};
