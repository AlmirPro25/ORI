import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Heart, Share2, Youtube,
    Shield, Signal, Clock, MessageSquare,
    ChevronDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Video {
    youtubeId: string;
    title: string;
    thumbnail: string;
    channelTitle: string;
    description: string;
    publishedAt: string;
    duration?: string;
}

export function WatchVideo() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [video, setVideo] = useState<Video | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDetails = async () => {
            try {
                const res = await fetch(`http://localhost:3000/api/videos/${id}`);
                const data = await res.json();
                setVideo(data);
            } catch (e) {
                console.error('Signal lost');
            } finally {
                setLoading(false);
            }
        };
        fetchDetails();
    }, [id]);

    if (loading) return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
            <Shield className="text-primary animate-pulse" size={48} />
            <p className="text-gray-500 font-mono text-[10px] uppercase tracking-[0.4em]">Decrypting Stream...</p>
        </div>
    );

    if (!video) return <div>404 - Signal Lost</div>;

    return (
        <div className="min-h-screen bg-background pt-24 pb-12 px-6 md:px-12">
            <div className="max-w-7xl mx-auto">

                {/* Back Button */}
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-2 text-gray-500 hover:text-primary transition-colors mb-8 group"
                >
                    <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                    <span className="text-xs font-bold uppercase tracking-widest">Retornar ao Discovery</span>
                </button>

                {/* THEATER MODE PLAYER */}
                <div className="relative aspect-video w-full rounded-3xl overflow-hidden bg-black border border-white/5 shadow-2xl mb-8 group">
                    <iframe
                        src={`https://www.youtube-nocookie.com/embed/${video.youtubeId}?autoplay=1&modestbranding=1&rel=0&iv_load_policy=3&fs=1&color=white`}
                        title={video.title}
                        className="absolute inset-0 w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                    />
                </div>

                {/* Info & Actions */}
                <div className="flex flex-col lg:flex-row gap-8 justify-between">

                    <div className="flex-1 space-y-6">
                        <div className="space-y-2">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="px-2 py-1 bg-red-500/10 border border-red-500/20 rounded text-[10px] font-black text-red-500 uppercase tracking-widest flex items-center gap-2">
                                    <Signal size={12} className="animate-pulse" />
                                    Premium Signal
                                </div>
                                <span className="text-gray-600 font-mono text-[10px] tracking-widest uppercase">ID: {id}</span>
                            </div>
                            <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight leading-tight">
                                {video.title}
                            </h1>
                            <div className="flex items-center gap-4">
                                <p className="text-primary font-bold uppercase tracking-widest text-sm flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                                        <Youtube size={16} className="text-gray-400" />
                                    </div>
                                    {video.channelTitle}
                                </p>
                                <span className="w-1 h-1 rounded-full bg-gray-700" />
                                <span className="text-gray-500 text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                                    <Clock size={14} />
                                    {new Date(video.publishedAt).toLocaleDateString()}
                                </span>
                            </div>
                        </div>

                        <div className="p-6 bg-white/5 border border-white/5 rounded-2xl relative group/desc">
                            <p className="text-gray-400 text-sm whitespace-pre-wrap leading-relaxed line-clamp-3 group-hover/desc:line-clamp-none transition-all">
                                {video.description}
                            </p>
                            <div className="absolute bottom-2 right-6 lg:hidden group-hover/desc:hidden text-primary">
                                <ChevronDown size={20} />
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-4 min-w-[300px]">
                        <div className="grid grid-cols-2 gap-3">
                            <Button className="bg-primary text-background font-black h-14 rounded-2xl hover:bg-emerald-400 shadow-glow">
                                <Heart size={20} className="mr-2" />
                                SALVAR
                            </Button>
                            <Button variant="outline" className="border-white/10 text-white h-14 rounded-2xl hover:bg-white/5">
                                <Share2 size={20} className="mr-2" />
                                SHARE
                            </Button>
                        </div>

                        <div className="p-6 bg-cyan-500/5 border border-cyan-500/20 rounded-2xl">
                            <h4 className="text-cyan-400 text-[10px] font-black uppercase tracking-[0.3em] mb-4 flex items-center gap-2">
                                <MessageSquare size={14} />
                                Sovereignty Tip
                            </h4>
                            <p className="text-gray-400 text-xs leading-relaxed">
                                O protocolo ORION sanitiza este stream em tempo real, removendo trackers e metadados indesejados do Google.
                            </p>
                        </div>
                    </div>

                </div>

                {/* Suggestions / Related (Placeholder) */}
                <div className="mt-20 border-t border-white/5 pt-12 text-center opacity-30">
                    <Shield className="mx-auto text-gray-700 mb-4" size={48} />
                    <p className="text-gray-600 font-mono text-[10px] tracking-widest uppercase italic">Neural Suggestions coming soon...</p>
                </div>

            </div>
        </div>
    );
}
