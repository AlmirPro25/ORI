/**
 * 📺 SERIES API SERVICE
 * Comunicação com o backend para gerenciamento de séries.
 */

import axios from 'axios';
import { Series, Season, Episode, NextEpisodeResponse } from '@/types/series';

const API_BASE = 'http://localhost:3000/api/v1';

const api = axios.create({
    baseURL: API_BASE,
    headers: { 'Content-Type': 'application/json' },
});

// Inject auth token
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export const SeriesService = {
    // ==========================================
    // 📺 SÉRIES
    // ==========================================

    /** Lista todas as séries */
    async getAll(): Promise<Series[]> {
        const { data } = await api.get('/series');
        return data;
    },

    /** Detalhes de uma série com temporadas e episódios */
    async getById(id: string): Promise<Series> {
        const { data } = await api.get(`/series/${id}`);
        return data;
    },

    /** Cria uma nova série */
    async create(series: Partial<Series>): Promise<Series> {
        const { data } = await api.post('/series', series);
        return data;
    },

    /** Atualiza uma série */
    async update(id: string, series: Partial<Series>): Promise<Series> {
        const { data } = await api.put(`/series/${id}`, series);
        return data;
    },

    /** Deleta uma série */
    async delete(id: string): Promise<void> {
        await api.delete(`/series/${id}`);
    },

    // ==========================================
    // 📅 TEMPORADAS
    // ==========================================

    /** Lista temporadas */
    async getSeasons(seriesId: string): Promise<Season[]> {
        const { data } = await api.get(`/series/${seriesId}/seasons`);
        return data;
    },

    // ==========================================
    // 🎬 EPISÓDIOS
    // ==========================================

    /** Lista episódios de uma temporada */
    async getSeasonEpisodes(seriesId: string, seasonNumber: number): Promise<Episode[]> {
        const { data } = await api.get(`/series/${seriesId}/seasons/${seasonNumber}/episodes`);
        return data;
    },

    /** Detalhes de um episódio */
    async getEpisode(id: string): Promise<Episode> {
        const { data } = await api.get(`/series/episodes/${id}`);
        return data;
    },

    /** Próximo episódio */
    async getNextEpisode(id: string): Promise<NextEpisodeResponse | null> {
        const { data } = await api.get(`/series/episodes/${id}/next`);
        return data;
    },

    /** Episódio anterior */
    async getPreviousEpisode(id: string): Promise<NextEpisodeResponse | null> {
        const { data } = await api.get(`/series/episodes/${id}/previous`);
        return data;
    },

    /** Cria episódios em uma série */
    async createEpisode(seriesId: string, episode: Partial<Episode>): Promise<Episode> {
        const { data } = await api.post(`/series/${seriesId}/episodes`, episode);
        return data;
    },

    // ==========================================
    // 📥 DOWNLOADS
    // ==========================================

    /** Download episódio */
    async downloadEpisode(episodeId: string): Promise<void> {
        await api.post(`/series/episodes/${episodeId}/download`);
    },

    /** Download temporada */
    async downloadSeason(seriesId: string, seasonNumber: number): Promise<void> {
        await api.post(`/series/${seriesId}/seasons/${seasonNumber}/download`);
    },

    /** Download série completa */
    async downloadSeries(seriesId: string): Promise<void> {
        await api.post(`/series/${seriesId}/download`);
    },

    // ==========================================
    // 🤖 INGESTÃO
    // ==========================================

    /** Ingestão inteligente */
    async ingest(data: { magnetLink?: string; title?: string; filename?: string }): Promise<any> {
        const response = await api.post('/series/ingest', data);
        return response.data;
    },

    /** Explora um torrent */
    async explore(magnetLink: string): Promise<any> {
        const { data } = await api.get(`/series/torrent/explore?magnetLink=${encodeURIComponent(magnetLink)}`);
        return data;
    },

    /** Ingestão em massa */
    async bulkIngest(seriesId: string, magnetLink: string, episodes: any[]): Promise<any> {
        const { data } = await api.post('/series/bulk-ingest', { seriesId, magnetLink, episodes });
        return data;
    },
};

export default SeriesService;
