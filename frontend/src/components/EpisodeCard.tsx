/**
 * 🎬 EPISODE CARD COMPONENT
 * Card de episódio com status visual, ações e thumbnail.
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Download, Clock, CheckCircle, AlertCircle, Loader2, Film, ChevronRight } from 'lucide-react';
import { Episode } from '@/types/series';
import SeriesService from '@/services/api/series.service';
import { useNavigate } from 'react-router-dom';

interface EpisodeCardProps {
    episode: Episode;
    onDownload?: () => void;
}

const statusConfig: Record<string, { color: string; bgColor: string; textColor: string; Icon: any; label: string }> = {
    READY: { color: 'emerald', bgColor: 'bg-emerald-500/15', textColor: 'text-emerald-400', Icon: CheckCircle, label: 'Assistir' },
    DOWNLOADING: { color: 'blue', bgColor: 'bg-blue-500/15', textColor: 'text-blue-400', Icon: Loader2, label: 'Baixando...' },
    PROCESSING: { color: 'amber', bgColor: 'bg-amber-500/15', textColor: 'text-amber-400', Icon: Loader2, label: 'Processando...' },
    QUEUED: { color: 'yellow', bgColor: 'bg-yellow-500/15', textColor: 'text-yellow-400', Icon: Clock, label: 'Na fila' },
    NOT_DOWNLOADED: { color: 'gray', bgColor: 'bg-white/5', textColor: 'text-white/40', Icon: Download, label: 'Baixar' },
    FAILED: { color: 'red', bgColor: 'bg-red-500/15', textColor: 'text-red-400', Icon: AlertCircle, label: 'Erro' },
};

export const EpisodeCard: React.FC<EpisodeCardProps> = ({ episode, onDownload }) => {
    const navigate = useNavigate();
    const [downloading, setDownloading] = useState(false);
    const config = statusConfig[episode.status] || statusConfig.NOT_DOWNLOADED;
    const StatusIcon = config.Icon;

    const handleDownload = async () => {
        if (downloading) return;
        setDownloading(true);
        try {
            await SeriesService.downloadEpisode(episode.id);
            onDownload?.();
        } catch (err) {
            console.error('Download error:', err);
        } finally {
            setDownloading(false);
        }
    };

    const handlePlay = () => {
        if (episode.status === 'READY') {
            navigate(`/series/episode/${episode.id}`);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="group relative flex gap-4 md:gap-6 p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.06] hover:border-white/10 transition-all duration-300 cursor-pointer"
            onClick={handlePlay}
        >
            {/* Thumbnail */}
            <div className="relative w-32 md:w-44 aspect-video rounded-lg overflow-hidden bg-black/40 flex-shrink-0">
                {episode.stillPath ? (
                    <img
                        src={episode.stillPath}
                        alt={episode.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Film className="w-8 h-8 text-white/10" />
                    </div>
                )}

                {/* Play overlay */}
                {episode.status === 'READY' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
                            <Play className="w-5 h-5 text-white ml-0.5" fill="currentColor" />
                        </div>
                    </div>
                )}

                {/* Episode Number Badge */}
                <div className="absolute top-1.5 left-1.5 bg-black/70 backdrop-blur-sm px-2 py-0.5 rounded text-xs font-bold text-white/80">
                    E{String(episode.episodeNumber).padStart(2, '0')}
                </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                <div>
                    <div className="flex items-start justify-between gap-3">
                        <h3 className="text-sm md:text-base font-semibold text-white truncate">
                            {episode.episodeNumber}. {episode.title}
                        </h3>

                        {/* Status Badge */}
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full flex-shrink-0 ${config.bgColor}`}>
                            <StatusIcon
                                className={`w-3 h-3 ${config.textColor} ${['DOWNLOADING', 'PROCESSING'].includes(episode.status) ? 'animate-spin' : ''}`}
                            />
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${config.textColor}`}>
                                {config.label}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 mt-1.5 text-xs text-white/30">
                        {episode.duration && <span>{episode.duration} min</span>}
                        {episode.quality && (
                            <span className="px-1.5 py-0.5 rounded bg-white/5 text-white/50 font-mono text-[10px]">
                                {episode.quality}
                            </span>
                        )}
                        {episode.fileSize && <span>{episode.fileSize.toFixed(0)} MB</span>}
                    </div>

                    {episode.overview && (
                        <p className="text-xs text-white/40 mt-2 line-clamp-2 leading-relaxed">
                            {episode.overview}
                        </p>
                    )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                    {episode.status === 'READY' && (
                        <button
                            onClick={handlePlay}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/20 text-primary text-xs font-semibold hover:bg-primary/30 transition-colors"
                        >
                            <Play className="w-3 h-3" fill="currentColor" />
                            Assistir
                        </button>
                    )}

                    {(episode.status === 'NOT_DOWNLOADED' || episode.status === 'FAILED') && (
                        <button
                            onClick={handleDownload}
                            disabled={downloading}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-white/60 text-xs font-semibold hover:bg-white/10 transition-colors disabled:opacity-50"
                        >
                            {downloading ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                                <Download className="w-3 h-3" />
                            )}
                            {episode.status === 'FAILED' ? 'Tentar Novamente' : 'Baixar'}
                        </button>
                    )}

                    {episode.status === 'DOWNLOADING' && (
                        <div className="flex items-center gap-2 text-xs text-blue-400">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Baixando...</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Hover arrow */}
            {episode.status === 'READY' && (
                <div className="self-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronRight className="w-5 h-5 text-white/30" />
                </div>
            )}
        </motion.div>
    );
};
