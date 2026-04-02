import React from 'react';
import { Baby, Home, Lock, Shield, Users } from 'lucide-react';
import { useHouseholdProfileStore, HouseholdProfile } from '@/stores/householdProfile.store';

const OPTIONS: Array<{
    id: HouseholdProfile;
    label: string;
    hint: string;
    icon: React.ReactNode;
}> = [
    { id: 'house', label: 'Casa', hint: 'Mistura inteligente', icon: <Home size={16} /> },
    { id: 'kids', label: 'Infantil', hint: 'Mais seguro e leve', icon: <Baby size={16} /> },
    { id: 'family', label: 'Família', hint: 'PT-BR para todos', icon: <Users size={16} /> },
    { id: 'adult', label: 'Adulto', hint: 'Catálogo mais maduro', icon: <Shield size={16} /> },
];

export const HouseholdProfileSelector: React.FC = () => {
    const { profile, setProfile, verifyPin } = useHouseholdProfileStore();
    const [pinInput, setPinInput] = React.useState('');
    const [pendingProfile, setPendingProfile] = React.useState<HouseholdProfile | null>(null);
    const [pinError, setPinError] = React.useState('');

    const requestProfile = (nextProfile: HouseholdProfile) => {
        if (nextProfile === 'adult' && profile !== 'adult') {
            setPendingProfile(nextProfile);
            setPinInput('');
            setPinError('');
            return;
        }

        setProfile(nextProfile);
    };

    const unlockAdult = () => {
        if (!pendingProfile) return;
        if (!verifyPin(pinInput)) {
            setPinError('PIN incorreto');
            return;
        }

        setProfile(pendingProfile);
        setPendingProfile(null);
        setPinInput('');
        setPinError('');
    };

    return (
        <div className="px-6 md:px-16 pt-8 space-y-4">
            <div className="flex flex-wrap gap-3">
                {OPTIONS.map((option) => {
                    const active = option.id === profile;
                    const locked = option.id === 'adult' && profile !== 'adult';
                    return (
                        <button
                            key={option.id}
                            onClick={() => requestProfile(option.id)}
                            className={`group flex items-center gap-3 rounded-2xl border px-4 py-3 backdrop-blur-xl transition-all ${
                                active
                                    ? 'border-primary/50 bg-primary/15 text-white shadow-[0_0_30px_-12px_rgba(56,189,248,0.8)]'
                                    : 'border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:bg-white/10'
                            }`}
                        >
                            <span className={active ? 'text-primary' : 'text-white/50'}>{option.icon}</span>
                            <span className="text-left">
                                <span className="block text-[11px] font-black uppercase tracking-[0.2em]">
                                    {option.label} {locked ? <Lock size={11} className="inline ml-1" /> : null}
                                </span>
                                <span className="block text-[10px] text-white/40">{option.hint}</span>
                            </span>
                        </button>
                    );
                })}
            </div>

            {pendingProfile === 'adult' && (
                <div className="max-w-md rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="rounded-2xl bg-primary/15 p-3 text-primary">
                            <Lock size={16} />
                        </div>
                        <div>
                            <p className="text-sm font-black uppercase tracking-[0.2em] text-white">Perfil adulto bloqueado</p>
                            <p className="text-xs text-white/40">Use o PIN para sair do modo infantil/família.</p>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <input
                            type="password"
                            value={pinInput}
                            onChange={(e) => setPinInput(e.target.value)}
                            placeholder="PIN"
                            className="flex-1 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-primary/50"
                        />
                        <button
                            onClick={unlockAdult}
                            className="rounded-2xl bg-primary px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-black transition hover:bg-primary/90"
                        >
                            Liberar
                        </button>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">PIN padrão local: 1234</p>
                        {pinError ? <p className="text-[10px] uppercase tracking-[0.2em] text-red-400">{pinError}</p> : null}
                    </div>
                </div>
            )}
        </div>
    );
};
