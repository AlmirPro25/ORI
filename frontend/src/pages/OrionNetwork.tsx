import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Network, Server, HardDrive, Share2, Activity, Globe, Send, ShieldCheck, Database } from 'lucide-react';
import axios from 'axios';
import { API_BASE_URL } from '@/lib/endpoints';

interface OrionStatus {
    nodeId: string;
    peers: number;
    uptime: number;
    storageLimit: string;
    dhtActive: boolean;
    activePeers?: any[];
    messageCount?: number;
}

const API_URL = `${API_BASE_URL}/api/v1`;

export const OrionNetwork: React.FC = () => {
    const [status, setStatus] = useState<OrionStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [pubTitle, setPubTitle] = useState('');
    const [pubHash, setPubHash] = useState('');
    const [publishing, setPublishing] = useState(false);

    const fetchStatus = async () => {
        try {
            const { data } = await axios.get(`${API_URL}/orion/status`);
            setStatus(data);
        } catch (error) {
            console.error('Failed to fetch Orion status', error);
        } finally {
            setLoading(false);
        }
    };

    const handlePublish = async () => {
        if (!pubTitle || !pubHash) return;
        setPublishing(true);
        try {
            await axios.post(`${API_URL}/orion/publish`, { title: pubTitle, infoHash: pubHash });
            setPubTitle('');
            setPubHash('');
            alert('Conteúdo anunciado na federação Orion!');
            fetchStatus();
        } catch (e) {
            alert('Falha ao publicar conteúdo.');
        } finally {
            setPublishing(false);
        }
    };

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 5000);
        return () => clearInterval(interval);
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-black text-cyan-500">
                <Activity className="w-12 h-12 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black text-gray-100 p-4 md:p-8 pt-24 font-mono selection:bg-cyan-500/30">
            <div className="max-w-7xl mx-auto space-y-8">

                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-cyan-900/50 pb-8">
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-cyan-500/10 rounded-lg border border-cyan-500/20 shrink-0">
                                <Network className="w-8 h-8 text-cyan-400" />
                            </div>
                            <h1 className="text-2xl sm:text-3xl md:text-5xl font-black bg-gradient-to-r from-white via-cyan-400 to-blue-600 bg-clip-text text-transparent tracking-tighter break-words">
                                ORION CORE
                            </h1>
                        </div>
                        <p className="text-gray-400 text-sm md:text-base flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-cyan-500" />
                            Protocolo de Distribuição Soberana v1.0
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-4">
                        <div className="px-4 sm:px-5 py-2 bg-cyan-950/20 border border-cyan-500/30 rounded-xl backdrop-blur-md flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${status?.dhtActive ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`} />
                            <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest">
                                DHT: {status?.dhtActive ? 'ACTIVE' : 'INACTIVE'}
                            </span>
                        </div>
                        <div className="px-4 sm:px-5 py-2 bg-purple-950/20 border border-purple-500/30 rounded-xl backdrop-blur-md flex items-center gap-3">
                            <Activity className="w-4 h-4 text-purple-400" />
                            <span className="text-xs font-bold text-purple-400 uppercase tracking-widest">
                                MSGS: {status?.messageCount || 0}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Main Dashboard Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <StatCard icon={<Server className="text-blue-400" />} title="NODE IDENTITY" value={status?.nodeId.substring(0, 16) || '---'} subValue="ED25519 Fingerprint" color="blue" />
                    <StatCard icon={<Share2 className="text-purple-400" />} title="ACTIVE PEERS" value={status?.peers || 0} subValue="Federated Connections" color="purple" />
                    <StatCard icon={<HardDrive className="text-green-400" />} title="EDGE CAPACITY" value={status?.storageLimit || '0 GB'} subValue="LRU Managed Cache" color="green" />
                    <StatCard icon={<Database className="text-orange-400" />} title="RELAY UPTIME" value={`${Math.floor((status?.uptime || 0) / 60)}m ${Math.floor((status?.uptime || 0) % 60)}s`} subValue="Continuous Operation" color="orange" />
                </div>

                {/* Middle Section: Topology & Management */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* Visual Topology (Placeholder/Canvas) */}
                    <div className="lg:col-span-2 group relative h-[320px] sm:h-[420px] lg:h-[500px] bg-gray-950 border border-gray-900 rounded-3xl overflow-hidden flex items-center justify-center">
                        <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />

                        {/* Grid effect */}
                        <div className="absolute inset-0 grid grid-cols-[repeat(30,minmax(0,1fr))] grid-rows-[repeat(30,minmax(0,1fr))] opacity-10">
                            {Array.from({ length: 900 }).map((_, i) => (
                                <div key={i} className="border-[0.2px] border-cyan-500/20" />
                            ))}
                        </div>

                        <div className="relative z-10 text-center space-y-6">
                            <div className="relative inline-block">
                                <motion.div
                                    animate={{ scale: [1, 1.2, 1], rotate: [0, 90, 180, 270, 360] }}
                                    transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                                    className="absolute -inset-8 bg-cyan-500/10 rounded-full blur-3xl"
                                />
                                <Network className="w-32 h-32 text-cyan-500/30 mx-auto transition-all group-hover:text-cyan-400/50" />
                            </div>
                            <div className="space-y-1">
                                <h2 className="text-xl font-bold text-cyan-500 uppercase tracking-[0.3em]">Network Topology</h2>
                                <p className="text-gray-600 text-xs italic">Aguardando propagação de rota pelo protocolo Gossip...</p>
                            </div>
                        </div>

                        {/* Peer Nodes Floating Symbols */}
                        {status?.activePeers?.map((_, i) => (
                            <motion.div
                                key={i}
                                initial={{ x: Math.random() * 200 - 100, y: Math.random() * 200 - 100 }}
                                animate={{ x: [0, Math.random() * 50], y: [0, Math.random() * 50] }}
                                transition={{ duration: 5 + i, repeat: Infinity, repeatType: "reverse" }}
                                className="absolute w-2 h-2 bg-cyan-400 rounded-full shadow-[0_0_8px_cyan]"
                            />
                        ))}
                    </div>

                    {/* Action Panel: Publish Content */}
                    <div className="flex flex-col gap-6">
                        <div className="flex-1 p-5 sm:p-8 bg-gray-900/40 border border-gray-800 rounded-3xl backdrop-blur-xl space-y-6 flex flex-col">
                            <div className="flex items-center gap-3 border-b border-gray-800 pb-4">
                                <Send className="w-6 h-6 text-cyan-400" />
                                <h3 className="text-xl font-bold text-white tracking-tight">Publicar na Rede</h3>
                            </div>

                            <div className="flex-1 space-y-5 py-4">
                                <p className="text-sm text-gray-400 leading-relaxed">
                                    Anuncie metadados de vídeo para todos os nós federados. O conteúdo será indexável instantaneamente por toda a rede Orion.
                                </p>

                                <div className="space-y-4">
                                    <div className="group">
                                        <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1 group-focus-within:text-cyan-400 transition-colors">Título Global</label>
                                        <input
                                            value={pubTitle}
                                            onChange={(e) => setPubTitle(e.target.value)}
                                            placeholder="Ex: Interstellar [2014] Full HD"
                                            className="w-full bg-black/50 border border-gray-800 rounded-xl p-3 text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 outline-none transition-all placeholder:text-gray-700"
                                        />
                                    </div>
                                    <div className="group">
                                        <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1 group-focus-within:text-cyan-400 transition-colors">InfoHash / Magnet ID</label>
                                        <input
                                            value={pubHash}
                                            onChange={(e) => setPubHash(e.target.value)}
                                            placeholder="8738bc93a891e..."
                                            className="w-full bg-black/50 border border-gray-800 rounded-xl p-3 text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 outline-none transition-all placeholder:text-gray-700"
                                        />
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={handlePublish}
                                disabled={publishing}
                                className={`w-full py-4 rounded-xl font-black text-sm tracking-widest transition-all shadow-lg flex items-center justify-center gap-3
                                    ${publishing
                                        ? 'bg-gray-800 text-gray-500'
                                        : 'bg-cyan-600 hover:bg-cyan-500 text-white hover:shadow-cyan-500/20 active:scale-95'}`}
                            >
                                {publishing ? <Activity className="w-5 h-5 animate-spin" /> : <Globe className="w-5 h-5" />}
                                {publishing ? 'PROPAGANDO...' : 'BROADCAST CONTENT'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Peer Management Table */}
                <div className="bg-gray-900/30 rounded-3xl border border-gray-900 p-8 shadow-2xl">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-8 bg-cyan-500 rounded-full" />
                            <h2 className="text-xl font-bold text-white uppercase tracking-tighter">Synced Node Swarm</h2>
                        </div>
                        <span className="text-[10px] font-mono text-gray-500 uppercase">Total Peers: {status?.peers || 0}</span>
                    </div>

                    {status?.activePeers && status.activePeers.length > 0 ? (
                        <div className="overflow-hidden rounded-2xl border border-gray-800/50">
                            <table className="w-full text-left font-mono text-sm">
                                <thead className="bg-gray-900/50">
                                    <tr className="text-gray-500 border-b border-gray-800 text-[10px] uppercase tracking-widest">
                                        <th className="p-4">Node Fingerprint</th>
                                        <th className="p-4">Federation Endpoint</th>
                                        <th className="p-4">Latency</th>
                                        <th className="p-4 text-right">Last Heartbeat</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800/30">
                                    {status.activePeers.map((peer: any, idx: number) => (
                                        <tr key={idx} className="hover:bg-cyan-500/[0.02] transition-colors group">
                                            <td className="p-4 font-bold text-cyan-400 group-hover:text-cyan-300">
                                                {peer.nodeId}
                                            </td>
                                            <td className="p-4 text-gray-500 text-xs">
                                                {peer.address}
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-16 h-1 bg-gray-800 rounded-full overflow-hidden">
                                                        <div className="h-full bg-green-500 w-[80%]" />
                                                    </div>
                                                    <span className="text-[10px] text-green-500">Fast</span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-right text-gray-500 text-xs">
                                                {new Date(peer.lastSeen).toLocaleTimeString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="py-20 text-center border-2 border-dashed border-gray-900 rounded-3xl">
                            <div className="p-4 bg-gray-900/50 inline-block rounded-full mb-4">
                                <Globe className="w-12 h-12 text-gray-700" />
                            </div>
                            <h3 className="text-gray-500 font-bold uppercase tracking-widest text-sm">Nenhum peer federado encontrado</h3>
                            <p className="text-gray-700 text-xs mt-2">O nó está operando em modo isolado ou aguardando bootstrapping.</p>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};

const StatCard = ({ icon, title, value, subValue, color }: { icon: any, title: string, value: string | number, subValue: string, color: string }) => {
    const colorMap: any = {
        cyan: 'border-cyan-500/30 bg-cyan-500/5 text-cyan-400',
        blue: 'border-blue-500/30 bg-blue-500/5 text-blue-400',
        purple: 'border-purple-500/30 bg-purple-500/5 text-purple-400',
        green: 'border-green-500/30 bg-green-500/5 text-green-400',
        orange: 'border-orange-500/30 bg-orange-500/5 text-orange-400',
    };

    return (
        <motion.div
            whileHover={{ y: -5 }}
            className={`p-6 border rounded-3xl backdrop-blur-sm transition-all shadow-lg ${colorMap[color]}`}
        >
            <div className="flex items-center gap-3 mb-4">
                <div className={`p-2 rounded-xl bg-black/50 border border-current opacity-70`}>
                    {React.cloneElement(icon, { size: 20 })}
                </div>
                <h3 className="text-[10px] font-black uppercase tracking-widest opacity-60 font-sans">{title}</h3>
            </div>
            <div className="space-y-1">
                <div className="text-2xl font-black tracking-tight text-white">{value}</div>
                <div className="text-[10px] font-bold opacity-40 uppercase">{subValue}</div>
            </div>
        </motion.div>
    );
};
