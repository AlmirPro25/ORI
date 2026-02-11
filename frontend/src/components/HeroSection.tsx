import React from 'react';
import { Play, Zap, Cpu, Scan, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

export const HeroSection = () => {
    // Navigation
    const navigate = useNavigate();

    // Mouse Perspective Logic
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    const mouseX = useSpring(x, { stiffness: 50, damping: 20 });
    const mouseY = useSpring(y, { stiffness: 50, damping: 20 });

    function handleMouseMove(event: React.MouseEvent<HTMLDivElement>) {
        const { clientX, clientY } = event;
        const { innerWidth, innerHeight } = window;
        const xPct = clientX / innerWidth - 0.5;
        const yPct = clientY / innerHeight - 0.5;
        x.set(xPct);
        y.set(yPct);
    }

    const rotateX = useTransform(mouseY, [-0.5, 0.5], [10, -10]);
    const rotateY = useTransform(mouseX, [-0.5, 0.5], [-10, 10]);
    const glowX = useTransform(mouseX, [-0.5, 0.5], [0, 100]);
    const glowY = useTransform(mouseY, [-0.5, 0.5], [0, 100]);

    return (
        <div
            onMouseMove={handleMouseMove}
            className="relative min-h-[90vh] w-full overflow-hidden flex items-center justify-center perspective-1000 bg-background pt-20"
        >
            {/* 1. Dynamic Cyber-Grid Background */}
            <div className="absolute inset-0 bg-black z-0">
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 mix-blend-overlay" />
                <motion.div
                    style={{
                        opacity: 0.4,
                        background: `radial-gradient(circle at ${glowX}% ${glowY}%, rgba(56, 189, 248, 0.15), transparent 60%)`
                    }}
                    className="absolute inset-0 transition-opacity duration-300"
                />

                {/* Animated Grid Floor */}
                <div className="absolute -bottom-[50%] -left-[50%] w-[200%] h-[200%] bg-[linear-gradient(to_right,#333_1px,transparent_1px),linear-gradient(to_bottom,#333_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-20 transform perspective-500 rotate-x-60 animate-grid-flow" />
            </div>

            {/* 2. Main Content Wrapper with 3D Tilt */}
            <motion.div
                style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
                className="relative z-10 w-full max-w-7xl px-6 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center"
            >
                {/* LEFT: Typography & Actions */}
                <div className="space-y-10 transform translate-z-20">
                    <motion.div
                        initial={{ opacity: 0, x: -50 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 }}
                        className="flex items-center gap-3"
                    >
                        <div className="px-3 py-1 bg-primary/10 border border-primary/20 rounded-full flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                            <span className="text-[10px] font-mono text-primary tracking-widest uppercase">System Online</span>
                        </div>
                        <span className="text-[10px] font-mono text-white/40 tracking-widest uppercase">v.4.2.0 stable</span>
                    </motion.div>

                    <h1 className="text-6xl sm:text-7xl md:text-8xl lg:text-[7rem] font-black tracking-tighter leading-[0.85] uppercase italic text-white mix-blend-screen drop-shadow-2xl">
                        <motion.span
                            initial={{ y: 50, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.4 }}
                            className="block text-transparent bg-clip-text bg-gradient-to-r from-white via-white/80 to-white/40"
                        >
                            Future
                        </motion.span>
                        <motion.span
                            initial={{ y: 50, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.5 }}
                            className="block text-primary drop-shadow-[0_0_15px_rgba(56,189,248,0.5)]"
                        >
                            Vision
                        </motion.span>
                    </h1>

                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.6 }}
                        className="text-lg md:text-xl text-white/60 font-medium leading-relaxed max-w-xl border-l-2 border-primary/30 pl-6"
                    >
                        Indexação descentralizada de ativos de mídia via protocolo Nexus.
                        A fronteira final do streaming de alta fidelidade.
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.8 }}
                        className="flex flex-wrap gap-4 pt-4"
                    >
                        <Button
                            onClick={() => navigate('/movies')}
                            className="h-14 px-8 rounded-2xl bg-white text-black font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-[0_0_30px_-5px_white] hover:bg-white/90 group"
                        >
                            <Play size={18} className="mr-2 group-hover:scale-125 transition-transform" fill="currentColor" />
                            Iniciar
                        </Button>
                        <Button
                            onClick={() => navigate('/tv')}
                            className="h-14 px-8 rounded-2xl bg-cyan-500 text-black font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-[0_0_30px_-5px_rgb(6,182,212)] hover:bg-cyan-400 group"
                        >
                            <Activity size={18} className="mr-2" />
                            TV ao Vivo
                        </Button>
                        <Button
                            onClick={() => navigate('/stats')}
                            variant="outline"
                            className="h-14 px-8 rounded-2xl border-white/10 bg-white/5 font-black uppercase tracking-widest text-white hover:bg-white/10 hover:border-primary/50 transition-all backdrop-blur-md group"
                        >
                            <Activity size={18} className="mr-2 text-primary animate-pulse" />
                            Status
                        </Button>
                    </motion.div>
                </div>

                {/* RIGHT: Featured Glitch Card */}
                <div className="hidden lg:flex justify-end transform translate-z-40 perspective-500">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8, rotateY: -15 }}
                        animate={{ opacity: 1, scale: 1, rotateY: -15 }}
                        transition={{ delay: 0.6, type: "spring" }}
                        className="relative w-[400px] h-[580px] group cursor-pointer"
                    >
                        {/* Glow Behind */}
                        <div className="absolute inset-0 bg-primary/20 blur-[80px] -z-10 group-hover:bg-primary/30 transition-all duration-700" />

                        {/* The Card */}
                        <div className="relative h-full w-full rounded-[2.5rem] overflow-hidden bg-black border border-white/10 shadow-2xl transition-all duration-500 group-hover:scale-[1.02] group-hover:border-primary/50">
                            <img
                                src="https://images.unsplash.com/photo-1626814026160-2237a95fc5a0?q=80&w=3540&auto=format&fit=crop"
                                className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-500"
                                alt="Featured"
                            />

                            {/* Overlay Gradient */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-90" />

                            {/* Holo UI Elements on Card */}
                            <div className="absolute top-6 left-6 right-6 flex justify-between items-start">
                                <div className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-[10px] font-black uppercase tracking-widest text-white">
                                    Trending Now
                                </div>
                                <Scan className="text-white/60 w-6 h-6 animate-pulse" />
                            </div>

                            <div className="absolute bottom-10 left-8 right-8 space-y-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <Cpu size={16} className="text-primary" />
                                    <span className="text-xs font-mono text-primary uppercase tracking-widest">AI Upscaled</span>
                                </div>
                                <h3 className="text-4xl font-black uppercase italic leading-none text-white">
                                    Cyber <br /> <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-500">Chronicles</span>
                                </h3>
                                <div className="flex items-center gap-4 text-xs font-bold text-white/60 pt-2">
                                    <span>Season 1</span>
                                    <span className="w-1 h-1 bg-white/40 rounded-full" />
                                    <span>2026</span>
                                    <span className="w-1 h-1 bg-white/40 rounded-full" />
                                    <span>Nexus Original</span>
                                </div>
                            </div>
                        </div>

                        {/* Floating Stats Badge */}
                        <motion.div
                            animate={{ y: [0, -10, 0] }}
                            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                            className="absolute -right-8 top-20 w-32 p-4 bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl z-20"
                        >
                            <div className="flex items-center gap-3 mb-2">
                                <Zap size={16} className="text-yellow-400 fill-yellow-400" />
                                <span className="text-[10px] font-bold text-white uppercase">Rating</span>
                            </div>
                            <div className="text-3xl font-black text-white italic">9.8</div>
                        </motion.div>
                    </motion.div>
                </div>
            </motion.div>

            {/* Bottom Fade */}
            <div className="absolute bottom-0 w-full h-32 bg-gradient-to-t from-background to-transparent z-20 pointer-events-none" />
        </div>
    );
};
