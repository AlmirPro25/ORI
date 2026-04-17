
import React from 'react';
import { Activity, Users, Zap, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';

interface SynergyMonitorProps {
    progress: number;
    downloadSpeed: number;
    peers: number;
    status: string;
}

export const SynergyMonitor: React.FC<SynergyMonitorProps> = ({ progress, downloadSpeed, peers, status }) => {
    const formatSpeed = (bytes: number) => {
        if (bytes === 0) return '0 B/s';
        const k = 1024;
        const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div className="bg-black/40 backdrop-blur-xl border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
            <div className="px-6 py-4 bg-white/[0.02] border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Activity className="text-primary animate-pulse" size={16} />
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Telemetria de Fluxo P2P</span>
                </div>
                <div className="flex items-center gap-1.5 font-mono text-[9px] text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                    <ShieldCheck size={10} />
                    CONEXÃO SEGURA (SSL-P2P)
                </div>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* Status Column */}
                <div className="space-y-1">
                    <p className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Status do Nexus</p>
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${status === 'PLAYING' ? 'bg-green-500 shadow-glow-green' : 'bg-primary animate-pulse shadow-glow'}`} />
                        <span className="text-sm font-black uppercase italic tracking-tighter text-white">{status}</span>
                    </div>
                </div>

                {/* Speed Column */}
                <div className="space-y-1">
                    <p className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Velocidade de Forja</p>
                    <div className="flex items-center gap-2">
                        <Zap className="text-yellow-500" size={16} />
                        <span className="text-sm font-black text-white">{formatSpeed(downloadSpeed)}</span>
                    </div>
                </div>

                {/* Peers Column */}
                <div className="space-y-1">
                    <p className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Nós Conectados</p>
                    <div className="flex items-center gap-2">
                        <Users className="text-blue-400" size={16} />
                        <span className="text-sm font-black text-white">{peers} Ativos</span>
                    </div>
                </div>

                {/* Progress Column */}
                <div className="space-y-2">
                    <div className="flex justify-between items-end">
                        <p className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Integridade do Ativo</p>
                        <span className="text-[10px] font-mono text-primary">{progress}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
                        <motion.div
                            className="h-full bg-primary glow-primary"
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ type: 'spring', stiffness: 50 }}
                        />
                    </div>
                </div>
            </div>

            {/* Micro-Interaction Bar */}
            <div className="px-6 py-2 bg-primary/5 flex items-center gap-4">
                <div className="flex -space-x-2">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="w-4 h-4 rounded-full border-2 border-black bg-gray-800 flex items-center justify-center">
                            <div className="w-1 h-1 bg-green-500 rounded-full animate-ping" />
                        </div>
                    ))}
                </div>
                <p className="text-[8px] font-mono text-gray-500 uppercase tracking-widest">
                    Otimizando rotas para streaming de latência zero...
                </p>
            </div>
        </div>
    );
};
