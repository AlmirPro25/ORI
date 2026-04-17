import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '@/lib/endpoints';

let socketInstance: Socket | null = null;

/**
 * Hook para gerenciar uma conexão global de Socket.IO
 */
export const useSocket = () => {
    if (!socketInstance) {
        socketInstance = io(SOCKET_URL);
    }

    return socketInstance;
};

/**
 * Hook para tracking de visualização em tempo real.
 * Mantém a sessão viva no backend para evitar viewers fantasmas.
 */
export const useLiveWatchTracking = (userId: string | undefined, episodeId: string | null) => {
    const socket = useSocket();
    const isTracking = useRef(false);
    const heartbeatIntervalRef = useRef<number | null>(null);

    useEffect(() => {
        if (userId && episodeId && !isTracking.current) {
            socket.emit('watch:start', {
                userId,
                episodeId,
                videoId: episodeId,
                source: 'LOCAL',
            });
            isTracking.current = true;
            console.log('[Governor] Live tracking started');

            heartbeatIntervalRef.current = window.setInterval(() => {
                socket.emit('watch:heartbeat', {
                    userId,
                    episodeId,
                    videoId: episodeId,
                    source: 'LOCAL',
                    playbackState: 'playing',
                });
            }, 15000);
        }

        return () => {
            if (heartbeatIntervalRef.current) {
                window.clearInterval(heartbeatIntervalRef.current);
                heartbeatIntervalRef.current = null;
            }

            if (isTracking.current) {
                socket.emit('watch:stop');
                isTracking.current = false;
                console.log('[Governor] Live tracking stopped');
            }
        };
    }, [userId, episodeId, socket]);
};
