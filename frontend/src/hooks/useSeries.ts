/**
 * 📺 USE SERIES HOOK
 * Hook para buscar e gerenciar dados de séries.
 */

import { useState, useEffect, useCallback } from 'react';
import { Series } from '@/types/series';
import SeriesService from '@/services/api/series.service';

/**
 * Hook para lista de séries
 */
export const useSeriesList = () => {
    const [series, setSeries] = useState<Series[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchSeries = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const data = await SeriesService.getAll();
            setSeries(data);
            setError(null);
        } catch (err: any) {
            if (!silent) setError(err.message || 'Failed to fetch series');
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSeries(false);
        const interval = setInterval(() => fetchSeries(true), 10000);
        return () => clearInterval(interval);
    }, [fetchSeries]);

    return { series, loading, error, refresh: fetchSeries };
};

/**
 * Hook para detalhes de uma série
 */
export const useSeriesDetails = (id: string | undefined) => {
    const [series, setSeries] = useState<Series | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchDetails = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        try {
            const data = await SeriesService.getById(id);
            setSeries(data);
            setError(null);
        } catch (err: any) {
            setError(err.message || 'Failed to fetch series details');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchDetails();
    }, [fetchDetails]);

    return { series, loading, error, refresh: fetchDetails };
};
