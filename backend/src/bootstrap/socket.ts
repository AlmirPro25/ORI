/**
 * 🏗️ BOOTSTRAP: Socket.IO Event Registration
 * Separa a lógica de eventos de socket do server principal.
 */
import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { DownloadGovernor } from '../services/download-governor';
import { ConsumptionAnalytics } from '../services/consumption-analytics';

const prisma = new PrismaClient();

export function registerSocketEvents(io: Server): void {
    io.on('connection', (socket: Socket) => {
        let activeUserId: string | null = null;
        console.log('⚡ Socket conectado:', socket.id);

        // ── Watch Tracking (Governor) ──
        socket.on('watch:start', async (data: { userId: string, episodeId: string, isFederated?: boolean }) => {
            activeUserId = data.userId;
            DownloadGovernor.registerViewer(data.userId, data.episodeId);
            ConsumptionAnalytics.trackRequest(!data.isFederated);

            if (data.episodeId) {
                const ep = await (prisma as any).episode.findUnique({
                    where: { id: data.episodeId },
                    select: { status: true }
                });
                ConsumptionAnalytics.trackCacheEvent(ep?.status === 'READY');
            }

            console.log(`👁️ [Monitor] Usuário ${data.userId} começou a assistir ${data.episodeId || 'vídeo'}`);
        });

        socket.on('watch:stop', () => {
            if (activeUserId) {
                DownloadGovernor.unregisterViewer(activeUserId);
                activeUserId = null;
            }
        });

        // ── Live Chat (P2P Bridge) ──
        socket.on('join_room', (videoId) => {
            socket.join(videoId);
            console.log(`👤 Socket ${socket.id} entrou na sala do vídeo: ${videoId}`);
        });

        socket.on('send_message', (data) => {
            io.to(data.videoId).emit('receive_message', {
                id: Date.now(),
                text: data.text,
                user: data.user,
                timestamp: new Date().toISOString()
            });
        });

        // ── Cleanup ──
        socket.on('disconnect', () => {
            if (activeUserId) {
                DownloadGovernor.unregisterViewer(activeUserId);
            }
            console.log('🔥 Socket desconectado:', socket.id);
        });
    });

    console.log('📡 [Bootstrap] Socket.IO events registered');
}
