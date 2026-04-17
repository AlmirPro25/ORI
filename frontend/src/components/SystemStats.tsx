import React, { useEffect, useState } from 'react';
import {
    Activity,
    HardDrive,
    Download,
    Upload,
    TrendingUp,
    Server,
    Tv,
    Cpu,
    Database,
    Brain,
    Zap,
    Shield,
    Clock,
    Users,
    Award,
    Scale,
    Eye,
    HeartPulse,
    Share2,
    Globe
} from 'lucide-react';
import { motion } from 'framer-motion';
import apiClient from '@/lib/axios';

interface QueueStats {
    queued: number;
    downloading: number;
    processing: number;
    completed: number;
    failed: number;
    total: number;
}

interface PerformanceStats {
    avgProcessingTime: number;
    maxConcurrent: number;
    activeDownloads: number;
    activeEncodings: number;
    maxEncodings: number;
    encodingQueueLength: number;
}

interface StorageStats {
    usedGB: number;
    maxGB: number;
    percentage: number;
    maxAgeUnwatched: number;
    minViewsToKeep: number;
}

interface SeedingStats {
    activeSeeds: number;
    maxSeeds: number;
    seedDurationMinutes: number;
}

interface PredictionStats {
    accuracy: number;
    total: number;
    successful: number;
}

interface V2Stats {
    queue: QueueStats;
    performance: PerformanceStats;
    storage: StorageStats;
    seeding: SeedingStats;
    health: { stallTimeoutMinutes: number; stallMinProgress: number };
    throttling: { minProgressDelta: number; minUpdateInterval: number; ffmpegThreads: number };
    buffers: { swarmDataBufferLength: number; lastUpdateCacheSize: number; activeTorrentsCount: number };
}

interface GovernorHealth {
    cpuUsagePercent: number;
    memoryUsagePercent: number;
    activeDownloads: number;
    activeEncodes: number;
    activeViewers: number;
    recentFailures: number;
    isOffPeak: boolean;
    overallScore: number;
    mode: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
    diskUsagePercent: number;
    diskFreeMB: number;
}

interface HotItem {
    id: string;
    type: string;
    score: number;
}

interface SwarmItem {
    episodeId: string;
    count: number;
}

interface TelemetryStats {
    avgTTFF: number;
    samples: number;
    cacheHitRate: number;
    p95TTFF?: number;
    activePlaybackSessions?: number;
    activeUniqueUsers?: number;
    bufferingSessions?: number;
}

interface FileValue {
    episodeId: string;
    title: string;
    valueScore: number;
    sizeMB: number;
    hoursWatched: number;
}

interface ProfitabilityScore {
    episodeId: string;
    title: string;
    roi: number;
    cost: number;
    hours: number;
}

interface UserReputation {
    id: string;
    name: string;
    reputationScore: number;
    totalWatchMinutes: number;
}

interface EconomyBalance {
    avgReputation: number;
    userDistribution: {
        vip: number;
        stable: number;
        starter: number;
        leech: number;
    };
    totalUsers: number;
    systemHealth: 'INFLATION' | 'COLLAPSE' | 'STABLE';
}

interface UEVMetrics {
    avgTTFF: number;
    avgBitrate: number;
    avgBuffers: number;
    ttffVariance: number;
    uevStatus: 'HIGH_INEQUALITY' | 'STABLE';
}

interface RecoveryMetrics {
    isStabilizing: boolean;
    avgRT: number;
    status: 'RECOVERING' | 'STABLE';
    elasticLimit: number;
    painThreshold: number;
    currentConcurrency: number;
    sustainableConcurrency: number;
}

interface NexusStatus {
    peerCount: number;
    localSatisfactionRatio: number;
    peers: any[];
}

export const SystemStats: React.FC = () => {
    const [stats, setStats] = useState<V2Stats | null>(null);
    const [governor, setGovernor] = useState<GovernorHealth | null>(null);
    const [heatmap, setHeatmap] = useState<HotItem[]>([]);
    const [swarms, setSwarms] = useState<SwarmItem[]>([]);
    const [telemetry, setTelemetry] = useState<TelemetryStats | null>(null);
    const [economy, setEconomy] = useState<FileValue[]>([]);
    const [profitability, setProfitability] = useState<ProfitabilityScore[]>([]);
    const [topUsers, setTopUsers] = useState<UserReputation[]>([]);
    const [balance, setBalance] = useState<EconomyBalance | null>(null);
    const [uev, setUev] = useState<UEVMetrics | null>(null);
    const [recovery, setRecovery] = useState<RecoveryMetrics | null>(null);
    const [nexus, setNexus] = useState<NexusStatus | null>(null);
    const [predictions, setPredictions] = useState<PredictionStats | null>(null);
    const [iptvStats, setIptvStats] = useState({ channels: 0, groups: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                // V2 Stats (fonte de verdade)
                const statsRes = await apiClient.get('/downloads/stats/system');
                setStats(statsRes.data);

                // Prediction accuracy (pode falhar se não há dados)
                try {
                    const predRes = await apiClient.get('/downloads/stats/predictions');
                    setPredictions(predRes.data);
                } catch { /* sem dados de predição ainda */ }

                // Governor Health
                try {
                    const govRes = await apiClient.get('/governor/health');
                    setGovernor(govRes.data);
                } catch { /* erro no governor */ }

                // Heatmap
                try {
                    const heatRes = await apiClient.get('/governor/heatmap');
                    setHeatmap(heatRes.data);
                } catch { /* erro no heatmap */ }

                // Swarms
                try {
                    const swarmRes = await apiClient.get('/governor/swarms');
                    setSwarms(swarmRes.data);
                } catch { /* erro no swarm */ }

                // Telemetry
                try {
                    const telRes = await apiClient.get('/telemetry/stats');
                    setTelemetry(telRes.data);
                } catch { /* erro no telemetry */ }

                // Economy
                try {
                    const econRes = await apiClient.get('/governor/economy');
                    setEconomy(econRes.data);
                } catch { /* erro no economy */ }

                // Profitability
                try {
                    const profRes = await apiClient.get('/governor/profitability');
                    setProfitability(profRes.data);
                } catch { /* erro no profitability */ }

                // Top Users
                try {
                    const userRes = await apiClient.get('/governor/users');
                    setTopUsers(userRes.data);
                } catch { /* erro no users */ }

                // Balance
                try {
                    const balanceRes = await apiClient.get('/governor/balance');
                    setBalance(balanceRes.data);
                } catch { /* erro no balance */ }

                // UEV
                try {
                    const uevRes = await apiClient.get('/telemetry/uev');
                    setUev(uevRes.data);
                } catch { /* erro no uev */ }

                // Recovery
                try {
                    const recRes = await apiClient.get('/governor/recovery');
                    setRecovery(recRes.data);
                } catch { /* erro no recovery */ }

                // Nexus
                try {
                    const nexusRes = await apiClient.get('/nexus/status');
                    setNexus(nexusRes.data);
                } catch { /* erro no nexus */ }

                // IPTV Stats (não crítico)
                try {
                    const iptvRes = await apiClient.get('/iptv/stats');
                    setIptvStats({
                        channels: iptvRes.data.totalChannels || 0,
                        groups: iptvRes.data.totalGroups || 0
                    });
                } catch { /* IPTV desligado */ }

                setError(null);
                setLoading(false);
            } catch (err: any) {
                setError('Backend offline ou não autenticado');
                setLoading(false);
            }
        };

        fetchStats();
        const interval = setInterval(fetchStats, 5000);
        return () => clearInterval(interval);
    }, []);

    const StatCard = ({ icon: Icon, label, value, color, subtitle }: any) => (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`bg-gradient-to-br ${color} rounded-2xl p-4 sm:p-5 border border-white/10 shadow-xl`}
        >
            <div className="flex items-start justify-between mb-3">
                <div className="p-2.5 rounded-xl bg-white/10 backdrop-blur-sm">
                    <Icon size={20} className="text-white" />
                </div>
            </div>
            <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-1">
                {label}
            </h3>
            <p className="text-white text-xl sm:text-2xl font-black mb-1 break-words">
                {value}
            </p>
            {subtitle && (
                <p className="text-white/50 text-xs font-mono">
                    {subtitle}
                </p>
            )}
        </motion.div>
    );

    if (loading) {
        return (
            <div className="min-h-screen bg-background pt-32 pb-12 px-4 sm:px-6 md:px-12 flex items-center justify-center">
                <div className="text-white/50 text-lg font-mono animate-pulse">
                    Carregando telemetria...
                </div>
            </div>
        );
    }

    if (error || !stats) {
        return (
            <div className="min-h-screen bg-background pt-32 pb-12 px-4 sm:px-6 md:px-12 flex items-center justify-center">
                <div className="text-center">
                    <Shield size={48} className="text-red-400 mx-auto mb-4" />
                    <p className="text-red-400 text-lg font-bold mb-2">Sistema Offline</p>
                    <p className="text-white/50 text-sm font-mono">{error}</p>
                </div>
            </div>
        );
    }

    const storagePercent = stats.storage.percentage;
    const storageColor = storagePercent > 90 ? 'text-red-400' : storagePercent > 70 ? 'text-yellow-400' : 'text-green-400';

    return (
        <div className="min-h-screen bg-background pt-32 pb-12 px-4 sm:px-6 md:px-12">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-10 border-b border-white/5 pb-8"
                >
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-primary/10 rounded-lg border border-primary/20">
                            <Activity size={24} className="text-primary" />
                        </div>
                        <p className="text-primary font-bold uppercase tracking-widest text-xs">
                            Orchestrator Telemetry V2.6
                        </p>
                    </div>
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight uppercase mb-2">
                        Painel de <span className="text-primary">Operações</span>
                    </h1>
                    <p className="text-gray-500 font-mono text-xs uppercase tracking-[0.2em]">
                        Monitoramento em tempo real do Media Orchestrator
                    </p>
                </motion.div>

                {/* Fila de Downloads */}
                <h2 className="text-white/80 text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Download size={16} className="text-cyan-400" /> Pipeline de Ingestão
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mb-8">
                    <StatCard icon={Zap} label="Na Fila" value={stats.queue.queued} color="from-blue-500/20 to-blue-600/20" />
                    <StatCard icon={Download} label="Baixando" value={stats.queue.downloading} color="from-green-500/20 to-emerald-600/20" subtitle={`max: ${stats.performance.maxConcurrent}`} />
                    <StatCard icon={Cpu} label="Encodando" value={stats.performance.activeEncodings} color="from-orange-500/20 to-amber-600/20" subtitle={`fila: ${stats.performance.encodingQueueLength}`} />
                    <StatCard icon={TrendingUp} label="Completos" value={stats.queue.completed} color="from-emerald-500/20 to-green-600/20" />
                    <StatCard icon={Shield} label="Falhas" value={stats.queue.failed} color="from-red-500/20 to-rose-600/20" />
                    <StatCard icon={Database} label="Total" value={stats.queue.total} color="from-purple-500/20 to-violet-600/20" />
                </div>

                {/* Storage + Seeding + Performance */}
                <h2 className="text-white/80 text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                    <HardDrive size={16} className="text-cyan-400" /> Recursos do Sistema
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <StatCard
                        icon={HardDrive}
                        label="Armazenamento"
                        value={`${stats.storage.usedGB.toFixed(1)} GB`}
                        color="from-cyan-500/20 to-teal-600/20"
                        subtitle={`${storagePercent}% de ${stats.storage.maxGB} GB`}
                    />
                    <StatCard
                        icon={Upload}
                        label="Seeds Ativos"
                        value={stats.seeding.activeSeeds}
                        color="from-green-500/20 to-emerald-600/20"
                        subtitle={`max: ${stats.seeding.maxSeeds} (${stats.seeding.seedDurationMinutes}min)`}
                    />
                    <StatCard
                        icon={Server}
                        label="Tempo Médio"
                        value={stats.performance.avgProcessingTime > 0 ? `${Math.round(stats.performance.avgProcessingTime)}s` : 'N/A'}
                        color="from-purple-500/20 to-pink-600/20"
                        subtitle="download → ready"
                    />
                    <StatCard
                        icon={Tv}
                        label="IPTV"
                        value={iptvStats.channels}
                        color="from-indigo-500/20 to-blue-600/20"
                        subtitle={`${iptvStats.groups} grupos`}
                    />
                </div>

                {/* Storage Bar */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-[#1a1a2e]/50 backdrop-blur-xl rounded-2xl p-6 border border-cyan-500/20 mb-8"
                >
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <HardDrive size={18} className="text-cyan-400" />
                            Política de Cache (CDN)
                        </h3>
                        <span className={`text-sm font-mono font-bold ${storageColor}`}>
                            {storagePercent}%
                        </span>
                    </div>
                    <div className="w-full h-4 bg-white/10 rounded-full overflow-hidden mb-3">
                        <motion.div
                            className={`h-full rounded-full ${storagePercent > 90 ? 'bg-gradient-to-r from-red-500 to-rose-600' :
                                storagePercent > 70 ? 'bg-gradient-to-r from-yellow-500 to-amber-600' :
                                    'bg-gradient-to-r from-cyan-500 to-teal-600'
                                }`}
                            initial={{ width: 0 }}
                            animate={{ width: `${storagePercent}%` }}
                            transition={{ duration: 1, ease: 'easeOut' }}
                        />
                    </div>
                    <div className="flex justify-between text-xs text-white/40 font-mono">
                        <span>Retenção mínima: {stats.storage.minViewsToKeep} views</span>
                        <span>Limpeza após: {stats.storage.maxAgeUnwatched} dias sem assistir</span>
                    </div>
                </motion.div>

                <div className="flex items-center gap-2 mb-8 mt-12">
                    <Activity size={20} className="text-cyan-400" />
                    <h2 className="text-white text-xl font-bold tracking-tight">Distribuição & Experiência</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    {/* TTFF Metric */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white/5 border border-white/10 rounded-2xl p-5"
                    >
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 bg-purple-500/20 rounded-lg">
                                <Clock size={20} className="text-purple-400" />
                            </div>
                            <span className="text-white/40 text-[10px] font-bold uppercase tracking-wider">Média de Início (TTFF)</span>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black text-white">{telemetry?.avgTTFF || 0}</span>
                            <span className="text-white/40 text-sm font-mono tracking-tighter">ms</span>
                        </div>
                        <p className="text-[10px] text-white/20 mt-2 uppercase font-mono">
                            Métrica de ouro da experiência
                        </p>
                    </motion.div>

                    {/* Cache Hit Rate */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="bg-white/5 border border-white/10 rounded-2xl p-5"
                    >
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 bg-emerald-500/20 rounded-lg">
                                <Zap size={20} className="text-emerald-400" />
                            </div>
                            <span className="text-white/40 text-[10px] font-bold uppercase tracking-wider">Cache Hit Rate</span>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black text-white">{telemetry?.cacheHitRate || 0}</span>
                            <span className="text-white/40 text-sm font-mono tracking-tighter">%</span>
                        </div>
                        <p className="text-[10px] text-white/20 mt-2 uppercase font-mono">
                            Eficiência da predição local
                        </p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 }}
                        className="bg-white/5 border border-white/10 rounded-2xl p-5"
                    >
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 bg-amber-500/20 rounded-lg">
                                <HeartPulse size={20} className="text-amber-400" />
                            </div>
                            <span className="text-white/40 text-[10px] font-bold uppercase tracking-wider">Playback Ativo</span>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black text-white">{telemetry?.activePlaybackSessions || 0}</span>
                            <span className="text-white/40 text-sm font-mono tracking-tighter">sessões</span>
                        </div>
                        <p className="text-[10px] text-white/20 mt-2 uppercase font-mono">
                            {telemetry?.bufferingSessions || 0} buffering • {telemetry?.activeUniqueUsers || 0} usuários
                        </p>
                    </motion.div>

                    {/* Active Swarms Count */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="bg-white/5 border border-white/10 rounded-2xl p-5"
                    >
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 bg-blue-500/20 rounded-lg">
                                <Users size={20} className="text-blue-400" />
                            </div>
                            <span className="text-white/40 text-[10px] font-bold uppercase tracking-wider">Clusters Ativos</span>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black text-white">{swarms.length}</span>
                            <span className="text-white/40 text-sm font-mono tracking-tighter">swarms</span>
                        </div>
                        <p className="text-[10px] text-white/20 mt-2 uppercase font-mono">
                            Deduplicação de banda em tempo real
                        </p>
                    </motion.div>
                </div>

                {/* Prediction Accuracy */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                    {predictions && predictions.total > 0 && (
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="bg-gradient-to-br from-purple-500/10 to-pink-600/10 rounded-2xl p-6 border border-purple-500/20"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-2">
                                        Prediction Accuracy
                                    </h3>
                            <p className="text-white text-3xl sm:text-4xl md:text-5xl font-black">
                                        {predictions.accuracy.toFixed(0)}%
                                    </p>
                                    <p className="text-white/40 text-sm mt-2 font-mono">
                                        {predictions.successful} de {predictions.total} predições acertaram
                                    </p>
                                </div>
                                <div className="text-right">
                                    <Brain size={48} className={`mb-2 ${predictions.accuracy > 70 ? 'text-green-400' :
                                        predictions.accuracy > 30 ? 'text-yellow-400' :
                                            'text-red-400'
                                        }`} />
                                    <p className="text-white/50 text-xs font-mono">
                                        {predictions.accuracy > 70 ? '🧠 Modo Agressivo' :
                                            predictions.accuracy > 30 ? '⚖️ Modo Equilibrado' :
                                                '🛡️ Modo Conservador'}
                                    </p>
                                </div>
                            </div>
                            <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
                                <motion.div
                                    className={`h-full rounded-full ${predictions.accuracy > 70 ? 'bg-gradient-to-r from-green-500 to-emerald-600' :
                                        predictions.accuracy > 30 ? 'bg-gradient-to-r from-yellow-500 to-amber-600' :
                                            'bg-gradient-to-r from-red-500 to-rose-600'
                                        }`}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${predictions.accuracy}%` }}
                                    transition={{ duration: 1.5, ease: 'easeOut' }}
                                />
                            </div>
                        </motion.div>
                    )}

                    {governor && (
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="bg-gradient-to-br from-emerald-500/10 to-teal-600/10 rounded-2xl p-6 border border-emerald-500/20"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-2">
                                        Governor Health Score
                                    </h3>
                            <p className="text-white text-3xl sm:text-4xl md:text-5xl font-black">
                                        {governor.overallScore}
                                    </p>
                                    <div className="flex items-center gap-2 mt-2">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${governor.mode === 'HEALTHY' ? 'bg-emerald-500/20 text-emerald-400' :
                                            governor.mode === 'DEGRADED' ? 'bg-yellow-500/20 text-yellow-500' :
                                                'bg-red-500/20 text-red-500'
                                            }`}>
                                            Mode: {governor.mode}
                                        </span>
                                    </div>
                                    <p className="text-white/40 text-[11px] mt-3 font-mono">
                                        Viewers ativos: {governor.activeViewers} | Falhas: {governor.recentFailures}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <Shield size={48} className={`mb-2 ${governor.overallScore > 75 ? 'text-emerald-400' :
                                        governor.overallScore > 40 ? 'text-yellow-400' :
                                            'text-red-400'
                                        }`} />
                                    <p className="text-white/50 text-xs font-mono uppercase tracking-tighter">
                                        {governor.overallScore > 75 ? '🟢 Saudável' :
                                            governor.overallScore > 40 ? '🟡 Alerta' :
                                                '🔴 Crítico'}
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mt-6 border-t border-white/5 pt-4">
                                <div className="flex flex-col gap-1">
                                    <div className="flex justify-between text-[10px] text-white/40 font-mono uppercase">
                                        <span>Disk Usage</span>
                                        <span>{governor.diskUsagePercent}%</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full ${governor.diskUsagePercent > 90 ? 'bg-red-500' : 'bg-emerald-500'}`}
                                            style={{ width: `${governor.diskUsagePercent}%` }}
                                        />
                                    </div>
                                    <span className="text-[9px] text-white/20 font-mono">{governor.diskFreeMB}MB Free</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="text-[11px] text-white/40 font-mono">
                                        CPU: <span className="text-white">{governor.cpuUsagePercent.toFixed(1)}%</span>
                                    </div>
                                    <div className="text-[11px] text-white/40 font-mono">
                                        MEM: <span className="text-white">{governor.memoryUsagePercent.toFixed(1)}%</span>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </div>

                {/* 🔥 Heatmap / Global Trending */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                    {heatmap.length > 0 && (
                        <div>
                            <h2 className="text-white/80 text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                                <Zap size={16} className="text-yellow-400" /> Tendências Globais (Heatmap)
                            </h2>
                            <div className="grid grid-cols-1 gap-4">
                                {heatmap.slice(0, 4).map((item, idx) => (
                                    <motion.div
                                        key={item.id}
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: idx * 0.1 }}
                                        className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between"
                                    >
                                        <div className="flex flex-col">
                                            <span className="text-white/40 text-[10px] uppercase font-mono">#{idx + 1} EPISODE</span>
                                            <span className="text-white font-bold truncate max-w-[150px]">{item.id}</span>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className="text-yellow-400 font-black flex items-center gap-1">
                                                <TrendingUp size={12} /> {item.score}
                                            </span>
                                            <span className="text-white/20 text-[9px] uppercase font-mono">Heat Score</span>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    )}

                    {swarms.length > 0 && (
                        <div>
                            <h2 className="text-white/80 text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                                <Activity size={16} className="text-blue-400" /> Swarms Ativos (Real-time)
                            </h2>
                            <div className="grid grid-cols-1 gap-4">
                                {swarms.slice(0, 4).map((item, idx) => (
                                    <motion.div
                                        key={item.episodeId}
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: idx * 0.1 }}
                                        className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex items-center justify-between"
                                    >
                                        <div className="flex flex-col">
                                            <span className="text-blue-400/60 text-[10px] uppercase font-mono flex items-center gap-1">
                                                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" /> LIVE STREAM
                                            </span>
                                            <span className="text-white font-bold truncate max-w-[150px]">{item.episodeId}</span>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className="text-blue-400 font-black flex items-center gap-1">
                                                <Users size={12} /> {item.count}
                                            </span>
                                            <span className="text-white/20 text-[9px] uppercase font-mono">Viewers</span>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* 💰 Economia Local / Valor de Arquivo */}
                <div className="mb-12">
                    <h2 className="text-white/80 text-sm font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
                        <Database size={16} className="text-cyan-400" /> Economia de Storage (Valor por GB)
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {economy.slice(0, 8).map((file, idx) => (
                            <motion.div
                                key={file.episodeId}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                className="bg-white/5 border border-white/10 rounded-xl p-4"
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-white font-bold text-sm truncate max-w-[140px]">{file.title}</span>
                                    <div className={`px-2 py-0.5 rounded text-[10px] font-black ${file.valueScore > 1 ? 'bg-emerald-500/20 text-emerald-400' :
                                        file.valueScore > 0.1 ? 'bg-yellow-500/20 text-yellow-400' :
                                            'bg-red-500/20 text-red-500'
                                        }`}>
                                        V: {file.valueScore}
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <div className="flex justify-between text-[10px] font-mono text-white/40">
                                        <span>Horas: {file.hoursWatched}h</span>
                                        <span>Size: {Math.round(file.sizeMB)}MB</span>
                                    </div>
                                    <div className="w-full h-1 bg-white/10 rounded-full mt-1">
                                        <div
                                            className="h-full bg-cyan-500 rounded-full"
                                            style={{ width: `${Math.min(100, file.valueScore * 20)}%` }}
                                        />
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* 🚀 Lucratividade de Conteúdo (ROI) */}
                <div className="mb-12">
                    <h2 className="text-white/80 text-sm font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
                        <TrendingUp size={16} className="text-purple-400" /> Lucratividade (Play Hours / Phys Cost)
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {profitability.slice(0, 8).map((p, idx) => (
                            <motion.div
                                key={p.episodeId}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                className="bg-white/5 border border-white/10 rounded-xl p-4"
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-white font-bold text-sm truncate max-w-[140px]">{p.title}</span>
                                    <div className={`px-2 py-0.5 rounded text-[10px] font-black ${p.roi > 50 ? 'bg-purple-500/20 text-purple-400' :
                                        p.roi > 10 ? 'bg-blue-500/20 text-blue-400' :
                                            'bg-red-500/20 text-red-500'
                                        }`}>
                                        ROI: {p.roi}
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <div className="flex justify-between text-[10px] font-mono text-white/40">
                                        <span>Hours: {p.hours}h</span>
                                        <span>Cost: {p.cost}</span>
                                    </div>
                                    <div className="w-full h-1 bg-white/10 rounded-full mt-1">
                                        <div
                                            className="h-full bg-purple-500 rounded-full"
                                            style={{ width: `${Math.min(100, (p.roi / 100) * 100)}%` }}
                                        />
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* 🏆 Top Contribuidores (Reputação) */}
                <div className="mb-12">
                    <h2 className="text-white/80 text-sm font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
                        <Award size={16} className="text-yellow-400" /> Economia de Reputação (Top Users)
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                        {topUsers.map((u, idx) => (
                            <motion.div
                                key={u.id}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: idx * 0.05 }}
                                className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center"
                            >
                                <div className="w-10 h-10 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <span className="text-yellow-400 font-black text-xs">#{idx + 1}</span>
                                </div>
                                <h3 className="text-white font-bold text-sm mb-1 truncate">{u.name}</h3>
                                <div className="text-2xl font-black text-white mb-1">
                                    {Math.round(u.reputationScore)}
                                </div>
                                <div className="text-[10px] text-white/40 uppercase font-mono mb-3">
                                    Reputation Score
                                </div>
                                <div className="flex justify-between items-center text-[9px] font-mono text-white/20">
                                    <span>Watch: {Math.round(u.totalWatchMinutes)}m</span>
                                </div>
                                <div className="w-full h-1 bg-white/5 rounded-full mt-2 overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${Math.min(100, (u.reputationScore / 1000) * 100)}%` }}
                                        className="h-full bg-yellow-500/50"
                                    />
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* ⚖️ Saúde da Economia (Sensores) */}
                {balance && (
                    <div className="mb-12">
                        <h2 className="text-white/80 text-sm font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
                            <Scale size={16} className="text-blue-400" /> Saúde da Economia (Drift & Stability)
                        </h2>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Score Médio e Status */}
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col justify-center items-center text-center">
                                <div className="text-4xl font-black text-white mb-2">{balance.avgReputation}</div>
                                <div className="text-[10px] text-white/40 uppercase font-mono tracking-widest mb-4">Reputação Média Global</div>
                                <div className={`px-4 py-1 rounded-full text-[10px] font-black ${balance.systemHealth === 'STABLE' ? 'bg-green-500/20 text-green-400' :
                                    balance.systemHealth === 'INFLATION' ? 'bg-yellow-500/20 text-yellow-500' :
                                        'bg-red-500/20 text-red-500'
                                    }`}>
                                    ECONOMY: {balance.systemHealth}
                                </div>
                            </div>

                            {/* Distribuição de Usuários */}
                            <div className="lg:col-span-2 bg-white/5 border border-white/10 rounded-2xl p-6">
                                <div className="flex justify-between items-end mb-6">
                                    <div className="text-xs font-bold text-white/60 uppercase">Distribuição de Classes</div>
                                    <div className="text-[10px] font-mono text-white/30">{balance.totalUsers} Usuários Analisados</div>
                                </div>
                                <div className="space-y-4">
                                    {[
                                        { label: 'VIPs (>300)', count: balance.userDistribution.vip, color: 'bg-purple-500' },
                                        { label: 'Estáveis (150-300)', count: balance.userDistribution.stable, color: 'bg-blue-500' },
                                        { label: 'Starter (100-150)', count: balance.userDistribution.starter, color: 'bg-green-500' },
                                        { label: 'Leechers (<100)', count: balance.userDistribution.leech, color: 'bg-red-500' }
                                    ].map((row, i) => (
                                        <div key={i} className="space-y-1">
                                            <div className="flex justify-between text-[10px] font-mono">
                                                <span className="text-white/40">{row.label}</span>
                                                <span className="text-white">{row.count}</span>
                                            </div>
                                            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${(row.count / balance.totalUsers) * 100}%` }}
                                                    className={`h-full ${row.color}`}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 📉 UEV: Sensor de Variância de Experiência */}
                {uev && (
                    <div className="mb-12">
                        <h2 className="text-white/80 text-sm font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
                            <Eye size={16} className="text-pink-400" /> UEV Sensor (Experience Variance)
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center">
                                <div className="text-2xl font-black text-white">{uev.avgTTFF}ms</div>
                                <div className="text-[10px] text-white/40 uppercase font-mono mt-1">Avg TTFF (Global)</div>
                            </div>
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center">
                                <div className="text-2xl font-black text-white">{uev.avgBitrate} Mbps</div>
                                <div className="text-[10px] text-white/40 uppercase font-mono mt-1">Avg Bitrate</div>
                            </div>
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center">
                                <div className="text-2xl font-black text-white">{uev.avgBuffers}</div>
                                <div className="text-[10px] text-white/40 uppercase font-mono mt-1">Avg Buffers / Session</div>
                            </div>
                            <div className={`bg-white/5 border rounded-2xl p-6 text-center ${uev.uevStatus === 'STABLE' ? 'border-green-500/20' : 'border-red-500/20'
                                }`}>
                                <div className={`text-2xl font-black ${uev.uevStatus === 'STABLE' ? 'text-green-400' : 'text-red-400'
                                    }`}>±{uev.ttffVariance}ms</div>
                                <div className="text-[10px] text-white/40 uppercase font-mono mt-1">TTFF Variance (Inequality)</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 💓 Auto-Healer (Resiliência) */}
                {recovery && (
                    <div className="mb-12">
                        <h2 className="text-white/80 text-sm font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
                            <HeartPulse size={16} className="text-red-400" /> Auto-Healer (Resiliency & Recovery)
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className={`p-6 rounded-2xl border flex items-center justify-between ${recovery.isStabilizing
                                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                                : 'bg-green-500/10 border-green-500/20 text-green-400'
                                }`}>
                                <div>
                                    <div className="text-[10px] uppercase font-mono tracking-widest opacity-60">Status do Organismo</div>
                                    <div className="text-2xl font-black mt-1">
                                        {recovery.isStabilizing ? 'MODO ESTABILIZAÇÃO' : 'STABLE / HEALTHY'}
                                    </div>
                                </div>
                                {recovery.isStabilizing && (
                                    <motion.div
                                        animate={{ scale: [1, 1.2, 1] }}
                                        transition={{ repeat: Infinity, duration: 2 }}
                                        className="w-4 h-4 bg-red-500 rounded-full shadow-[0_0_15px_rgba(239,68,68,0.5)]"
                                    />
                                )}
                            </div>

                            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex items-center justify-between">
                                <div>
                                    <div className="text-[10px] text-white/40 uppercase font-mono tracking-widest">Recovery Time (RT Médio)</div>
                                    <div className="text-2xl font-black text-white mt-1">
                                        {(recovery.avgRT / 1000).toFixed(1)}s
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] text-white/20 uppercase font-mono">Downtime Resistance</div>
                                    <div className="text-xs font-bold text-green-400">HIGH</div>
                                </div>
                            </div>
                        </div>

                        {/* Stress Sensors */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                                <div className="flex justify-between items-start">
                                    <div className="text-[10px] text-white/40 uppercase font-mono">Elastic Limit</div>
                                    <Activity size={12} className="text-blue-400" />
                                </div>
                                <div className="text-xl font-bold text-white mt-1">{recovery.elasticLimit} <span className="text-[10px] text-white/20">users</span></div>
                                <div className="text-[9px] text-white/20 mt-1 italic">Max stable concurrency reached</div>
                            </div>
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                                <div className="flex justify-between items-start">
                                    <div className="text-[10px] text-white/40 uppercase font-mono">Pain Threshold</div>
                                    <Activity size={12} className="text-orange-400" />
                                </div>
                                <div className="text-xl font-bold text-white mt-1">{recovery.painThreshold} <span className="text-[10px] text-white/20">users</span></div>
                                <div className="text-[9px] text-white/20 mt-1 italic">When Stabilization Mode triggers</div>
                            </div>
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 border-green-500/20 bg-green-500/5">
                                <div className="flex justify-between items-start">
                                    <div className="text-[10px] text-green-400/60 uppercase font-mono font-bold">Sustainable (SC)</div>
                                    <Activity size={12} className="text-green-400" />
                                </div>
                                <div className="text-xl font-bold text-green-400 mt-1">{recovery.sustainableConcurrency} <span className="text-[10px] text-green-400/40">users</span></div>
                                <div className="text-[9px] text-green-400/40 mt-1 italic">Safe limit for network growth</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 🛰️ Nexus Fleet Coordination */}
                {nexus && (
                    <div className="mb-12">
                        <h2 className="text-white/80 text-sm font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
                            <Share2 size={16} className="text-blue-400" /> Nexus Fleet (Diplomacy & Coordination)
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex items-center justify-between">
                                <div>
                                    <div className="text-[10px] text-white/40 uppercase font-mono tracking-widest">Local Satisfaction Ratio</div>
                                    <div className="text-2xl font-black text-white mt-1">
                                        {nexus.localSatisfactionRatio}%
                                    </div>
                                    <div className="text-[9px] text-white/20 mt-1 italic">Independence index of this node</div>
                                </div>
                                <div className={`p-4 rounded-xl ${nexus.localSatisfactionRatio > 80 ? 'bg-green-500/10 text-green-400' : 'bg-orange-500/10 text-orange-400'}`}>
                                    <Globe size={24} className={nexus.localSatisfactionRatio > 80 ? 'animate-pulse' : ''} />
                                </div>
                            </div>

                            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex items-center justify-between">
                                <div>
                                    <div className="text-[10px] text-white/40 uppercase font-mono tracking-widest">Network Peering</div>
                                    <div className="text-2xl font-black text-white mt-1">
                                        {nexus.peerCount} <span className="text-sm text-white/40">Active Peers</span>
                                    </div>
                                    <div className="text-[9px] text-white/20 mt-1 italic">Nodes connected in the mesh</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] text-white/20 uppercase font-mono">Mesh Status</div>
                                    <div className="text-xs font-bold text-blue-400">READY</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Throttling & Health */}
                <h2 className="text-white/80 text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Shield size={16} className="text-green-400" /> Proteções Ativas
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <div className="bg-[#1a1a2e]/50 rounded-xl p-4 border border-white/5">
                        <p className="text-white/40 text-xs uppercase tracking-wider mb-1">Stall Timeout</p>
                        <p className="text-white font-bold text-lg">{stats.health.stallTimeoutMinutes} min</p>
                    </div>
                    <div className="bg-[#1a1a2e]/50 rounded-xl p-4 border border-white/5">
                        <p className="text-white/40 text-xs uppercase tracking-wider mb-1">FFmpeg Threads</p>
                        <p className="text-white font-bold text-lg">{stats.throttling.ffmpegThreads}</p>
                    </div>
                    <div className="bg-[#1a1a2e]/50 rounded-xl p-4 border border-white/5">
                        <p className="text-white/40 text-xs uppercase tracking-wider mb-1">DB Delta Min</p>
                        <p className="text-white font-bold text-lg">{stats.throttling.minProgressDelta}%</p>
                    </div>
                    <div className="bg-[#1a1a2e]/50 rounded-xl p-4 border border-white/5">
                        <p className="text-white/40 text-xs uppercase tracking-wider mb-1">Swarm Buffer</p>
                        <p className="text-white font-bold text-lg">{stats.buffers.swarmDataBufferLength}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
