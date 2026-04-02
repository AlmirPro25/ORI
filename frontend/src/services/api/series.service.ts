import axios from 'axios';
import { Series, Season, Episode, NextEpisodeResponse } from '@/types/series';

const API_BASE = 'http://localhost:3000/api/v1';

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
    }): Promise<{ status: string; videoId: string; position: number; message: string }> {
        const { data } = await api.post(`/series/episodes/${episodeId}/materialize`, payload);
        return data;
    },

    async downloadSeason(seriesId: string, seasonNumber: number): Promise<void> {
        await api.post(`/series/${seriesId}/seasons/${seasonNumber}/download`);
    },

    async downloadSeries(seriesId: string): Promise<void> {
        await api.post(`/series/${seriesId}/download`);
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
