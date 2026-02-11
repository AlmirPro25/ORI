import { Video } from '../types/schema';
import { Play, Clock, User, Eye } from 'lucide-react';

export default function VideoGrid({ videos, onSelect }: { videos: Video[], onSelect: (v: Video) => void }) {
    if (videos.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-slate-800 rounded-3xl">
                <div className="bg-slate-900 p-4 rounded-full mb-4">
                    <Play size={32} className="text-slate-700" />
                </div>
                <p className="text-slate-500 font-medium">Nenhum ativo disponível no repositório.</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {videos.map((video) => (
                <div
                    key={video.id}
                    onClick={() => onSelect(video)}
                    className="industrial-card group cursor-pointer overflow-hidden rounded-2xl flex flex-col h-full bg-slate-900/40"
                >
                    {/* Thumbnail Placeholder */}
                    <img
                        src={video.thumbnailPath?.startsWith('http') ? video.thumbnailPath : `http://localhost:3000/${video.thumbnailPath}`}
                        alt={video.title}
                        onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?q=80&w=500';
                        }}
                        className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <Play className="text-white opacity-0 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300 relative z-10" size={48} />
                    <div className="absolute top-3 right-3 bg-blue-600 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider relative z-10">
                        {video.status}
                    </div>

                    <div className="p-5 flex-1 flex flex-col">
                        <h3 className="text-lg font-bold text-slate-100 mb-1 line-clamp-1 group-hover:text-blue-400 transition-colors">
                            {video.title}
                        </h3>
                        <p className="text-sm text-slate-500 line-clamp-2 mb-4 flex-1">
                            {video.description || 'Sem descrição técnica fornecida.'}
                        </p>

                        <div className="flex items-center justify-between pt-4 border-t border-slate-800/50">
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                                <User size={14} className="text-blue-500" />
                                <span>{video.user?.name || 'Sistema'}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1 text-xs text-slate-500">
                                    <Eye size={14} />
                                    <span>{video.views}</span>
                                </div>
                                <div className="flex items-center gap-1 text-xs text-slate-500">
                                    <Clock size={14} />
                                    <span>{new Date(video.createdAt).toLocaleDateString()}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
