/**
 * 📺 SERIES TYPES
 * Tipos compartilhados para o sistema de séries.
 */

export type EpisodeStatus = 'NOT_DOWNLOADED' | 'QUEUED' | 'DOWNLOADING' | 'PROCESSING' | 'READY' | 'FAILED';
export type SeriesStatus = 'ONGOING' | 'ENDED' | 'CANCELED';

export interface Series {
    id: string;
    title: string;
    overview?: string | null;
    poster?: string | null;
    backdrop?: string | null;
    totalSeasons: number;
    totalEpisodes: number;
    tmdbId?: number | null;
    imdbId?: string | null;
    status: SeriesStatus;
    firstAirDate?: string | null;
    lastAirDate?: string | null;
    genres?: string | null;
    createdAt: string;
    updatedAt: string;
    // Enriched fields from API
    readyEpisodes?: number;
    progress?: number;
    seasons?: Season[];
    _count?: {
        episodes: number;
        seasons: number;
    };
}

export interface Season {
    id: string;
    seriesId: string;
    seasonNumber: number;
    name?: string | null;
    overview?: string | null;
    poster?: string | null;
    episodeCount: number;
    airDate?: string | null;
    createdAt: string;
    episodes?: Episode[];
    _count?: {
        episodes: number;
    };
}

export interface Episode {
    id: string;
    seriesId: string;
    seasonId: string;
    seasonNumber: number;
    episodeNumber: number;
    title: string;
    overview?: string | null;
    duration?: number | null;
    airDate?: string | null;
    stillPath?: string | null;
    videoId?: string | null;
    video?: {
        id: string;
        hlsPath?: string | null;
        storageKey?: string | null;
        status: string;
    } | null;
    status: EpisodeStatus;
    magnetLink?: string | null;
    fileSize?: number | null;
    quality?: string | null;
    createdAt: string;
    updatedAt: string;
    series?: Series;
}

export interface NextEpisodeResponse extends Episode {
    series?: Series;
}
