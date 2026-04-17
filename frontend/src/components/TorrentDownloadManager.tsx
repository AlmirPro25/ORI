import React, { useState } from 'react';
import { Download, Loader2, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { BACKEND_URL } from '@/lib/endpoints';

interface DownloadProgress {
    videoId: string;
    progress: number;
    downloadSpeed: number;
    status: 'downloading' | 'processing' | 'ready' | 'error';
    error?: string;
}

interface TorrentDownloadManagerProps {
    magnetURI: string;
    title: string;
    onComplete?: (videoId: string) => void;
}

export const TorrentDownloadManager: React.FC<TorrentDownloadManagerProps> = ({ 
    magnetURI, 
    title,
    onComplete 
}) => {
    const { token } = useAuthStore();
    const [downloading, setDownloading] = useState(false);
    const [progress, setProgress] = useState<DownloadProgress | null>(null);
    const [videoId, setVideoId] = useState<string | null>(null);

    const startDownload = async () => {
        if (!token) {
            alert('Você precisa estar logado para baixar vídeos');
            return;
        }

        try {
            setDownloading(true);

            const res = await fetch(`${BACKEND_URL}/api/v1/downloads/torrent`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    magnetURI,
                    title,
                    description: 'Baixado via torrent',
                    category: 'Downloads'
                })
            });

            if (!res.ok) throw new Error('Falha ao iniciar download');

            const data = await res.json();
            setVideoId(data.videoId);

            // Polling de progresso
            const interval = setInterval(async () => {
                try {
                    const progressRes = await fetch(`${BACKEND_URL}/api/v1/downloads/${data.videoId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });

                    if (progressRes.ok) {
                        const progressData = await progressRes.json();
                        setProgress(progressData);

                        if (progressData.status === 'ready') {
                            clearInterval(interval);
                            setDownloading(false);
                            if (onComplete) onComplete(data.videoId);
                        } else if (progressData.status === 'error') {
                            clearInterval(interval);
                            setDownloading(false);
                        }
                    }
                } catch (err) {
                    console.error('Erro ao buscar progresso:', err);
                }
            }, 2000);

        } catch (error: any) {
            console.error('Erro ao iniciar download:', error);
            alert('Erro ao iniciar download: ' + error.message);
            setDownloading(false);
        }
    };

    const cancelDownload = async () => {
        if (!videoId || !token) return;

        try {
            await fetch(`${BACKEND_URL}/api/v1/downloads/${videoId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            setDownloading(false);
            setProgress(null);
            setVideoId(null);
        } catch (error) {
            console.error('Erro ao cancelar download:', error);
        }
    };

    const formatSpeed = (bytes: number) => {
        if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB/s';
        return (bytes / 1024).toFixed(0) + ' KB/s';
    };

    return (
        <div className="bg-gray-900 rounded-2xl p-6 border border-white/10">
            <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
                <Download size={20} className="text-primary" />
                Baixar para Servidor
            </h3>

            {!downloading && !progress && (
                <button
                    onClick={startDownload}
                    className="w-full bg-primary hover:bg-primary/80 text-black font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                    <Download size={18} />
                    Iniciar Download
                </button>
            )}

            {downloading && progress && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-400">Status:</span>
                        <span className="text-white font-bold capitalize flex items-center gap-2">
                            {progress.status === 'downloading' && <Loader2 size={14} className="animate-spin text-primary" />}
                            {progress.status === 'processing' && <Loader2 size={14} className="animate-spin text-yellow-500" />}
                            {progress.status === 'ready' && <CheckCircle size={14} className="text-green-500" />}
                            {progress.status === 'error' && <XCircle size={14} className="text-red-500" />}
                            {progress.status === 'downloading' ? 'Baixando' : 
                             progress.status === 'processing' ? 'Processando' :
                             progress.status === 'ready' ? 'Pronto' : 'Erro'}
                        </span>
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between text-xs text-gray-400">
                            <span>Progresso</span>
                            <span className="text-primary font-bold">{progress.progress}%</span>
                        </div>
                        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-primary transition-all duration-500"
                                style={{ width: `${progress.progress}%` }}
                            />
                        </div>
                    </div>

                    {progress.downloadSpeed > 0 && (
                        <div className="text-xs text-gray-400 flex justify-between">
                            <span>Velocidade:</span>
                            <span className="text-white font-mono">{formatSpeed(progress.downloadSpeed)}</span>
                        </div>
                    )}

                    {progress.error && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-xs text-red-400">
                            {progress.error}
                        </div>
                    )}

                    {progress.status !== 'ready' && progress.status !== 'error' && (
                        <button
                            onClick={cancelDownload}
                            className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold py-2 rounded-lg transition-all flex items-center justify-center gap-2 text-sm"
                        >
                            <Trash2 size={14} />
                            Cancelar Download
                        </button>
                    )}

                    {progress.status === 'ready' && (
                        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-center">
                            <p className="text-green-400 font-bold text-sm">✅ Vídeo disponível na biblioteca!</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
