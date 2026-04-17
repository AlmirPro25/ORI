import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Tv, Play, ChevronRight, ChevronLeft, Signal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BACKEND_URL } from '@/lib/endpoints';

interface Channel {
    id: string;
    name: string;
    logo: string | null;
    groupTitle: string;
    streamUrl: string;
}

export function LiveTVRow() {
    const [channels, setChannels] = useState<Channel[]>([]);
    const [loading, setLoading] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchTrending = async () => {
            try {
                const res = await fetch(`${BACKEND_URL}/api/iptv/channels?limit=15`);
                const data = await res.json();
                setChannels(data);
            } catch (e) {
                console.error('Failed to fetch trending channels', e);
            } finally {
                setLoading(false);
            }
        };
        fetchTrending();
    }, []);

    const scroll = (direction: 'left' | 'right') => {
        if (scrollRef.current) {
            const { scrollLeft, clientWidth } = scrollRef.current;
            const scrollTo = direction === 'left' ? scrollLeft - clientWidth : scrollLeft + clientWidth;
            scrollRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
        }
    };

    if (!loading && channels.length === 0) return null;

    return (
        <section className="py-8 md:py-10 px-4 sm:px-6 md:px-12 bg-gradient-to-b from-black/0 to-cyan-500/5">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 md:p-2.5 bg-cyan-500/20 rounded-xl border border-cyan-500/30">
                        <Tv className="text-cyan-400" size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl sm:text-2xl font-black text-white tracking-[0.2em] sm:tracking-widest uppercase italic">
                            TV <span className="text-cyan-400">Ao Vivo</span>
                        </h2>
                        <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                            <p className="text-[10px] text-white/40 font-mono tracking-widest uppercase">Transmissão em tempo real</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                    <button
                        onClick={() => scroll('left')}
                        className="hidden sm:flex p-2 bg-white/5 border border-white/10 rounded-full text-white hover:bg-white/10 hover:border-cyan-500/50 transition-all"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <button
                        onClick={() => scroll('right')}
                        className="hidden sm:flex p-2 bg-white/5 border border-white/10 rounded-full text-white hover:bg-white/10 hover:border-cyan-500/50 transition-all"
                    >
                        <ChevronRight size={20} />
                    </button>
                    <Link
                        to="/tv"
                        className="ml-0 sm:ml-1 md:ml-4 px-4 py-2 bg-cyan-500/10 border border-cyan-500/30 rounded-xl text-cyan-400 text-xs font-bold hover:bg-cyan-500 hover:text-black transition-all flex items-center gap-2 whitespace-nowrap"
                    >
                        Ver Todos
                        <ChevronRight size={14} />
                    </Link>
                </div>
            </div>

            <div
                ref={scrollRef}
                className="flex gap-3 sm:gap-4 overflow-x-auto no-scrollbar scroll-smooth pb-4 px-1 snap-x snap-mandatory"
            >
                {loading ? (
                    Array(8).fill(0).map((_, i) => (
                        <div key={i} className="min-w-[156px] sm:min-w-[200px] h-28 sm:h-32 bg-white/5 rounded-2xl animate-pulse snap-start" />
                    ))
                ) : (
                    channels.map((channel) => (
                        <motion.div
                            key={channel.id}
                            whileHover={{ scale: 1.05, y: -5 }}
                            className="min-w-[156px] sm:min-w-[200px] group relative snap-start"
                        >
                            <Link to="/tv" className="block">
                                <div className="aspect-video bg-black/40 border border-white/10 rounded-2xl overflow-hidden relative group-hover:border-cyan-500/50 transition-all">
                                    {channel.logo ? (
                                        <img
                                            src={channel.logo}
                                            alt={channel.name}
                                            className="w-full h-full object-contain p-4 group-hover:scale-110 transition-transform duration-500"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none';
                                                (e.target as HTMLImageElement).parentElement?.classList.add('flex', 'items-center', 'justify-center');
                                            }}
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <Tv size={32} className="text-white/20" />
                                        </div>
                                    )}

                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

                                    <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 bg-red-500 rounded-lg text-[8px] font-black text-white uppercase animate-pulse">
                                        <Signal size={8} />
                                        LIVE
                                    </div>

                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-cyan-500/20">
                                        <div className="w-12 h-12 bg-cyan-500 rounded-full flex items-center justify-center shadow-glow">
                                            <Play className="text-black fill-black ml-1" size={24} />
                                        </div>
                                    </div>
                                </div>
                                <h3 className="mt-3 text-[11px] sm:text-xs font-bold text-white/80 group-hover:text-cyan-400 transition-colors uppercase tracking-[0.14em] sm:tracking-widest truncate">
                                    {channel.name}
                                </h3>
                                <p className="text-[10px] text-white/30 truncate">{channel.groupTitle}</p>
                            </Link>
                        </motion.div>
                    ))
                )}
            </div>
        </section>
    );
}
