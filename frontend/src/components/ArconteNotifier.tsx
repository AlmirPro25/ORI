import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Play, Brain, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SOCKET_URL } from '@/lib/endpoints';

export const ArconteNotifier: React.FC = () => {
    const [notification, setNotification] = useState<any>(null);

    useEffect(() => {
        const socket = io(SOCKET_URL);

        socket.on('arconte_new_content', (data) => {
            setNotification({ ...data, type: 'new_content' });
            setTimeout(() => setNotification(null), 10000);
        });

        socket.on('materialization_complete', (data) => {
            setNotification({ ...data, type: 'materialization' });
            setTimeout(() => setNotification(null), 10000);
        });

        socket.on('favorite_added', (data) => {
            setNotification({ ...data, type: 'favorite_added' });
            setTimeout(() => setNotification(null), 10000);
        });

        socket.on('arconte_insight', (data) => {
            setNotification({ ...data, type: 'insight' });
            setTimeout(() => setNotification(null), 12000);
        });

        return () => { socket.disconnect(); };
    }, []);

    const getNotificationConfig = (type: string) => {
        switch (type) {
            case 'materialization':
                return {
                    icon: Play,
                    color: 'text-lime-400',
                    label: 'Pronto para Play',
                    border: 'border-lime-500/30',
                    glow: 'shadow-lime-500/20'
                };
            case 'favorite_added':
                return {
                    icon: Heart,
                    color: 'text-primary',
                    label: 'Salvo no Cofre',
                    border: 'border-primary/30',
                    glow: 'shadow-primary/20'
                };
            case 'insight':
                return {
                    icon: Brain,
                    color: 'text-purple-400',
                    label: 'Pensamento do Arconte',
                    border: 'border-purple-500/30',
                    glow: 'shadow-purple-500/20'
                };
            default:
                return {
                    icon: Sparkles,
                    color: 'text-primary',
                    label: 'Novo no Catálogo',
                    border: 'border-primary/30',
                    glow: 'shadow-primary/20'
                };
        }
    };

    if (!notification) return null;

    const config = getNotificationConfig(notification.type);
    const Icon = config.icon;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, x: 100, scale: 0.8 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 100, scale: 0.8 }}
                className={`fixed bottom-24 right-8 z-[200] max-w-sm w-full bg-[#1a1a2e]/95 backdrop-blur-xl border ${config.border} rounded-3xl shadow-2xl p-4 overflow-hidden ${config.glow}`}
            >
                {/* Progress Bar Background */}
                <motion.div
                    initial={{ width: "100%" }}
                    animate={{ width: "0%" }}
                    transition={{ duration: notification.type === 'insight' ? 12 : 8, ease: "linear" }}
                    className={`absolute bottom-0 left-0 h-1 ${notification.type === 'materialization' ? 'bg-lime-500/50' : 'bg-primary/50'}`}
                />

                <div className="flex gap-4 items-center">
                    {notification.type !== 'insight' && (
                        <div className="w-16 h-20 rounded-xl overflow-hidden border border-white/10 flex-shrink-0 bg-black">
                            <img
                                src={notification.thumbnail}
                                alt={notification.title}
                                className="w-full h-full object-cover"
                            />
                        </div>
                    )}

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <Icon size={12} className={`${config.color} animate-pulse`} />
                            <span className={`text-[10px] font-black uppercase tracking-widest ${config.color}/70`}>
                                {config.label}
                            </span>
                        </div>
                        <h4 className="text-sm font-bold text-white truncate mb-3">
                            {notification.type === 'insight' ? notification.message : notification.title}
                        </h4>

                        <div className="flex gap-2">
                            {notification.type !== 'insight' && (
                                <Link
                                    to={`/videos/${notification.videoId || notification.id}`}
                                    onClick={() => setNotification(null)}
                                    className="flex-1 bg-primary hover:bg-white text-black text-[10px] font-black py-2 rounded-lg flex items-center justify-center gap-1 transition-all"
                                >
                                    <Play size={10} fill="currentColor" /> ASSISTIR AGORA
                                </Link>
                            )}
                            {notification.type === 'insight' && (
                                <div className="flex-1 text-[10px] font-bold text-white/40 italic">
                                    "Processando fluxos de dados do Nexo..."
                                </div>
                            )}
                            <button
                                onClick={() => setNotification(null)}
                                className="p-2 bg-white/5 hover:bg-white/10 text-gray-400 rounded-lg transition-all"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
};
