/**
 * BADGES DE INFORMAÇÕES DE MÍDIA
 * Exibe informações sobre áudio e legendas disponíveis
 */

import React from 'react';

interface MediaBadge {
    label: string;
    type: 'success' | 'info' | 'default' | 'warning';
}

interface MediaBadgesProps {
    badges?: MediaBadge[];
    audioTracks?: string;
    subtitleTracks?: string;
    hasPortuguese?: boolean;
    hasDubbed?: boolean;
}

export const MediaBadges: React.FC<MediaBadgesProps> = ({
    badges,
    audioTracks,
    subtitleTracks,
    hasPortuguese,
    hasDubbed
}) => {
    // Se não tiver badges prontas, gerar a partir dos dados
    const displayBadges = badges || generateBadges(audioTracks, subtitleTracks, hasPortuguese, hasDubbed);

    if (displayBadges.length === 0) return null;

    return (
        <div className="flex flex-wrap gap-1.5 mt-2">
            {displayBadges.map((badge, index) => (
                <span
                    key={index}
                    className={`
                        px-2 py-0.5 rounded-full text-xs font-medium
                        ${getBadgeStyles(badge.type)}
                    `}
                >
                    {badge.label}
                </span>
            ))}
        </div>
    );
};

function generateBadges(
    audioTracks?: string,
    subtitleTracks?: string,
    hasPortuguese?: boolean,
    hasDubbed?: boolean
): MediaBadge[] {
    const badges: MediaBadge[] = [];

    if (hasDubbed) {
        badges.push({ label: '🎙️ Dublado PT-BR', type: 'success' });
    } else if (hasPortuguese) {
        badges.push({ label: '📝 Legendas PT-BR', type: 'info' });
    }

    // Contar áudios
    if (audioTracks) {
        try {
            const tracks = JSON.parse(audioTracks);
            const languages = [...new Set(tracks.map((t: any) => t.language))];
            if (languages.length > 1) {
                badges.push({ label: `🔊 ${languages.length} áudios`, type: 'default' });
            }
        } catch (e) {
            // Ignorar erro de parse
        }
    }

    // Contar legendas
    if (subtitleTracks) {
        try {
            const tracks = JSON.parse(subtitleTracks);
            if (tracks.length > 0) {
                badges.push({ label: `📝 ${tracks.length} legendas`, type: 'default' });
            }
        } catch (e) {
            // Ignorar erro de parse
        }
    }

    return badges;
}

function getBadgeStyles(type: string): string {
    switch (type) {
        case 'success':
            return 'bg-green-500/20 text-green-300 border border-green-500/30';
        case 'info':
            return 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
        case 'warning':
            return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30';
        default:
            return 'bg-gray-500/20 text-gray-300 border border-gray-500/30';
    }
}

/**
 * Componente detalhado para exibir todas as faixas
 */
interface MediaTracksDetailProps {
    audioTracks?: string;
    subtitleTracks?: string;
}

export const MediaTracksDetail: React.FC<MediaTracksDetailProps> = ({
    audioTracks,
    subtitleTracks
}) => {
    let audio: any[] = [];
    let subs: any[] = [];

    try {
        if (audioTracks) audio = JSON.parse(audioTracks);
        if (subtitleTracks) subs = JSON.parse(subtitleTracks);
    } catch (e) {
        return null;
    }

    if (audio.length === 0 && subs.length === 0) return null;

    return (
        <div className="space-y-3 text-sm">
            {audio.length > 0 && (
                <div>
                    <h4 className="font-semibold text-gray-300 mb-2">🔊 Faixas de Áudio</h4>
                    <div className="space-y-1">
                        {audio.map((track, i) => (
                            <div key={i} className="flex items-center gap-2 text-gray-400">
                                <span className="w-16 text-xs bg-gray-700 px-2 py-0.5 rounded">
                                    {track.language}
                                </span>
                                <span className="text-xs">{track.codec}</span>
                                <span className="text-xs">{track.channels}ch</span>
                                {track.title && (
                                    <span className="text-xs text-gray-500">({track.title})</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {subs.length > 0 && (
                <div>
                    <h4 className="font-semibold text-gray-300 mb-2">📝 Legendas</h4>
                    <div className="space-y-1">
                        {subs.map((track, i) => (
                            <div key={i} className="flex items-center gap-2 text-gray-400">
                                <span className="w-16 text-xs bg-gray-700 px-2 py-0.5 rounded">
                                    {track.language}
                                </span>
                                <span className="text-xs">{track.codec}</span>
                                {track.title && (
                                    <span className="text-xs text-gray-500">({track.title})</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
