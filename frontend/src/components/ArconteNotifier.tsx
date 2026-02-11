import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Play } from 'lucide-react';
import { Link } from 'react-router-dom';

const BACKEND_URL = 'http://localhost:3000';

export const ArconteNotifier: React.FC = () => {
    const [notification, setNotification] = useState<any>(null);

    useEffect(() => {
        const socket = io(BACKEND_URL);

        socket.on('arconte_new_content', (data) => {
            setNotification(data);
            // Som de notificação sutil (opcional)
            // console.log("Arconte added content:", data);

            // Auto hide after 8 seconds
            setTimeout(() => setNotification(null), 8000);
        });

        return () => { socket.disconnect(); };
    }, []);

    return (
        <AnimatePresence>
            {notification && (
                <motion.div
                    initial={{ opacity: 0, x: 100, scale: 0.8 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 100, scale: 0.8 }}
                    className="fixed bottom-24 right-8 z-[200] max-w-sm w-full bg-[#1a1a2e]/95 backdrop-blur-xl border border-primary/30 rounded-3xl shadow-2xl p-4 overflow-hidden"
                >
                    {/* Progress Bar Background */}
                    <motion.div
                        initial={{ width: "100%" }}
                        animate={{ width: "0%" }}
                        transition={{ duration: 8, ease: "linear" }}
                        className="absolute bottom-0 left-0 h-1 bg-primary/50"
                    />

                    <div className="flex gap-4 items-center">
                        <div className="w-16 h-20 rounded-xl overflow-hidden border border-white/10 flex-shrink-0 bg-black">
                            <img
                                src={notification.thumbnail}
                                alt={notification.title}
                                className="w-full h-full object-cover"
                            />
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <Sparkles size={12} className="text-primary animate-pulse" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-primary/70">Novo no Catálogo</span>
                            </div>
                            <h4 className="text-sm font-bold text-white truncate mb-3">{notification.title}</h4>

                            <div className="flex gap-2">
                                <Link
                                    to={`/videos/${notification.id}`}
                                    onClick={() => setNotification(null)}
                                    className="flex-1 bg-primary hover:bg-white text-black text-[10px] font-black py-2 rounded-lg flex items-center justify-center gap-1 transition-all"
                                >
                                    <Play size={10} fill="currentColor" /> ASSISTIR AGORA
                                </Link>
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
            )}
        </AnimatePresence>
    );
};
