import React, { useState } from 'react';
import { useVideoFeed } from '@/hooks/useVideos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Shield,
    Trash2,
    Edit,
    Play,
    Clock,
    CheckCircle,
    AlertCircle,
    ExternalLink,
    MoreVertical,
    BarChart3,
    Loader2
} from 'lucide-react';
import { STORAGE_BASE_URL } from '@/lib/axios';
import apiClient from '@/lib/axios';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { SeriesDeepImport } from '@/components/SeriesDeepImport';

export const AdminPage: React.FC = () => {
    const { videos, loading, refresh } = useVideoFeed();
    const [filterStatus, setFilterStatus] = useState<string>('ALL');
    const [currentTab, setCurrentTab] = useState<'VIDEOS' | 'SERIES_INGEST'>('VIDEOS');
    const [editingVideo, setEditingVideo] = useState<any | null>(null);
    const [editData, setEditData] = useState({ title: '', category: '' });

    // Novas estatísticas de Analytics
    const [analytics, setAnalytics] = useState<any>(null);

    const fetchAnalytics = async () => {
        try {
            const res = await apiClient.get('/admin/analytics');
            setAnalytics(res.data);
        } catch (e) {
            console.error('Falha ao carregar analytics');
        } finally {
            // Stats updated
        }
    };

    React.useEffect(() => {
        fetchAnalytics();
        const interval = setInterval(fetchAnalytics, 30000); // Atualiza a cada 30s
        return () => clearInterval(interval);
    }, []);

    const filteredVideos = videos.filter(v =>
        filterStatus === 'ALL' ? true : v.status === filterStatus
    );

    const handleEditClick = (video: any) => {
        setEditingVideo(video);
        setEditData({ title: video.title, category: video.category || 'Geral' });
    };

    const handleUpdate = async () => {
        if (!editingVideo) return;
        try {
            await apiClient.patch(`/videos/${editingVideo.id}`, editData);
            setEditingVideo(null);
            refresh();
            fetchAnalytics();
        } catch (e) {
            alert('Falha ao atualizar vídeo.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Deseja realmente deletar este ativo? Esta ação é irreversível.')) return;
        try {
            await apiClient.delete(`/videos/${id}`);
            refresh();
            fetchAnalytics();
        } catch (e) {
            alert('Falha ao deletar vídeo.');
        }
    };

    if (loading && videos.length === 0) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-primary font-mono text-xs uppercase tracking-widest">Acessando Terminal Admin...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background pt-24 pb-20 px-4 md:px-12">
            {/* Admin Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-primary">
                        <Shield size={24} />
                        <span className="font-mono text-xs uppercase tracking-[0.3em]">Command Center v3.0</span>
                    </div>
                    <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase italic">
                        Real-time <span className="text-primary">Analytics</span>
                    </h1>
                </div>

                <div className="flex flex-wrap gap-3">
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center gap-6 shadow-2xl backdrop-blur-md">
                        <div className="text-center">
                            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Ativos Totais</p>
                            <p className="text-2xl font-black">{analytics?.stats.videos || '...'}</p>
                        </div>
                        <div className="w-[1px] h-8 bg-white/10" />
                        <div className="text-center">
                            <p className="text-[10px] text-green-500 uppercase font-bold tracking-widest">Usuários</p>
                            <p className="text-2xl font-black text-green-500">{analytics?.stats.users || '...'}</p>
                        </div>
                        <div className="w-[1px] h-8 bg-white/10" />
                        <div className="text-center">
                            <p className="text-[10px] text-primary uppercase font-bold tracking-widest">Views Totais</p>
                            <p className="text-2xl font-black text-primary">{analytics?.stats.views || '...'}</p>
                        </div>
                        <div className="w-[1px] h-8 bg-white/10" />
                        <div className="text-center">
                            <p className="text-[10px] text-purple-500 uppercase font-bold tracking-widest">Nodes Ativos</p>
                            <div className="flex items-center justify-center gap-2">
                                <div className="w-2 h-2 bg-purple-500 rounded-full animate-ping" />
                                <p className="text-2xl font-black text-purple-500">{analytics?.stats.activeNodes || '...'}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-4 mb-8 border-b border-white/5 pb-4">
                <button
                    onClick={() => setCurrentTab('VIDEOS')}
                    className={cn(
                        "text-xs font-black uppercase tracking-widest pb-4 relative transition-all",
                        currentTab === 'VIDEOS' ? "text-primary" : "text-gray-500 hover:text-white"
                    )}
                >
                    Biblioteca de Ativos
                    {currentTab === 'VIDEOS' && (
                        <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary" />
                    )}
                </button>
                <button
                    onClick={() => setCurrentTab('SERIES_INGEST')}
                    className={cn(
                        "text-xs font-black uppercase tracking-widest pb-4 relative transition-all",
                        currentTab === 'SERIES_INGEST' ? "text-primary" : "text-gray-500 hover:text-white"
                    )}
                >
                    Ingestão de Séries
                    {currentTab === 'SERIES_INGEST' && (
                        <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary" />
                    )}
                </button>
            </div>

            {/* Filters & Actions */}
            {currentTab === 'VIDEOS' && (
                <div className="flex flex-col md:flex-row gap-4 mb-8">
                    <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
                        {['ALL', 'READY', 'PROCESSING', 'FAILED', 'NEXUS'].map((status) => (
                            <button
                                key={status}
                                onClick={() => setFilterStatus(status)}
                                className={cn(
                                    "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                                    filterStatus === status
                                        ? "bg-primary text-background shadow-glow"
                                        : "text-gray-500 hover:text-white"
                                )}
                            >
                                {status === 'NEXUS' ? 'Nexus Agent' : (status === 'ALL' ? 'Todos' : status)}
                            </button>
                        ))}
                    </div>
                    <Button onClick={() => refresh()} variant="outline" size="sm" className="ml-auto border-white/10 font-bold uppercase text-[10px] tracking-widest">
                        <BarChart3 size={14} className="mr-2" /> Sincronizar Feed
                    </Button>
                </div>
            )}

            {/* Video Table */}
            {currentTab === 'VIDEOS' && (
                <div className="bg-white/5 rounded-3xl border border-white/5 overflow-hidden shadow-2xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-white/5 bg-white/[0.02]">
                                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Preview / Título</th>
                                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Categoria</th>
                                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Status</th>
                                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Data</th>
                                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-500 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                <AnimatePresence mode="popLayout">
                                    {filteredVideos.map((video) => (
                                        <motion.tr
                                            key={video.id}
                                            layout
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            className="group hover:bg-white/[0.03] transition-colors"
                                        >
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-20 aspect-video rounded-lg overflow-hidden border border-white/10 bg-black flex-shrink-0 relative">
                                                        {video.status === 'NEXUS' ? (
                                                            <div className="w-full h-full flex items-center justify-center bg-primary/20">
                                                                <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=40&w=200')] bg-cover opacity-30 grayscale" />
                                                                <Loader2 size={24} className="text-primary animate-spin relative z-10" strokeWidth={1} />
                                                            </div>
                                                        ) : video.thumbnailPath ? (
                                                            <img
                                                                src={`${STORAGE_BASE_URL}/${video.thumbnailPath}`}
                                                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center">
                                                                <Play size={16} className="text-gray-700" />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="font-bold text-sm truncate">{video.title}</p>
                                                        <p className="text-[10px] text-gray-500 font-mono truncate uppercase tracking-tighter">{video.id}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                                    {video.category || 'Geral'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    {video.status === 'READY' && <CheckCircle size={14} className="text-green-500" />}
                                                    {video.status === 'PROCESSING' && <Clock size={14} className="text-yellow-500 animate-pulse" />}
                                                    {video.status === 'FAILED' && <AlertCircle size={14} className="text-red-500" />}
                                                    {video.status === 'NEXUS' && <Loader2 size={14} className="text-primary animate-spin" />}
                                                    <span className={cn(
                                                        "text-[10px] font-black uppercase tracking-widest",
                                                        video.status === 'READY' && "text-green-500",
                                                        video.status === 'PROCESSING' && "text-yellow-500",
                                                        video.status === 'FAILED' && "text-red-500",
                                                        video.status === 'NEXUS' && "text-primary"
                                                    )}>
                                                        {video.status}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <p className="text-[10px] text-gray-400 font-mono">
                                                    {format(new Date(video.createdAt), "dd MMM yyyy", { locale: ptBR })}
                                                </p>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Button
                                                        onClick={() => handleEditClick(video)}
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-8 w-8 text-gray-400 hover:text-white"
                                                    >
                                                        <Edit size={14} />
                                                    </Button>
                                                    <Button
                                                        onClick={() => handleDelete(video.id)}
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-8 w-8 text-gray-400 hover:text-red-500"
                                                    >
                                                        <Trash2 size={14} />
                                                    </Button>
                                                    <a href={`/videos/${video.id}`} target="_blank" rel="noreferrer">
                                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-primary">
                                                            <ExternalLink size={14} />
                                                        </Button>
                                                    </a>
                                                </div>
                                                <div className="group-hover:hidden">
                                                    <MoreVertical size={16} className="text-gray-700 ml-auto" />
                                                </div>
                                            </td>
                                        </motion.tr>
                                    ))}
                                </AnimatePresence>
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {currentTab === 'SERIES_INGEST' && (
                <div className="max-w-4xl">
                    <SeriesDeepImport />
                </div>
            )}

            {/* Edit Modal */}
            <AnimatePresence>
                {editingVideo && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setEditingVideo(null)}
                            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="bg-card w-full max-w-md relative z-10 border border-white/10 rounded-3xl shadow-2xl p-8"
                        >
                            <div className="space-y-6">
                                <div className="space-y-1">
                                    <h3 className="text-xl font-black uppercase italic tracking-tighter">Editar Ativo</h3>
                                    <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">ID: {editingVideo.id}</p>
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Título do Ativo</Label>
                                        <Input
                                            value={editData.title}
                                            onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                                            className="bg-black/40 border-white/10"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Categoria</Label>
                                        <select
                                            value={editData.category}
                                            onChange={(e) => setEditData({ ...editData, category: e.target.value })}
                                            className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary/50 outline-none"
                                        >
                                            <option value="Geral">Geral</option>
                                            <option value="Ação">Ação</option>
                                            <option value="Documentário">Documentário</option>
                                            <option value="Série">Série</option>
                                            <option value="Tecnologia">Tecnologia</option>
                                            <option value="Originals">Originals</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="flex gap-3 pt-4">
                                    <Button
                                        onClick={() => setEditingVideo(null)}
                                        variant="ghost"
                                        className="flex-1 font-bold uppercase text-[10px] tracking-widest"
                                    >
                                        Cancelar
                                    </Button>
                                    <Button
                                        onClick={handleUpdate}
                                        className="flex-1 glow-primary font-bold uppercase text-[10px] tracking-widest"
                                    >
                                        Salvar Alterações
                                    </Button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {
                filteredVideos.length === 0 && (
                    <div className="py-20 text-center space-y-4">
                        <p className="text-gray-500 font-mono text-xs uppercase tracking-widest">Nenhum ativo encontrado para os filtros atuais.</p>
                    </div>
                )
            }
        </div >
    );
};
