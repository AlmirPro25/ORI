import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
    Search, User, Menu, X, Tv,
    Heart, Radio, Activity, LayoutGrid
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
                ? 'bg-background/80 backdrop-blur-2xl border-b border-white/5 py-3'
                : 'bg-transparent py-6'
                }`}
        >
            <div className="max-w-7xl mx-auto px-6 md:px-12 flex items-center justify-between">

                {/* Brand */}
                <div className="flex items-center gap-12">
                    <Link to="/" className="text-2xl font-black tracking-tighter text-primary flex items-center gap-2 group">
                        <div className="bg-primary text-background px-1.5 rounded-sm group-hover:scale-110 transition-transform font-black shadow-glow">O</div>
                        <span className="tracking-widest text-white">ORION</span>
                    </Link>

                    {/* Desktop Navigation */}
                    <nav className="hidden lg:flex items-center gap-8">
                        {navLinks.map((link) => (
                            <Link
                                key={link.path}
                                to={link.path}
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
                <div className="flex items-center gap-6">
                    <Link to="/search" className="text-white/60 hover:text-primary transition-colors">
                        <Search size={20} />
                    </Link>

                    <div className="hidden md:flex items-center gap-4 border-l border-white/10 pl-6">
                        <Link to="/stats" className="text-white/60 hover:text-primary transition-colors">
                            <Activity size={20} />
                        </Link>
                        <Link to="/profile" className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:border-primary/50 transition-all overflow-hidden group">
                            <User size={20} className="group-hover:scale-110 transition-transform" />
                        </Link>
                    </div>

                    {/* Mobile Menu Toggle */}
                    <button
                        className="lg:hidden text-white"
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
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
                        className="lg:hidden bg-background border-b border-white/5 overflow-hidden"
                    >
                        <div className="px-6 py-8 flex flex-col gap-6">
                            {navLinks.map((link) => (
                                <Link
                                    key={link.path}
                                    to={link.path}
                                    onClick={() => setMobileMenuOpen(false)}
                                    className={`text-lg font-black uppercase tracking-tighter flex items-center gap-3 ${location.pathname === link.path ? 'text-primary' : 'text-white'
                                        }`}
                                >
                                    {link.icon && <link.icon size={18} />}
                                    {link.name}
                                </Link>
                            ))}
                            <Link
                                to="/profile"
                                onClick={() => setMobileMenuOpen(false)}
                                className="flex items-center gap-3 text-lg font-black uppercase tracking-tighter text-white border-t border-white/5 pt-6"
                            >
                                <User size={18} />
                                Perfil
                            </Link>
                            <Link
                                to="/stats"
                                onClick={() => setMobileMenuOpen(false)}
                                className="flex items-center gap-3 text-lg font-black uppercase tracking-tighter text-white border-t border-white/5 pt-6"
                            >
                                <Activity size={18} />
                                Status
                            </Link>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </header>
    );
};
