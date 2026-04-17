import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Bot,
    Brain,
    Sparkles,
    CheckCircle,
    AlertCircle,
    TrendingUp,
    Film,
    Loader2,
    RefreshCw,
    Zap,
    Activity,
    X
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';

interface ArconteJob {
    id: string;
    type: 'TRENDING' | 'SEARCH' | 'ENRICH';
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
    query?: string;
    progress: number;
    results: number;
    startedAt: string;
    completedAt?: string;
}

interface ArconteStats {
    totalIngested: number;
    todayIngested: number;
    lastRun: string;
    isRunning: boolean;
    currentJob?: ArconteJob;
    recentJobs: ArconteJob[];
}

export const ArcontePanel: React.FC = () => {
    const { user } = useAuthStore();
    const isAdmin = user?.role === 'ADMIN';

    const [isOpen, setIsOpen] = useState(false);
    const [stats, setStats] = useState<ArconteStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [manualQuery, setManualQuery] = useState('');
    const [triggeringJob, setTriggeringJob] = useState(false);
    const [focusPTBR, setFocusPTBR] = useState(true);

    // Mock stats for demo - in production would fetch from API
    const fetchStats = useCallback(async () => {
        setLoading(true);
        try {
            // Em produção usaria endpoint real
            const response = await fetch('/api/v1/admin/analytics');
            const data = await response.json();

            const mockStats: ArconteStats = {
                totalIngested: data.stats.videos,
                todayIngested: data.stats.activeNodes, // Simulação
                lastRun: data.timestamp,
                isRunning: false,
                recentJobs: [
                    {
                        id: '1',
                        type: 'TRENDING',
                        status: 'COMPLETED',
                        progress: 100,
                        results: data.stats.videos,
                        startedAt: data.timestamp,
                    }
                ]
            };
            setStats(mockStats);
        } catch (e) {
            console.error('Failed to fetch Arconte stats');
        } finally {
            setLoading(false);
        }
    }, []);

    const triggerManualSearch = async () => {
        if (!manualQuery.trim()) return;

        setTriggeringJob(true);
        try {
            console.log(`🤖 Arconte: Iniciando busca manual para "${manualQuery}" | Foco PT-BR: ${focusPTBR}`);

            const response = await fetch('/api/v1/ai/deep-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: manualQuery,
                    prioritizePTBR: focusPTBR,
                    ptbrOnly: focusPTBR // Se o Almir quiser só PT-BR
                })
            });

            if (response.ok) {
                setManualQuery('');
                alert('🚀 Arconte despachado! Ele está varrendo a rede profunda em busca de versões PT-BR/Dual Audio.');
                fetchStats();
            }
        } catch (e) {
            console.error('Failed to trigger Arconte job');
        } finally {
            setTriggeringJob(false);
        }
    };

    const triggerTrendingSearch = async () => {
        setTriggeringJob(true);
        try {
            console.log('🤖 Arconte: Iniciando busca de tendências...');
            await new Promise(r => setTimeout(r, 2000));
            fetchStats();
        } catch (e) {
            console.error('Failed to trigger trending search');
        } finally {
            setTriggeringJob(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchStats();
        }
    }, [isOpen, fetchStats]);

    const formatTimeAgo = (date: string) => {
        const diff = Date.now() - new Date(date).getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) return `${hours}h atrás`;
        if (minutes > 0) return `${minutes}min atrás`;
        return 'Agora';
    };

    if (!isAdmin) return null;

    return (
        <>
            {/* Floating Trigger Button */}
            <motion.button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-24 right-6 z-50 p-4 bg-gradient-to-br from-purple-600 to-primary rounded-2xl shadow-2xl shadow-primary/20 border border-white/10 group hover:scale-110 transition-transform"
                whileHover={{ rotate: [0, -10, 10, 0] }}
                title="Arconte AI Panel"
            >
                <Bot size={24} className="text-white group-hover:animate-pulse" />
                {stats?.isRunning && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-ping" />
                )}
            </motion.button>

            {/* Panel Modal */}
            <AnimatePresence>
                {isOpen && (
                    <div className="fixed inset-0 z-[400] flex items-end md:items-center justify-center md:p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsOpen(false)}
                            className="absolute inset-0 bg-black/90 backdrop-blur-md"
                        />

                        <motion.div
                            initial={{ y: '100%', opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: '100%', opacity: 0 }}
                            transition={{ type: 'spring', damping: 25 }}
                            className="relative z-10 w-full max-w-xl bg-gray-900 border border-white/10 rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
                        >
                            {/* Header */}
                            <div className="p-6 border-b border-white/10 bg-gradient-to-r from-purple-900/50 to-primary/20">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-3 bg-gradient-to-br from-purple-600 to-primary rounded-2xl shadow-lg">
                                            <Brain className="text-white" size={24} />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                                                Arconte <span className="text-primary">AI</span>
                                                <Sparkles size={16} className="text-yellow-400" />
                                            </h3>
                                            <p className="text-[10px] text-gray-400 font-mono uppercase tracking-widest">
                                                Auto-Curator Engine v2.0
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setIsOpen(false)}
                                        className="p-2 rounded-xl hover:bg-white/5 transition-colors"
                                    >
                                        <X size={20} className="text-gray-400" />
                                    </button>
                                </div>

                                {/* Quick Stats */}
                                <div className="mt-4 grid grid-cols-3 gap-3">
                                    <div className="bg-black/30 rounded-xl p-3 border border-white/5">
                                        <p className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Total Indexado</p>
                                        <p className="text-2xl font-black text-white">{stats?.totalIngested || '...'}</p>
                                    </div>
                                    <div className="bg-black/30 rounded-xl p-3 border border-white/5">
                                        <p className="text-[9px] text-green-500 uppercase font-bold tracking-widest">Hoje</p>
                                        <p className="text-2xl font-black text-green-400">+{stats?.todayIngested || '0'}</p>
                                    </div>
                                    <div className="bg-black/30 rounded-xl p-3 border border-white/5">
                                        <p className="text-[9px] text-primary uppercase font-bold tracking-widest">Última Exec.</p>
                                        <p className="text-sm font-bold text-primary">{stats?.lastRun ? formatTimeAgo(stats.lastRun) : '...'}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="p-4 border-b border-white/5 bg-black/20">
                                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-3">Ações Manuais</p>

                                {/* Manual Search */}
                                <div className="space-y-4 mb-4">
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={manualQuery}
                                            onChange={(e) => setManualQuery(e.target.value)}
                                            placeholder="Buscar e indexar filme/série..."
                                            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                                        />
                                        <button
                                            onClick={triggerManualSearch}
                                            disabled={triggeringJob || !manualQuery.trim()}
                                            className="px-4 bg-primary text-black font-bold rounded-xl hover:bg-white transition-colors disabled:opacity-50"
                                        >
                                            {triggeringJob ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />}
                                        </button>
                                    </div>

                                    {/* PT-BR Priority Toggle */}
                                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-lg ${focusPTBR ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                                <Activity size={14} />
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold uppercase tracking-tight">Foco Total PT-BR</p>
                                                <p className="text-[10px] text-gray-500">Priorizar Dublados e Dual-Áudio BR</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setFocusPTBR(!focusPTBR)}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${focusPTBR ? 'bg-primary' : 'bg-gray-700'}`}
                                        >
                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${focusPTBR ? 'translate-x-6' : 'translate-x-1'}`} />
                                        </button>
                                    </div>
                                </div>

                                {/* Quick Actions */}
                                <div className="flex gap-2">
                                    <button
                                        onClick={triggerTrendingSearch}
                                        disabled={triggeringJob}
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600/20 to-primary/20 border border-purple-500/30 rounded-xl text-sm font-bold hover:border-primary/50 transition-all disabled:opacity-50"
                                    >
                                        <TrendingUp size={16} className="text-purple-400" />
                                        <span>Buscar Tendências</span>
                                    </button>
                                    <button
                                        onClick={fetchStats}
                                        disabled={loading}
                                        className="p-2.5 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors"
                                    >
                                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                                    </button>
                                </div>
                            </div>

                            {/* Recent Jobs */}
                            <div className="flex-1 overflow-y-auto p-4">
                                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-3">Histórico de Execuções</p>

                                <div className="space-y-2">
                                    {stats?.recentJobs?.map((job) => (
                                        <div
                                            key={job.id}
                                            className="p-3 bg-white/[0.02] border border-white/5 rounded-xl hover:border-white/10 transition-all"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2 rounded-lg ${job.type === 'TRENDING'
                                                        ? 'bg-purple-500/20 text-purple-400'
                                                        : job.type === 'SEARCH'
                                                            ? 'bg-primary/20 text-primary'
                                                            : 'bg-yellow-500/20 text-yellow-400'
                                                        }`}>
                                                        {job.type === 'TRENDING' ? <TrendingUp size={14} /> : <Film size={14} />}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold">
                                                            {job.type === 'TRENDING' ? 'Trending Search' : job.query || 'Auto Search'}
                                                        </p>
                                                        <p className="text-[10px] text-gray-500">
                                                            {formatTimeAgo(job.startedAt)} • {job.results} resultados
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {job.status === 'COMPLETED' && <CheckCircle size={14} className="text-green-500" />}
                                                    {job.status === 'RUNNING' && <Loader2 size={14} className="text-primary animate-spin" />}
                                                    {job.status === 'FAILED' && <AlertCircle size={14} className="text-red-500" />}
                                                </div>
                                            </div>
                                        </div>
                                    ))}

                                    {(!stats?.recentJobs || stats.recentJobs.length === 0) && (
                                        <div className="py-8 text-center opacity-50">
                                            <Activity size={24} className="mx-auto mb-2" />
                                            <p className="text-[10px] uppercase tracking-widest font-bold">
                                                Nenhuma execução recente
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="p-4 border-t border-white/10 bg-black/20">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-[9px] text-gray-500">
                                        <span className={`w-2 h-2 rounded-full ${stats?.isRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`} />
                                        <span className="uppercase tracking-widest font-bold">
                                            {stats?.isRunning ? 'Processando...' : 'Standby'}
                                        </span>
                                    </div>
                                    <p className="text-[9px] text-gray-600 font-mono uppercase tracking-widest">
                                        Ciclo automático: 12h
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
};
