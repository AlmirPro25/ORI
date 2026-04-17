import React from 'react';
import { Play, Zap, Cpu, Scan, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { STORAGE_BASE_URL } from '@/lib/axios';
import { useDiscoveryFeed } from '@/hooks/useDiscovery';
import { getPtbrCoverageHint } from '@/lib/ptbr-coverage';

type HeroCandidate = {
    id: string;
    title: string;
    subtitle: string;
    image: string;
    href: string;
    badge: string;
    meta: string[];
    rating: string;
};

export const HeroSection = () => {
    const navigate = useNavigate();
    const { feed } = useDiscoveryFeed();

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

    const featured = React.useMemo<HeroCandidate | null>(() => {
        if (!feed?.featured) return null;
        const ptbrHint = getPtbrCoverageHint(feed.featured);

        const preferredImage = feed.featured.backdrop || feed.featured.image;
        const image = preferredImage?.startsWith('http')
            ? preferredImage
            : preferredImage
                ? `${STORAGE_BASE_URL}/${preferredImage}`
                : '';

        if (!image) return null;

        const scoreBoost = feed.featured.views ? feed.featured.views / 30 : feed.featured.score / 15;

        return {
            id: feed.featured.id,
            title: feed.featured.title,
            subtitle: feed.featured.subtitle,
            image,
            href: feed.featured.href,
            badge: feed.featured.badge,
            meta: [
                feed.featured.category || 'Catalogo',
                feed.featured.quality || (feed.featured.kind === 'series' ? 'Serie' : '1080p'),
                ptbrHint?.label || (feed.featured.isPortuguese ? 'PT-BR' : feed.featured.status),
                feed.featured.arconteTrustLabel || null,
            ].filter((item): item is string => Boolean(item)),
            rating: Math.min(9.9, 7.4 + scoreBoost).toFixed(1),
        };
    }, [feed]);

    const fallbackImage = `data:image/svg+xml;utf8,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">
            <defs>
                <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
                    <stop offset="0%" stop-color="#05070d"/>
                    <stop offset="100%" stop-color="#0d1522"/>
                </linearGradient>
            </defs>
            <rect width="1600" height="900" fill="url(#bg)"/>
            <circle cx="1180" cy="220" r="180" fill="#22d3ee" fill-opacity="0.12"/>
            <circle cx="420" cy="700" r="220" fill="#38bdf8" fill-opacity="0.08"/>
            <text x="120" y="420" fill="#e5f7ff" font-size="88" font-family="Arial" font-weight="700">ARCONTE</text>
            <text x="120" y="510" fill="#6ee7f9" font-size="44" font-family="Arial">sincronizando o catálogo real</text>
        </svg>
    `)}`;

    const fallbackFeatured: HeroCandidate = featured || {
        id: 'fallback',
        title: 'Arconte Online',
        subtitle: 'O feed principal agora espera conteúdo real do catálogo. Sem capa de demonstração competindo com a sua biblioteca.',
        image: fallbackImage,
        href: '/movies',
        badge: 'Catalog Real',
        meta: ['Nexus', 'Curadoria viva', 'Sem mock'],
        rating: '9.0',
    };

    return (
        <div
            onMouseMove={handleMouseMove}
            className="relative min-h-[78vh] md:min-h-[90vh] w-full overflow-hidden flex items-center justify-center perspective-1000 bg-background pt-20 md:pt-24"
        >
            <div className="absolute inset-0 bg-black z-0">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.14),transparent_40%),linear-gradient(180deg,#05070d_0%,#05070d_45%,#090d16_100%)]" />
                <motion.div
                    style={{
                        opacity: 0.4,
                        background: `radial-gradient(circle at ${glowX}% ${glowY}%, rgba(56, 189, 248, 0.15), transparent 60%)`
                    }}
                    className="absolute inset-0 transition-opacity duration-300"
                />
                <div className="absolute -bottom-[50%] -left-[50%] w-[200%] h-[200%] bg-[linear-gradient(to_right,#333_1px,transparent_1px),linear-gradient(to_bottom,#333_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-20 transform perspective-500 rotate-x-60 animate-grid-flow" />
            </div>

            <motion.div
                style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
                className="relative z-10 w-full max-w-7xl px-4 sm:px-6 md:px-10 lg:px-6 grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12 items-center"
            >
                <div className="space-y-7 md:space-y-10 transform translate-z-20">
                    <motion.div
                        initial={{ opacity: 0, x: -50 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 }}
                        className="flex flex-wrap items-center gap-3"
                    >
                        <div className="px-3 py-1 bg-primary/10 border border-primary/20 rounded-full flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                            <span className="text-[10px] font-mono text-primary tracking-widest uppercase">Catalog Online</span>
                        </div>
                        <span className="text-[10px] font-mono text-white/40 tracking-widest uppercase">{fallbackFeatured.badge}</span>
                    </motion.div>

                    <h1 className="text-4xl sm:text-5xl md:text-7xl lg:text-[6rem] font-black tracking-[-0.05em] leading-[0.9] uppercase italic text-white mix-blend-screen drop-shadow-2xl">
                        <motion.span
                            initial={{ y: 50, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.4 }}
                            className="block text-transparent bg-clip-text bg-gradient-to-r from-white via-white/80 to-white/40"
                        >
                            {fallbackFeatured.title.split(' ').slice(0, 2).join(' ') || fallbackFeatured.title}
                        </motion.span>
                        <motion.span
                            initial={{ y: 50, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.5 }}
                            className="block text-primary drop-shadow-[0_0_15px_rgba(56,189,248,0.5)]"
                        >
                            {fallbackFeatured.title.split(' ').slice(2).join(' ') || 'Em Destaque'}
                        </motion.span>
                    </h1>

                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.6 }}
                        className="text-sm sm:text-base md:text-xl text-white/60 font-medium leading-relaxed max-w-xl border-l-2 border-primary/30 pl-4 md:pl-6"
                    >
                        {fallbackFeatured.subtitle}
                    </motion.p>

                    <div className="flex flex-wrap gap-2 md:gap-3 text-[9px] md:text-[10px] font-black uppercase tracking-[0.18em] md:tracking-[0.25em] text-white/50">
                        {fallbackFeatured.meta.map((item) => (
                            <span key={item} className="px-3 py-1.5 rounded-full border border-white/10 bg-white/5">
                                {item}
                            </span>
                        ))}
                    </div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.8 }}
                        className="flex flex-col sm:flex-row sm:flex-wrap gap-3 md:gap-4 pt-2 md:pt-4"
                    >
                        <Button
                            onClick={() => navigate(fallbackFeatured.href)}
                            className="h-12 md:h-14 w-full sm:w-auto px-6 md:px-8 rounded-2xl bg-white text-black font-black uppercase tracking-[0.18em] md:tracking-widest hover:scale-105 active:scale-95 transition-all shadow-[0_0_30px_-5px_white] hover:bg-white/90 group"
                        >
                            <Play size={18} className="mr-2 group-hover:scale-125 transition-transform" fill="currentColor" />
                            Assistir
                        </Button>
                        <Button
                            onClick={() => navigate('/series')}
                            className="h-12 md:h-14 w-full sm:w-auto px-6 md:px-8 rounded-2xl bg-cyan-500 text-black font-black uppercase tracking-[0.18em] md:tracking-widest hover:scale-105 active:scale-95 transition-all shadow-[0_0_30px_-5px_rgb(6,182,212)] hover:bg-cyan-400 group"
                        >
                            <Activity size={18} className="mr-2" />
                            Series
                        </Button>
                        <Button
                            onClick={() => navigate('/stats')}
                            variant="outline"
                            className="h-12 md:h-14 w-full sm:w-auto px-6 md:px-8 rounded-2xl border-white/10 bg-white/5 font-black uppercase tracking-[0.18em] md:tracking-widest text-white hover:bg-white/10 hover:border-primary/50 transition-all backdrop-blur-md group"
                        >
                            <Activity size={18} className="mr-2 text-primary animate-pulse" />
                            Status
                        </Button>
                    </motion.div>
                </div>

                <div className="lg:hidden">
                    <motion.div
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                        onClick={() => navigate(fallbackFeatured.href)}
                        className="relative mx-auto w-full max-w-sm rounded-[2rem] overflow-hidden border border-white/10 bg-black/60 shadow-2xl"
                    >
                        <img
                            src={fallbackFeatured.image}
                            className="h-56 w-full object-cover opacity-85"
                            alt={fallbackFeatured.title}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/15 to-transparent" />
                        <div className="absolute inset-x-0 bottom-0 p-4 space-y-2">
                            <div className="inline-flex items-center rounded-full border border-white/10 bg-black/50 px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-white/80">
                                {fallbackFeatured.badge}
                            </div>
                            <h3 className="text-xl font-black uppercase italic leading-tight text-white">
                                {fallbackFeatured.title}
                            </h3>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-primary/80">
                                {fallbackFeatured.meta.slice(0, 3).join(' • ')}
                            </p>
                        </div>
                    </motion.div>
                </div>

                <div className="hidden lg:flex justify-end transform translate-z-40 perspective-500">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8, rotateY: -15 }}
                        animate={{ opacity: 1, scale: 1, rotateY: -15 }}
                        transition={{ delay: 0.6, type: 'spring' }}
                        className="relative w-[400px] h-[580px] group cursor-pointer"
                        onClick={() => navigate(fallbackFeatured.href)}
                    >
                        <div className="absolute inset-0 bg-primary/20 blur-[80px] -z-10 group-hover:bg-primary/30 transition-all duration-700" />

                        <div className="relative h-full w-full rounded-[2.5rem] overflow-hidden bg-black border border-white/10 shadow-2xl transition-all duration-500 group-hover:scale-[1.02] group-hover:border-primary/50">
                            <img
                                src={fallbackFeatured.image}
                                className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-500"
                                alt={fallbackFeatured.title}
                            />

                            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-90" />

                            <div className="absolute top-6 left-6 right-6 flex justify-between items-start">
                                <div className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-[10px] font-black uppercase tracking-widest text-white">
                                    {fallbackFeatured.badge}
                                </div>
                                <Scan className="text-white/60 w-6 h-6 animate-pulse" />
                            </div>

                            <div className="absolute bottom-10 left-8 right-8 space-y-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <Cpu size={16} className="text-primary" />
                                    <span className="text-xs font-mono text-primary uppercase tracking-widest">Arconte Curated</span>
                                </div>
                                <h3 className="text-4xl font-black uppercase italic leading-none text-white">
                                    {fallbackFeatured.title.split(' ').slice(0, 2).join(' ')}
                                    <br />
                                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-cyan-300">
                                        {fallbackFeatured.title.split(' ').slice(2).join(' ') || 'Signal'}
                                    </span>
                                </h3>
                                <div className="flex items-center gap-4 text-xs font-bold text-white/60 pt-2">
                                    {fallbackFeatured.meta.map((item) => (
                                        <React.Fragment key={item}>
                                            <span>{item}</span>
                                            <span className="w-1 h-1 bg-white/40 rounded-full" />
                                        </React.Fragment>
                                    )).slice(0, 5)}
                                </div>
                            </div>
                        </div>

                        <motion.div
                            animate={{ y: [0, -10, 0] }}
                            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                            className="absolute -right-8 top-20 w-32 p-4 bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl z-20"
                        >
                            <div className="flex items-center gap-3 mb-2">
                                <Zap size={16} className="text-yellow-400 fill-yellow-400" />
                                <span className="text-[10px] font-bold text-white uppercase">Rating</span>
                            </div>
                            <div className="text-3xl font-black text-white italic">{fallbackFeatured.rating}</div>
                        </motion.div>
                    </motion.div>
                </div>
            </motion.div>

            <div className="absolute bottom-0 w-full h-32 bg-gradient-to-t from-background to-transparent z-20 pointer-events-none" />
        </div>
    );
};
