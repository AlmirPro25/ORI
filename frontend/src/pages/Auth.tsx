import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { Terminal, Mail, Lock, User as UserIcon, ArrowRight, Zap, Brain, Tv, Youtube, Globe, Ghost } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const loginSchema = z.object({
    email: z.string().email('Email inválido'),
    password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
});

const registerSchema = loginSchema.extend({
    name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
});

const FeatureItem = ({ icon: Icon, title, description, delay }: { icon: any, title: string, description: string, delay: number }) => (
    <motion.div
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay, duration: 0.6 }}
        className="flex gap-4 p-4 rounded-3xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all group"
    >
        <div className="shrink-0 w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
            <Icon size={24} />
        </div>
        <div className="space-y-1">
            <h3 className="text-sm font-black uppercase tracking-wider text-white italic">{title}</h3>
            <p className="text-[11px] text-white/40 font-medium leading-relaxed uppercase tracking-tight">{description}</p>
        </div>
    </motion.div>
);

export const AuthPage: React.FC = () => {
    const [isLogin, setIsLogin] = useState(true);
    const { login, register, isLoading, error } = useAuth();

    const { register: registerField, handleSubmit, formState: { errors: _errors } } = useForm<any>({
        resolver: zodResolver(isLogin ? loginSchema : registerSchema),
    });

    const onSubmit = async (data: any) => {
        if (isLogin) {
            await login(data);
        } else {
            await register(data);
        }
    };

    return (
        <div className="min-h-screen w-full relative flex flex-col lg:flex-row overflow-hidden bg-[#050505]">
            {/* Left Side: Showcase */}
            <div className="hidden lg:flex flex-col justify-center p-20 w-1/2 relative overflow-hidden border-r border-white/5">
                {/* Background Decor */}
                <div className="absolute top-0 left-0 w-full h-full -z-10">
                    <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[150px] animate-pulse" />
                    <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-accent/5 rounded-full blur-[120px] animate-pulse delay-1000" />
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.03]" />
                </div>

                <div className="space-y-12 max-w-xl">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-6"
                    >
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 border border-primary/20">
                            <Zap size={12} className="text-primary animate-pulse" />
                            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-primary">Sovereign Media Protocol</span>
                        </div>
                        <h1 className="text-7xl font-black text-white leading-none tracking-[-0.05em] uppercase">
                            ORION <br />
                            <span className="text-gradient-primary italic font-serif lowercase tracking-normal">enterprise</span>
                        </h1>
                        <p className="text-lg text-white/30 font-medium max-w-md italic font-serif">
                            A nova fronteira do consumo digital. Todo o conteúdo do mundo, orquestrado por inteligência artificial soberana.
                        </p>
                    </motion.div>

                    <div className="space-y-4">
                        <FeatureItem
                            icon={Youtube}
                            title="Orion YouTube Proxy"
                            description="Acesso total ao catálogo global sem anúncios, integrado diretamente ao seu player em 4K."
                            delay={0.4}
                        />
                        <FeatureItem
                            icon={Brain}
                            title="Protocolo Arconte AI"
                            description="Nossa IA minera trackers profundos e cataloga filmes automaticamente com posters HD e sinopses."
                            delay={0.5}
                        />
                        <FeatureItem
                            icon={Tv}
                            title="IPTV Ultra Sincronizado"
                            description="Canais de TV ao vivo com latência zero e guias inteligentes de programação em tempo real."
                            delay={0.6}
                        />
                        <FeatureItem
                            icon={Ghost}
                            title="Nexus Torrent Engine"
                            description="Motor de busca P2P ultra-veloz. Encontre e assista a qualquer título instantaneamente via streaming."
                            delay={0.7}
                        />
                    </div>

                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 1 }}
                        className="flex items-center gap-6 pt-6"
                    >
                        <div className="flex -space-x-3">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="w-10 h-10 rounded-full border-2 border-[#050505] bg-white/5 overflow-hidden">
                                    <img src={`https://i.pravatar.cc/100?u=${i}`} className="w-full h-full object-cover grayscale opacity-50" />
                                </div>
                            ))}
                        </div>
                        <p className="text-[10px] uppercase font-black tracking-[0.2em] text-white/20">
                            +12 Operators Online <br />
                            <span className="text-primary/40 text-[8px]">Distributed Nexus Active</span>
                        </p>
                    </motion.div>
                </div>
            </div>

            {/* Right Side: Auth Form */}
            <div className="flex-1 flex items-center justify-center p-6 relative">
                {/* Mobile Background */}
                <div className="lg:hidden absolute inset-0 -z-10">
                    <img
                        src="https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?q=80&w=3474&auto=format&fit=crop"
                        className="w-full h-full object-cover opacity-20 grayscale brightness-50"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/60 to-[#050505]" />
                </div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-full max-w-md"
                >
                    <div className="lg:hidden mb-12 text-center space-y-4">
                        <h1 className="text-5xl font-black text-white leading-none tracking-tighter uppercase">ORION</h1>
                        <p className="text-[10px] font-black tracking-[0.4em] text-primary uppercase leading-none italic">Sovereign Media</p>
                    </div>

                    <div className="relative group">
                        <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 rounded-[3rem] blur-2xl opacity-50 group-hover:opacity-100 transition-opacity duration-1000" />

                        <Card className="relative glass-card shadow-2xl p-6 md:p-8 border-white/5 rounded-[3rem] overflow-hidden bg-white/[0.02]/ backdrop-blur-3xl">
                            <CardHeader className="text-center pb-8 space-y-2">
                                <div className="mx-auto w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                                    <Globe size={24} className="text-primary" />
                                </div>
                                <CardTitle className="text-3xl font-black uppercase italic tracking-tighter text-white">
                                    {isLogin ? 'Initialize Core' : 'New Uplink Node'}
                                </CardTitle>
                                <CardDescription className="text-[10px] uppercase font-bold tracking-[0.3em] text-primary/60">
                                    Authentication Gateway v2.6
                                </CardDescription>
                            </CardHeader>

                            <CardContent className="space-y-6">
                                <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
                                    <AnimatePresence mode="wait">
                                        {!isLogin && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                className="space-y-3 overflow-hidden"
                                            >
                                                <Label className="text-[10px] uppercase tracking-[0.2em] font-black text-white/40 ml-1">Identity Tag</Label>
                                                <div className="relative group/field">
                                                    <div className="absolute inset-y-0 left-0 flex items-center pl-4 text-white/20 group-focus-within/field:text-primary transition-colors">
                                                        <UserIcon size={18} />
                                                    </div>
                                                    <Input
                                                        className="pl-12 bg-white/5 border-white/10 focus:border-primary focus:ring-primary/20 h-14 rounded-2xl text-sm font-medium transition-all"
                                                        {...registerField('name')}
                                                        placeholder="Full Operator Name"
                                                    />
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    <div className="space-y-3">
                                        <Label className="text-[10px] uppercase tracking-[0.2em] font-black text-white/40 ml-1">Uplink Credential</Label>
                                        <div className="relative group/field">
                                            <div className="absolute inset-y-0 left-0 flex items-center pl-4 text-white/20 group-focus-within/field:text-primary transition-colors">
                                                <Mail size={18} />
                                            </div>
                                            <Input
                                                className="pl-12 bg-white/5 border-white/10 focus:border-primary focus:ring-primary/20 h-14 rounded-2xl text-sm font-medium transition-all"
                                                type="email"
                                                {...registerField('email')}
                                                placeholder="operator@orion.nexus"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <Label className="text-[10px] uppercase tracking-[0.2em] font-black text-white/40 ml-1">Security Cipher</Label>
                                        <div className="relative group/field">
                                            <div className="absolute inset-y-0 left-0 flex items-center pl-4 text-white/20 group-focus-within/field:text-primary transition-colors">
                                                <Lock size={18} />
                                            </div>
                                            <Input
                                                className="pl-12 bg-white/5 border-white/10 focus:border-primary focus:ring-primary/20 h-14 rounded-2xl text-sm font-medium transition-all"
                                                type="password"
                                                {...registerField('password')}
                                                placeholder="••••••••••••"
                                            />
                                        </div>
                                    </div>

                                    {error && (
                                        <motion.div
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-[10px] font-black uppercase tracking-widest flex gap-3"
                                        >
                                            <Terminal size={16} />
                                            {error}
                                        </motion.div>
                                    )}

                                    <Button
                                        type="submit"
                                        className="w-full h-16 rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] bg-primary text-black hover:scale-[1.02] transition-all shadow-glow flex items-center justify-center gap-3"
                                        disabled={isLoading}
                                    >
                                        {isLoading ? 'Synchronizing...' : (isLogin ? 'Initialize Core Link' : 'Secure Authorization')}
                                        <ArrowRight size={18} />
                                    </Button>
                                </form>

                                <div className="text-center pt-8">
                                    <button
                                        onClick={() => setIsLogin(!isLogin)}
                                        className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 hover:text-primary transition-all"
                                    >
                                        {isLogin ? "No access node detected?" : "Already verified?"}{' '}
                                        <span className="text-white underline underline-offset-4">
                                            {isLogin ? 'Request Authorization' : 'Authenticate Local Node'}
                                        </span>
                                    </button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </motion.div>
            </div>
        </div>
    );
};
