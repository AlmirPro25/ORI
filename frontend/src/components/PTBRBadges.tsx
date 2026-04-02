import { Flag, Volume2, FileText, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PTBRBadgesProps {
    title: string;
    className?: string;
}

// Release groups brasileiros
const BR_RELEASE_GROUPS: Record<string, { quality: string; specialty: string; color: string }> = {
    'COMANDO': { quality: 'high', specialty: 'Dual Audio', color: 'emerald' },
    'LAPUMiA': { quality: 'high', specialty: 'Premium', color: 'violet' },
    'VAMOSTORRENT': { quality: 'medium', specialty: 'Nacional', color: 'blue' },
    'BludV': { quality: 'medium', specialty: 'Clássicos', color: 'amber' },
    'BLUDRAGON': { quality: 'high', specialty: 'Anime', color: 'rose' },
    'QUALITYTV': { quality: 'high', specialty: 'Séries', color: 'cyan' },
    'MAKINGOFF': { quality: 'high', specialty: 'Cinema', color: 'purple' }
};

export function PTBRBadges({ title, className }: PTBRBadgesProps) {
    // Detectar áudio PT-BR
    const hasPTBRAudio = /\b(DUBLADO|DUB|DUAL|PT-BR|PT\.BR|PTBR|BRAZILIAN|BRASIL|NACIONAL|PORTUGUESE)\b/i.test(title);
    
    // Detectar legendas PT-BR
    const hasPTBRSubs = /\b(LEG\s*PT|LEGENDA|SUB\s*PT|LEGENDADO)\b/i.test(title);
    
    // Detectar release group brasileiro
    let releaseGroup: { name: string; info: typeof BR_RELEASE_GROUPS[string] } | null = null;
    for (const [group, info] of Object.entries(BR_RELEASE_GROUPS)) {
        if (new RegExp(`\\b${group}\\b`, 'i').test(title)) {
            releaseGroup = { name: group, info };
            break;
        }
    }
    
    // Se não tem nada PT-BR, não renderiza
    if (!hasPTBRAudio && !hasPTBRSubs && !releaseGroup) {
        return null;
    }
    
    return (
        <div className={cn("flex flex-wrap gap-2", className)}>
            {/* Badge de Áudio PT-BR */}
            {hasPTBRAudio && (
                <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-green-500/20 text-green-300 border border-green-500/30 flex items-center gap-1.5 shadow-lg animate-pulse-subtle">
                    <Flag size={12} className="fill-green-300" />
                    🇧🇷 DUBLADO
                </span>
            )}
            
            {/* Badge de Dual Audio */}
            {/\b(DUAL|MULTI)\b/i.test(title) && (
                <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1.5">
                    <Volume2 size={12} />
                    DUAL ÁUDIO
                </span>
            )}
            
            {/* Badge de Legendas PT-BR */}
            {hasPTBRSubs && !hasPTBRAudio && (
                <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 flex items-center gap-1.5">
                    <FileText size={12} />
                    LEG PT-BR
                </span>
            )}
            
            {/* Badge de Release Group Brasileiro */}
            {releaseGroup && (
                <span 
                    className={cn(
                        "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase flex items-center gap-1.5 shadow-lg",
                        `bg-${releaseGroup.info.color}-500/20 text-${releaseGroup.info.color}-300 border border-${releaseGroup.info.color}-500/30`
                    )}
                    title={releaseGroup.info.specialty}
                >
                    <Star size={12} className={`fill-${releaseGroup.info.color}-300`} />
                    {releaseGroup.name}
                </span>
            )}
        </div>
    );
}
