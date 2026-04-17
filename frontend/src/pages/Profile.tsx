import React, { useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { motion } from 'framer-motion';
import { User, Shield, Zap, Mail, Key, Edit, Save, LogOut, HardDrive, Cpu, Activity, Cloud, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export const ProfilePage: React.FC = () => {
    const { user, logout } = useAuthStore();
    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState(user?.name || '');
    const [email, setEmail] = useState(user?.email || '');

    const handleSave = () => {
        // Here you would typically call an API to update the user profile
        setIsEditing(false);
        // Toast notification (conceptual)
        alert('Perfil atualizado com sucesso (Simulação)');
    };

    // Mock Stats for demonstration
    const stats = [
        { label: 'Nível de Acesso', value: user?.role === 'ADMIN' ? 'ARCHITECT' : 'OPERATOR', icon: Shield, color: 'text-yellow-400' },
        { label: 'Dados Trafegados', value: '42.8 GB', icon: Activity, color: 'text-cyan-400' },
        { label: 'Torrents Semeados', value: '1,337', icon: Cloud, color: 'text-green-400' },
        { label: 'Créditos Nexus', value: '∞', icon: Zap, color: 'text-purple-400' },
    ];

    if (!user) return null;

    return (
        <div className="min-h-screen bg-background text-white pt-24 pb-12 relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-primary/10 to-transparent -z-10" />
            <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-cyan-500/5 rounded-full blur-[100px] animate-pulse" />
            <div className="absolute top-40 -left-40 w-[600px] h-[600px] bg-purple-500/5 rounded-full blur-[100px] animate-pulse delay-1000" />

            <div className="container mx-auto px-4 sm:px-6 max-w-5xl">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid grid-cols-1 lg:grid-cols-3 gap-8"
                >
                    {/* Left Column: Avatar & Basic Info */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="bg-white/5 border border-white/10 rounded-[2rem] p-5 sm:p-8 text-center relative overflow-hidden backdrop-blur-xl shadow-2xl">
                            <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />

                            <div className="relative w-24 h-24 sm:w-32 sm:h-32 mx-auto mb-6 group cursor-pointer">
                                <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500 to-purple-500 rounded-full blur-xl opacity-50 group-hover:opacity-80 transition-opacity" />
                                <div className="relative w-full h-full bg-black rounded-full border-4 border-white/10 flex items-center justify-center text-4xl font-black text-white overflow-hidden shadow-inner">
                                    {user.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="absolute bottom-0 right-0 p-2 bg-primary rounded-full border-4 border-black text-black shadow-lg">
                                    <Edit size={14} />
                                </div>
                            </div>

                            <h2 className="text-xl sm:text-2xl font-black uppercase italic tracking-tight mb-1">{user.name}</h2>
                            <p className="text-white/40 text-sm font-mono mb-6">{user.email}</p>

                            <div className="flex justify-center gap-3 mb-8">
                                <span className={cn(
                                    "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
                                    user.role === 'ADMIN'
                                        ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-400"
                                        : "bg-cyan-500/10 border-cyan-500/20 text-cyan-400"
                                )}>
                                    {user.role}
                                </span>
                                <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-green-500/10 border border-green-500/20 text-green-400 flex items-center gap-1">
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                                    Online
                                </span>
                            </div>

                            <Button
                                onClick={logout}
                                variant="outline"
                                className="w-full border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/40 transition-all font-bold uppercase tracking-widest text-xs h-12 rounded-xl"
                            >
                                <LogOut size={16} className="mr-2" /> Desconectar
                            </Button>
                        </div>

                        {/* Quick Stats Card */}
                        <div className="bg-white/5 border border-white/10 rounded-[2rem] p-5 sm:p-6 backdrop-blur-xl">
                            <h3 className="text-xs font-black uppercase tracking-widest text-white/40 mb-6 flex items-center gap-2">
                                <HardDrive size={14} /> Estatísticas do Sistema
                            </h3>
                            <div className="space-y-6">
                                {stats.map((stat, i) => (
                                    <div key={i} className="flex items-center justify-between group">
                                        <div className="flex items-center gap-3">
                                            <div className={cn("p-2 rounded-lg bg-white/5 group-hover:bg-white/10 transition-colors", stat.color)}>
                                                <stat.icon size={18} />
                                            </div>
                                            <span className="text-sm font-medium text-white/60">{stat.label}</span>
                                        </div>
                                        <span className="font-mono font-bold text-white group-hover:text-primary transition-colors">{stat.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Edit Profile & Settings */}
                    <div className="lg:col-span-2 space-y-8">
                        <div className="bg-white/5 border border-white/10 rounded-[2rem] p-5 sm:p-8 md:p-10 backdrop-blur-xl relative overflow-hidden">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                                <div>
                                    <h2 className="text-2xl sm:text-3xl font-black uppercase italic tracking-tight flex items-center gap-3">
                                        Configurações <span className="text-primary">Nexus</span>
                                    </h2>
                                    <p className="text-white/40 text-sm mt-1">Gerencie suas credenciais e preferências de sistema.</p>
                                </div>
                                <Button
                                    onClick={() => isEditing ? handleSave() : setIsEditing(true)}
                                    className={cn(
                                        "h-12 px-6 rounded-xl font-bold uppercase tracking-widest text-xs transition-all border w-full sm:w-auto",
                                        isEditing
                                            ? "bg-green-500 text-black hover:bg-green-400 border-green-500"
                                            : "bg-white/5 hover:bg-white/10 text-white border-white/10"
                                    )}
                                >
                                    {isEditing ? (
                                        <><Save size={16} className="mr-2" /> Salvar Alterações</>
                                    ) : (
                                        <><Edit size={16} className="mr-2" /> Editar Perfil</>
                                    )}
                                </Button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-2">
                                    <label className="text-xs font-black uppercase tracking-widest text-white/40 ml-1">Nome de Operador</label>
                                    <div className="relative group">
                                        <User className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-primary transition-colors" size={18} />
                                        <Input
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            disabled={!isEditing}
                                            className="pl-12 h-12 sm:h-14 bg-black/20 border-white/10 rounded-xl text-white disabled:opacity-50 disabled:cursor-not-allowed focus:border-primary/50 transition-all font-medium"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-black uppercase tracking-widest text-white/40 ml-1">Email Registrado</label>
                                    <div className="relative group">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-primary transition-colors" size={18} />
                                        <Input
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            disabled={!isEditing}
                                            className="pl-12 h-12 sm:h-14 bg-black/20 border-white/10 rounded-xl text-white disabled:opacity-50 disabled:cursor-not-allowed focus:border-primary/50 transition-all font-medium"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-black uppercase tracking-widest text-white/40 ml-1">Chave de Acesso (Senha)</label>
                                    <div className="relative group">
                                        <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-primary transition-colors" size={18} />
                                        <Input
                                            type="password"
                                            value="********"
                                            disabled
                                            className="pl-12 h-12 sm:h-14 bg-black/20 border-white/10 rounded-xl text-white disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                                        />
                                        <Button variant="link" className="absolute right-2 top-1/2 -translate-y-1/2 text-primary text-xs font-bold uppercase tracking-wider h-auto p-0 hover:text-white">Alterar</Button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-black uppercase tracking-widest text-white/40 ml-1">ID do Nó (User ID)</label>
                                    <div className="relative">
                                        <Cpu className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
                                        <Input
                                            value={user.id}
                                            disabled
                                            className="pl-12 h-12 sm:h-14 bg-black/20 border-white/10 rounded-xl text-white/50 font-mono text-xs opacity-70"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Recent Activity Mockup */}
                        <div className="bg-white/5 border border-white/10 rounded-[2rem] p-5 sm:p-8 md:p-10 backdrop-blur-xl">
                            <h3 className="text-lg sm:text-xl font-black uppercase italic tracking-tight mb-6 flex items-center gap-3">
                                <Activity className="text-primary" /> Atividade Recente
                            </h3>
                            <div className="space-y-4">
                                {[1, 2, 3].map((_, i) => (
                                    <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors border border-transparent hover:border-white/10 group cursor-pointer">
                                        <div className="w-12 h-12 rounded-lg bg-black/40 flex items-center justify-center text-white/40 group-hover:text-primary transition-colors">
                                            <Play size={20} fill="currentColor" />
                                        </div>
                                        <div className="flex-1">
                                            <h4 className="text-sm font-bold text-white group-hover:text-primary transition-colors">Iniciou stream de "Cyberpunk: Edgerunners"</h4>
                                            <p className="text-xs text-white/40 font-mono mt-1">HÁ {i + 1} HORAS • SERVIDOR US-EAST-1</p>
                                        </div>
                                        <div className="px-3 py-1 rounded-full bg-green-500/10 text-green-400 text-[10px] font-black uppercase tracking-widest border border-green-500/20">
                                            Completo
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
};
