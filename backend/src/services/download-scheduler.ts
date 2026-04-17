/**
 * 📥 DOWNLOAD SCHEDULER FOR SERIES
 * 
 * Gerencia a fila de downloads de episódios com:
 * - Prioridade por demanda
 * - Max concurrent downloads
 * - Auto-queue do próximo episódio
 * - Error handling robusto
 */

import { PrismaClient } from '@prisma/client';
import { queueDownload } from '../torrent-downloader-v2';
import { DownloadGovernor } from './download-governor';
import { ConsumptionAnalytics } from './consumption-analytics';

const prisma = new PrismaClient();

const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_DOWNLOADS || '3', 10);

interface QueueItem {
    episodeId: string;
    priority: number;
    userId?: string;
}

class DownloadSchedulerService {
    private queue: QueueItem[] = [];
    private processing = new Set<string>();

    constructor() {
        // Ciclo de pre-disponibilidade (a cada 1 hora)
        setInterval(() => this.runPredictionCycle(), 60 * 60 * 1000);
    }

    /**
     * Enfileira um episódio para download
     */
    async queueEpisode(episodeId: string, priority: number = 0, userId?: string): Promise<void> {
        const episode = await (prisma as any).episode.findUnique({ where: { id: episodeId } });

        if (!episode) throw new Error(`Episode ${episodeId} not found`);
        if (episode.status === 'READY' || episode.status === 'DOWNLOADING') return;

        await (prisma as any).episode.update({
            where: { id: episodeId },
            data: { status: 'QUEUED' },
        });

        // Evitar duplicatas na fila
        const existing = this.queue.find(q => q.episodeId === episodeId);
        if (!existing) {
            this.queue.push({ episodeId, priority, userId });
        } else if (priority > existing.priority) {
            existing.priority = priority;
            existing.userId = userId || existing.userId;
        }

        this.processQueue();
    }

    /**
     * Enfileira todos os episódios de uma temporada
     */
    async queueSeason(seriesId: string, seasonNumber: number): Promise<number> {
        const episodes = await (prisma as any).episode.findMany({
            where: {
                seriesId,
                seasonNumber,
                status: { in: ['NOT_DOWNLOADED', 'FAILED'] },
            },
            orderBy: { episodeNumber: 'asc' },
        });

        for (const episode of episodes) {
            await this.queueEpisode(episode.id, 10);
        }

        return episodes.length;
    }

    /**
     * Enfileira todos os episódios de uma série
     */
    async queueSeries(seriesId: string): Promise<number> {
        const episodes = await (prisma as any).episode.findMany({
            where: {
                seriesId,
                status: { in: ['NOT_DOWNLOADED', 'FAILED'] },
            },
            orderBy: [{ seasonNumber: 'asc' }, { episodeNumber: 'asc' }],
        });

        for (const episode of episodes) {
            await this.queueEpisode(episode.id, 5);
        }

        return episodes.length;
    }

    /**
     * Auto-queue do próximo episódio para download
     */
    async autoQueueNext(currentEpisodeId: string, userId?: string): Promise<void> {
        const current = await (prisma as any).episode.findUnique({
            where: { id: currentEpisodeId },
        });

        if (!current) return;

        // Busca próximo na mesma temporada
        let next = await (prisma as any).episode.findFirst({
            where: {
                seriesId: current.seriesId,
                seasonNumber: current.seasonNumber,
                episodeNumber: { gt: current.episodeNumber },
                status: 'NOT_DOWNLOADED',
            },
            orderBy: { episodeNumber: 'asc' },
        });

        // Se não tem mais na temporada, busca próxima temporada
        if (!next) {
            next = await (prisma as any).episode.findFirst({
                where: {
                    seriesId: current.seriesId,
                    seasonNumber: { gt: current.seasonNumber },
                    status: 'NOT_DOWNLOADED',
                },
                orderBy: [{ seasonNumber: 'asc' }, { episodeNumber: 'asc' }],
            });
        }

        if (next && next.magnetLink) {
            // 🛡️ GOVERNOR: Verificar se podemos auto-baixar agora com contexto do usuário
            const decision = await DownloadGovernor.shouldAutoDownload(next.id, userId);

            if (!decision.allowed) {
                console.log(`🛡️ [Governor] Auto-queue bloqueado para ${next.id}: ${decision.reason}`);
                return;
            }

            console.log(`🤖 [AutoQueue] Enfileirando próximo: S${next.seasonNumber}E${next.episodeNumber} (User: ${userId || 'system'})`);
            await this.queueEpisode(next.id, 100, userId); // Alta prioridade
        }
    }

    /**
     * 🧠 Executa ciclo de predição para pre-download
     */
    async runPredictionCycle() {
        console.log('🧠 [Scheduler] Iniciando ciclo de predição de demanda...');
        try {
            const predictions = await ConsumptionAnalytics.predictNextDemands();

            for (const pred of predictions) {
                const decision = await DownloadGovernor.shouldAutoDownload(pred.episodeId);
                if (decision.allowed) {
                    console.log(`💡 [Predictor] Pre-baixando demanda provável: ${pred.episodeId} (peso: ${pred.weight})`);
                    await this.queueEpisode(pred.episodeId, 20); // Prioridade média
                }
            }
        } catch (err) {
            console.error('❌ [Scheduler] Falha no ciclo de predição:', err);
        }
    }

    /**
     * Processa a fila de downloads
     */
    private async processQueue(): Promise<void> {
        if (this.processing.size >= MAX_CONCURRENT) return;

        // Ordena por prioridade (maior primeiro)
        this.queue.sort((a, b) => b.priority - a.priority);

        const item = this.queue.shift();
        if (!item) return;

        if (this.processing.has(item.episodeId)) return;

        this.processing.add(item.episodeId);

        try {
            await this.downloadEpisode(item.episodeId, item.userId);
        } catch (error: any) {
            console.error(`❌ [Scheduler] Failed to download episode ${item.episodeId}:`, error);
            await (prisma as any).episode.update({
                where: { id: item.episodeId },
                data: { status: 'FAILED' },
            });
        } finally {
            this.processing.delete(item.episodeId);
            // Processar próximo
            setTimeout(() => this.processQueue(), 500);
        }
    }

    /**
     * Efetua download de um episódio
     */
    private async downloadEpisode(episodeId: string, userId?: string): Promise<void> {
        const episode = await (prisma as any).episode.findUnique({
            where: { id: episodeId },
            include: { series: true },
        });

        if (!episode || !episode.magnetLink) {
            throw new Error(`Episode ${episodeId} not found or has no magnet link`);
        }

        // Atualizar status
        await (prisma as any).episode.update({
            where: { id: episodeId },
            data: { status: 'DOWNLOADING' },
        });

        const title = `${episode.series.title} - S${String(episode.seasonNumber).padStart(2, '0')}E${String(episode.episodeNumber).padStart(2, '0')}`;

        try {
            // Usa o downloader V2 existente
            const result = await queueDownload({
                magnetURI: episode.magnetLink,
                userId: 'system',
                title,
                category: 'Series',
                priority: 50,
                fileIndex: episode.torrentFileIndex ?? undefined,
            });

            // Associar vídeo ao episódio
            await (prisma as any).episode.update({
                where: { id: episodeId },
                data: {
                    videoId: result.videoId,
                    status: 'PROCESSING',
                },
            });

            console.log(`✅ [Scheduler] Episode download queued: ${title} (videoId: ${result.videoId})`);

            // Auto-queue próximo
            if (process.env.AUTO_QUEUE_NEXT_EPISODE !== 'false') {
                this.autoQueueNext(episodeId, userId).catch(console.error);
            }
        } catch (error: any) {
            console.error(`❌ [Scheduler] Failed to download episode ${episodeId}:`, error);
            DownloadGovernor.registerFailure(episodeId); // Registrar falha no Governor
            await (prisma as any).episode.update({
                where: { id: episodeId },
                data: { status: 'FAILED' },
            });
            throw error;
        }
    }

    /**
     * Retorna estatísticas da fila
     */
    getStats() {
        return {
            queued: this.queue.length,
            processing: this.processing.size,
            maxConcurrent: MAX_CONCURRENT,
        };
    }
}

export const DownloadScheduler = new DownloadSchedulerService();
