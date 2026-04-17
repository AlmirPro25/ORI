/**
 * 🎬 USE AUTO NEXT HOOK
 * Hook para reprodução contínua de episódios.
 * Gerencia countdown, auto-play e auto-download do próximo episódio.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Episode } from '@/types/series';
import SeriesService from '@/services/api/series.service';

const AUTO_NEXT_COUNTDOWN = parseInt((import.meta as any).env?.VITE_AUTO_NEXT_COUNTDOWN || '10', 10);

export const useAutoNext = (currentEpisodeId: string | null) => {
    const [nextEpisode, setNextEpisode] = useState<Episode | null>(null);
    const [prevEpisode, setPrevEpisode] = useState<Episode | null>(null);
    const [countdown, setCountdown] = useState(AUTO_NEXT_COUNTDOWN);
    const [autoPlayEnabled, setAutoPlayEnabled] = useState(true);
    const [showOverlay, setShowOverlay] = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Buscar episódios adjacentes
    useEffect(() => {
        if (!currentEpisodeId) return;

        SeriesService.getNextEpisode(currentEpisodeId)
            .then(ep => setNextEpisode(ep))
            .catch(() => setNextEpisode(null));

        SeriesService.getPreviousEpisode(currentEpisodeId)
            .then(ep => setPrevEpisode(ep))
            .catch(() => setPrevEpisode(null));
    }, [currentEpisodeId]);

    /**
     * Inicia o countdown para o auto-play
     */
    const startCountdown = useCallback(() => {
        setShowOverlay(true);
        setCountdown(AUTO_NEXT_COUNTDOWN);

        // Limpar intervalo anterior
        if (intervalRef.current) clearInterval(intervalRef.current);

        let timer = AUTO_NEXT_COUNTDOWN;
        intervalRef.current = setInterval(() => {
            timer--;
            setCountdown(timer);

            if (timer <= 0) {
                if (intervalRef.current) clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        }, 1000);
    }, []);

    /**
     * Navegar para o próximo episódio
     */
    const playNext = useCallback(() => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        setShowOverlay(false);

        if (nextEpisode) {
            // Navegar para o player do episódio
            window.location.href = `/series/episode/${nextEpisode.id}`;
        }
    }, [nextEpisode]);

    /**
     * Navegar para o episódio anterior
     */
    const playPrevious = useCallback(() => {
        if (prevEpisode) {
            window.location.href = `/series/episode/${prevEpisode.id}`;
        }
    }, [prevEpisode]);

    /**
     * Cancelar auto-play
     */
    const cancelAutoPlay = useCallback(() => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        setAutoPlayEnabled(false);
        setShowOverlay(false);
        setCountdown(0);
    }, []);

    // Auto-play quando countdown chega a zero
    useEffect(() => {
        if (countdown <= 0 && autoPlayEnabled && showOverlay && nextEpisode?.status === 'READY') {
            playNext();
        }
    }, [countdown, autoPlayEnabled, showOverlay, nextEpisode, playNext]);

    // Auto-download do próximo episódio se não estiver pronto
    useEffect(() => {
        if (nextEpisode && nextEpisode.status === 'NOT_DOWNLOADED' && nextEpisode.magnetLink) {
            SeriesService.downloadEpisode(nextEpisode.id).catch(console.error);
        }
    }, [nextEpisode]);

    // Cleanup
    useEffect(() => {
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, []);

    return {
        nextEpisode,
        prevEpisode,
        countdown,
        autoPlayEnabled,
        showOverlay,
        startCountdown,
        playNext,
        playPrevious,
        cancelAutoPlay,
        setAutoPlayEnabled,
    };
};
