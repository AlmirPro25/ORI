import React from 'react';
import { Link } from 'react-router-dom';
import { Github, Twitter, Youtube, Mail, ShieldCheck, Globe, Zap, Tv, Radio } from 'lucide-react';

export const Footer: React.FC = () => {
    return (
        <footer className="bg-black/80 backdrop-blur-xl border-t border-white/5 pt-12 md:pt-16 pb-8 px-4 sm:px-6 md:px-12 relative z-10">
            <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12 mb-12 md:mb-16">
                {/* Brand Section */}
                <div className="space-y-6">
                    <Link to="/" className="text-xl md:text-2xl font-black tracking-tighter text-primary flex items-center gap-2 group">
                        <div className="bg-primary text-background px-1.5 rounded-sm group-hover:scale-110 transition-transform font-black shadow-glow">S</div>
                        <span className="tracking-widest text-white">STREAMFORGE</span>
                    </Link>
                    <p className="text-gray-500 text-sm leading-relaxed max-w-xs font-medium">
                        A plataforma de streaming definitiva para engenheiros e entusiastas de tecnologia. Forjando o futuro da entrega de conteúdo via HLS.
                    </p>
                    <div className="flex items-center gap-4 text-gray-400">
                        <a href="#" className="hover:text-primary transition-colors"><Twitter size={20} /></a>
                        <a href="#" className="hover:text-primary transition-colors"><Github size={20} /></a>
                        <a href="#" className="hover:text-primary transition-colors"><Youtube size={20} /></a>
                    </div>
                </div>

                {/* Explorer Section */}
                <div className="space-y-6">
                    <h3 className="text-white font-bold uppercase tracking-widest text-xs">Explorar</h3>
                    <ul className="space-y-3 text-sm text-gray-400 font-medium">
                        <li><Link to="/" className="hover:text-white transition-colors">Início</Link></li>
                        <li><Link to="/torrents" className="hover:text-primary transition-colors flex items-center gap-2"><Radio size={12} />Nexus Drive</Link></li>
                        <li><Link to="/tv" className="hover:text-cyan-400 transition-colors flex items-center gap-2"><Tv size={12} />TV ao Vivo</Link></li>
                        <li><Link to="/movies" className="hover:text-white transition-colors">Filmes</Link></li>
                        <li><Link to="/series" className="hover:text-white transition-colors">Séries</Link></li>
                    </ul>
                </div>

                {/* Infrastructure Section */}
                <div className="space-y-6">
                    <h3 className="text-white font-bold uppercase tracking-widest text-xs">Infraestrutura</h3>
                    <ul className="space-y-3 text-sm text-gray-400 font-bold">
                        <li className="flex items-center gap-2 text-[10px] uppercase tracking-tighter">
                            <Zap size={14} className="text-primary" /> Transcoding: Ativo
                        </li>
                        <li className="flex items-center gap-2 text-[10px] uppercase tracking-tighter">
                            <ShieldCheck size={14} className="text-green-500" /> DRM: Proteção SF
                        </li>
                        <li className="flex items-center gap-2 text-[10px] uppercase tracking-tighter">
                            <Globe size={14} className="text-blue-400" /> CDN: Global Edge
                        </li>
                        <li className="flex items-center gap-2 text-[10px] uppercase tracking-tighter">
                            <Tv size={14} className="text-cyan-400" /> IPTV: Online
                        </li>
                    </ul>
                </div>

                {/* Newsletter Section */}
                <div className="space-y-6">
                    <h3 className="text-white font-bold uppercase tracking-widest text-xs">Mantenha o Sinal</h3>
                    <p className="text-gray-500 text-xs">Receba alertas sobre novos ativos e atualizações de sistema.</p>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <input
                            type="email"
                            placeholder="seu@email.com"
                            className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-xs text-white focus:outline-none focus:border-primary/50 flex-1"
                        />
                        <button className="bg-primary hover:bg-primary/80 text-background p-2 rounded-lg transition-colors self-start sm:self-auto">
                            <Mail size={18} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-[10px] text-gray-500 font-mono uppercase tracking-[0.14em] md:tracking-[0.2em]">
                <p>© 2026 STREAMFORGE ENTERPRISE SOLUTIONS. ALL RIGHTS RESERVED.</p>
                <div className="flex gap-4 md:gap-8">
                    <a href="#" className="hover:text-white transition-colors">Termos de Serviço</a>
                    <a href="#" className="hover:text-white transition-colors">Privacidade</a>
                </div>
            </div>
        </footer>
    );
};
