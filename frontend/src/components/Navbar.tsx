import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
    Search, User, Menu, X, Tv,
    Heart, Radio, Activity, LayoutGrid
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { prefetchRoute } from '@/lib/route-prefetch';
import { ArcontePulse } from './ArcontePulse';

export const Navbar: React.FC = () => {
    const [isScrolled, setIsScrolled] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const location = useLocation();

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 20);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        setMobileMenuOpen(false);
    }, [location.pathname]);

    useEffect(() => {
        document.body.style.overflow = mobileMenuOpen ? 'hidden' : '';
        return () => {
            document.body.style.overflow = '';
        };
    }, [mobileMenuOpen]);

    const navLinks = [
        { name: 'Início', path: '/' },
        { name: 'Nexus Search', path: '/torrents', icon: Radio },
        { name: 'Live TV', path: '/tv', icon: Tv, highlight: true },
        { name: 'Filmes', path: '/movies' },
        { name: 'Séries', path: '/series' },
        { name: 'Addons', path: '/addons', icon: LayoutGrid },
        { name: 'O Cofre', path: '/favorites', icon: Heart },
    ];

    return (
        <header
            className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-500 ${isScrolled
                ? 'bg-background/85 backdrop-blur-2xl border-b border-white/5 py-3'
                : 'bg-transparent py-4 md:py-6'
                }`}
        >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-12 flex items-center justify-between gap-4">

                {/* Brand */}
                <div className="flex items-center gap-4 lg:gap-12 min-w-0">
                    <Link
                        to="/"
                        onMouseEnter={() => prefetchRoute('/')}
                        onFocus={() => prefetchRoute('/')}
                        className="text-xl sm:text-2xl font-black tracking-tighter text-primary flex items-center gap-2 group min-w-0"
                    >
                        <div className="bg-primary text-background px-1.5 rounded-sm group-hover:scale-110 transition-transform font-black shadow-glow">O</div>
                        <span className="tracking-[0.3em] sm:tracking-widest text-white whitespace-nowrap">ORION</span>
                    </Link>

                    {/* Desktop Navigation */}
                    <nav className="hidden lg:flex items-center gap-8">
                        {navLinks.map((link) => (
                            <Link
                                key={link.path}
                                to={link.path}
                                onMouseEnter={() => prefetchRoute(link.path)}
                                onFocus={() => prefetchRoute(link.path)}
                                className={`text-sm font-bold uppercase tracking-widest transition-all flex items-center gap-2 ${location.pathname === link.path
                                    ? 'text-primary'
                                    : link.highlight
                                        ? 'text-cyan-400 hover:text-cyan-300'
                                        : 'text-white/60 hover:text-white'
                                    }`}
                            >
                                {link.icon && <link.icon size={14} />}
                                {link.name}
                            </Link>
                        ))}
                    </nav>
                </div>

                {/* Right Actions */}
                <div className="flex items-center gap-2 sm:gap-4 lg:gap-6">
                    <Link
                        to="/search"
                        onMouseEnter={() => prefetchRoute('/search')}
                        onFocus={() => prefetchRoute('/search')}
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 hover:text-primary hover:border-primary/40 transition-colors md:border-0 md:bg-transparent md:h-auto md:w-auto"
                    >
                        <Search size={20} />
                    </Link>

                    <div className="hidden lg:block">
                        <ArcontePulse />
                    </div>

                    <div className="hidden md:flex items-center gap-4 border-l border-white/10 pl-6">
                        <Link
                            to="/stats"
                            onMouseEnter={() => prefetchRoute('/stats')}
                            onFocus={() => prefetchRoute('/stats')}
                            className="text-white/60 hover:text-primary transition-colors"
                        >
                            <Activity size={20} />
                        </Link>
                        <Link
                            to="/profile"
                            onMouseEnter={() => prefetchRoute('/profile')}
                            onFocus={() => prefetchRoute('/profile')}
                            className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:border-primary/50 transition-all overflow-hidden group"
                        >
                            <User size={20} className="group-hover:scale-110 transition-transform" />
                        </Link>
                    </div>

                    {/* Mobile Menu Toggle */}
                    <button
                        className="lg:hidden flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white"
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
                    >
                        {mobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
                    </button>
                </div>
            </div>

            {/* Mobile Menu */}
            <AnimatePresence>
                {mobileMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="lg:hidden bg-background/95 backdrop-blur-2xl border-b border-white/5 overflow-hidden"
                    >
                        <div className="px-4 sm:px-6 pt-4 pb-6 flex flex-col gap-3 max-h-[calc(100vh-5rem)] overflow-y-auto">
                            {navLinks.map((link) => (
                                <Link
                                    key={link.path}
                                    to={link.path}
                                    onTouchStart={() => prefetchRoute(link.path)}
                                    onFocus={() => prefetchRoute(link.path)}
                                    className={`rounded-2xl border px-4 py-4 text-sm font-black uppercase tracking-[0.2em] flex items-center gap-3 transition-all ${location.pathname === link.path
                                            ? 'text-primary border-primary/30 bg-primary/10'
                                            : 'text-white border-white/10 bg-white/[0.03]'
                                        }`}
                                >
                                    {link.icon && <link.icon size={18} />}
                                    {link.name}
                                </Link>
                            ))}
                            <div className="grid grid-cols-2 gap-3 pt-3">
                                <Link
                                    to="/profile"
                                    onTouchStart={() => prefetchRoute('/profile')}
                                    onFocus={() => prefetchRoute('/profile')}
                                    className="flex items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm font-black uppercase tracking-[0.2em] text-white"
                                >
                                    <User size={18} />
                                    Perfil
                                </Link>
                                <Link
                                    to="/stats"
                                    onTouchStart={() => prefetchRoute('/stats')}
                                    onFocus={() => prefetchRoute('/stats')}
                                    className="flex items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm font-black uppercase tracking-[0.2em] text-white"
                                >
                                    <Activity size={18} />
                                    Status
                                </Link>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </header>
    );
};
