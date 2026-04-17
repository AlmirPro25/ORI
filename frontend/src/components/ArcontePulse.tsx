import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { Brain, Zap, Search, Loader2, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { SOCKET_URL } from '@/lib/endpoints';

export const ArcontePulse: React.FC = () => {
    const [activity, setActivity] = useState<string>('idle');
    const [lastUpdate, setLastUpdate] = useState<number>(Date.now());

    useEffect(() => {
        const socket = io(SOCKET_URL);

        socket.on('system_activity', (data) => {
            setActivity(data.activity);
            setLastUpdate(Date.now());
        });

        // Reset to idle if no activity for 30s
        const interval = setInterval(() => {
            if (Date.now() - lastUpdate > 30000) {
                setActivity('idle');
            }
        }, 5000);

        return () => {
            socket.disconnect();
            clearInterval(interval);
        };
    }, [lastUpdate]);

    const getStatusConfig = () => {
        switch (activity) {
            case 'scanning':
                return { 
                    icon: Search, 
                    color: 'text-purple-400', 
                    bg: 'bg-purple-500/20',
                    label: 'Escaneando Nexo',
                    pulse: true 
                };
            case 'downloading':
                return { 
                    icon: Zap, 
                    color: 'text-blue-400', 
                    bg: 'bg-blue-500/20',
                    label: 'Materializando',
                    pulse: true 
                };
            case 'encoding':
                return { 
                    icon: Loader2, 
                    color: 'text-amber-400', 
                    bg: 'bg-amber-500/20',
                    label: 'Processando DNA',
                    pulse: true 
                };
            case 'ready':
                return { 
                    icon: CheckCircle2, 
                    color: 'text-lime-400', 
                    bg: 'bg-lime-500/20',
                    label: 'Ativo',
                    pulse: false 
                };
            default:
                return { 
                    icon: Brain, 
                    color: 'text-white/40', 
                    bg: 'bg-white/5',
                    label: 'Em Espera',
                    pulse: false 
                };
        }
    };

    const config = getStatusConfig();
    const Icon = config.icon;

    return (
        <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
            <div className={`relative flex items-center justify-center w-8 h-8 rounded-xl ${config.bg} ${config.color} transition-all duration-500`}>
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activity}
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 1.5, opacity: 0 }}
                    >
                        <Icon size={16} className={config.pulse ? 'animate-pulse' : ''} />
                    </motion.div>
                </AnimatePresence>
                
                {config.pulse && (
                    <motion.div
                        animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0.1, 0.3] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className={`absolute inset-0 rounded-xl ${config.bg}`}
                    />
                )}
            </div>
            
            <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase tracking-widest text-white/30 leading-none mb-1">Status do Arconte</span>
                <span className={`text-[11px] font-black uppercase tracking-tight ${config.color} leading-none`}>
                    {config.label}
                </span>
            </div>
        </div>
    );
};
