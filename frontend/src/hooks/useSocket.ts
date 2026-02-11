import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

const BACKEND_URL = 'http://localhost:3000';
let socketInstance: Socket | null = null;

/**
 * Hook para gerenciar uma conexão global de Socket.IO
 */
export const useSocket = () => {
    if (!socketInstance) {
        socketInstance = io(BACKEND_URL);
    }

    return socketInstance;
};

/**
 * Hook para tracking de visualização em tempo real (para o Governor)
 */
export const useLiveWatchTracking = (userId: string | undefined, episodeId: string | null) => {
    const socket = useSocket();
    const isTracking = useRef(false);

    useEffect(() => {
        if (userId && episodeId && !isTracking.current) {
            socket.emit('watch:start', { userId, episodeId });
            isTracking.current = true;
            console.log('👁️ [Governor] Live tracking started');
        }

        return () => {
            if (isTracking.current) {
                socket.emit('watch:stop');
                isTracking.current = false;
                console.log('👁️ [Governor] Live tracking stopped');
            }
        };
    }, [userId, episodeId, socket]);
};
