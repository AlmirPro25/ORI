import axios from 'axios';
import { Series, Season, Episode, NextEpisodeResponse, EpisodeMaterializationResponse, SeriesDownloadResponse, VideoSelectionTelemetrySnapshot } from '@/types/series';
import { API_BASE_URL } from '@/lib/endpoints';

const API_BASE = `${API_BASE_URL}/api/v1`;

const api = axios.create({
    baseURL: API_BASE,
    headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export const SeriesService = {
    async getAll(): Promise<Series[]> {
        const { data } = await api.get('/series');
        return data;
    },

    async getById(id: string): Promise<Series> {
        const { data } = await api.get(`/series/${id}`);
        return data;
    },

    async create(series: Partial<Series>): Promise<Series> {
        const { data } = await api.post('/series', series);
        return data;
    },

    async update(id: string, series: Partial<Series>): Promise<Series> {
        const { data } = await api.put(`/series/${id}`, series);
        return data;
    },

    async delete(id: string): Promise<void> {
        await api.delete(`/series/${id}`);
    },

    async getSeasons(seriesId: string): Promise<Season[]> {
        const { data } = await api.get(`/series/${seriesId}/seasons`);
        return data;
    },

    async getSeasonEpisodes(seriesId: string, seasonNumber: number): Promise<Episode[]> {
        const { data } = await api.get(`/series/${seriesId}/seasons/${seasonNumber}/episodes`);
        return data;
    },

    async getEpisode(id: string): Promise<Episode> {
        const { data } = await api.get(`/series/episodes/${id}`);
        return data;
    },

    async getNextEpisode(id: string): Promise<NextEpisodeResponse | null> {
        const { data } = await api.get(`/series/episodes/${id}/next`);
        return data;
    },

    async getPreviousEpisode(id: string): Promise<NextEpisodeResponse | null> {
        const { data } = await api.get(`/series/episodes/${id}/previous`);
        return data;
    },

    async createEpisode(seriesId: string, episode: Partial<Episode>): Promise<Episode> {
        const { data } = await api.post(`/series/${seriesId}/episodes`, episode);
        return data;
    },

    async downloadEpisode(episodeId: string): Promise<void> {
        await api.post(`/series/episodes/${episodeId}/download`);
    },

    async materializeEpisodeFromAddon(episodeId: string, payload: {
        magnetURI?: string;
        infoHash?: string;
        fileIndex?: number;
        filename?: string;
        title?: string;
        sources?: string[];
    }): Promise<EpisodeMaterializationResponse> {
        const { data } = await api.post(`/series/episodes/${episodeId}/materialize`, payload);
        return data;
    },

    async downloadSeason(seriesId: string, seasonNumber: number): Promise<SeriesDownloadResponse> {
        const { data } = await api.post(`/series/${seriesId}/seasons/${seasonNumber}/download`);
        return data;
    },

    async downloadSeries(seriesId: string): Promise<SeriesDownloadResponse> {
        const { data } = await api.post(`/series/${seriesId}/download`);
        return data;
    },

    async getVideoSelectionTelemetry(videoId: string): Promise<VideoSelectionTelemetrySnapshot> {
        const { data } = await api.get(`/telemetry/video-selection?videoId=${encodeURIComponent(videoId)}&limit=5`);
        return data;
    },

    async ingest(data: { magnetLink?: string; title?: string; filename?: string }): Promise<any> {
        const response = await api.post('/series/ingest', data);
        return response.data;
    },

    async explore(magnetLink: string): Promise<any> {
        const { data } = await api.get(`/series/torrent/explore?magnetLink=${encodeURIComponent(magnetLink)}`);
        return data;
    },

    async bulkIngest(seriesId: string, magnetLink: string, episodes: any[]): Promise<any> {
        const { data } = await api.post('/series/bulk-ingest', { seriesId, magnetLink, episodes });
        return data;
    },
};

export default SeriesService;
