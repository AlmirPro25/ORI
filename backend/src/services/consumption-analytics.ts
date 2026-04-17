/**
 * 📈 CONSUMPTION ANALYTICS
 * 
 * Coleta padrões de consumo para transformar dados em inteligência.
 * O ativo real do StreamForge.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface ConsumptionPattern {
    episodeId: string;
    seriesId: string;
    watchCount: number;
    lastWatchedAt: Date;
    avgCompletionRate: number;
}

export interface ContentProfitability {
    episodeId: string;
    title: string;
    roi: number; // Hours / Cost
    cost: number;
    hours: number;
}

export interface HotContent {
    id: string;
    type: 'EPISODE' | 'SERIES';
    score: number; // Heat score
    activeViewers: number;
}

export interface FileValue {
    episodeId: string;
    title: string;
    valueScore: number; // Hours / GB
    sizeMB: number;
    hoursWatched: number;
}

export interface EconomyBalance {
    avgReputation: number;
    userDistribution: {
        vip: number;     // > 300
        stable: number;  // 150-300
        starter: number; // 100-150
        leech: number;   // < 100
    };
    totalUsers: number;
    systemHealth: 'INFLATION' | 'COLLAPSE' | 'STABLE';
}

export interface UserPhysicalStats {
    userId: string;
    name: string;
    reputation: number;
    badges: string[];
}

class ConsumptionAnalyticsService {
    private cacheHits = 0;
    private cacheTotal = 0;
    private localServed = 0;
    private totalServed = 0;
    /**
     * Registra um evento de playback
     */
    /**
     * Registra o fim de uma sessão com métricas de custo
     */
    async trackSessionEnd(data: {
        userId: string;
        videoId: string;
        duration: number;
        bytesDisk: number;
        bytesNetwork: number;
        ttff: number;
        source: string;
        bufferEvents?: number;
        avgBitrate?: number;
    }) {
        try {
            // 1. Salvar a sessão de watch
            await (prisma as any).watchSession.create({
                data: {
                    userId: data.userId,
                    videoId: data.videoId,
                    startTime: 0,
                    endTime: data.duration,
                    duration: data.duration,
                    bytesDisk: data.bytesDisk,
                    bytesNetwork: data.bytesNetwork,
                    ttff: data.ttff,
                    source: data.source,
                    bufferEvents: data.bufferEvents || 0,
                    avgBitrate: data.avgBitrate || 0,
                    completed: data.duration > 600
                }
            });

            // 2. Atualizar Economia do Usuário
            await this.updateUserEconomy(data.userId, data.duration, data.bytesNetwork);

            console.log(`💰 [Economy] Session ending for ${data.userId}. ROI calculated.`);
        } catch (e) {
            console.error('❌ [Economy] Error saving session stats', e);
        }
    }

    /**
     * Atualiza o Score de Reputação do Usuário
     * UserValue = (WatchMins * 1) - (NetMB * 0.5) - (AbandonPenal)
     */
    private async updateUserEconomy(userId: string, durationSeconds: number, bytesNetworkMB: number) {
        if (userId === 'anon') return;

        const minutes = durationSeconds / 60;
        const netCost = bytesNetworkMB * 0.5; // Peso de rede

        // Penalidade se assistiu menos de 2 minutos (Zapping)
        const isAbandon = durationSeconds < 120;
        const abandonPenalty = isAbandon ? 10 : 0;

        // Bônus de engajamento (Assistiu muito)
        const engagementBonus = minutes > 30 ? 5 : 0;

        const scoreDelta = (minutes * 1.5) + engagementBonus - netCost - abandonPenalty;

        try {
            const user = await (prisma as any).user.findUnique({ where: { id: userId } });
            if (user) {
                const newScore = Math.max(0, user.reputationScore + scoreDelta);
                await (prisma as any).user.update({
                    where: { id: userId },
                    data: {
                        reputationScore: newScore,
                        totalWatchMinutes: { increment: minutes },
                        totalDownloadBytes: { increment: bytesNetworkMB * 1024 * 1024 }
                    }
                });
                console.log(`💎 [Reputation] User ${userId} score: ${newScore.toFixed(1)} (Delta: ${scoreDelta.toFixed(1)})`);
            }
        } catch (e) {
            console.error('❌ [Reputation] Update failed', e);
        }
    }

    /** 📊 Track request for Satisfaction Ratio */
    trackRequest(isLocal: boolean) {
        this.totalServed++;
        if (isLocal) this.localServed++;
    }

    getSatisfactionRatio(): number {
        if (this.totalServed === 0) return 100;
        return Math.round((this.localServed / this.totalServed) * 100);
    }

    async getReputationScore(userId: string): Promise<number> {
        if (userId === 'anon' || !userId) return 50; // Neutral for anon
        const user = await (prisma as any).user.findUnique({ where: { id: userId } });
        return user?.reputationScore ?? 100;
    }

    /**
     * Identifica episódios "quentes" (muitos usuários assistindo ou que acabaram de sair)
     */
    async getHotEpisodes() {
        const recentPlayback = await (prisma as any).playbackHistory.findMany({
            where: {
                updatedAt: {
                    gt: new Date(Date.now() - 24 * 60 * 60 * 1000)
                }
            },
            select: {
                videoId: true,
            }
        });

        const counts: Record<string, number> = {};
        recentPlayback.forEach((p: any) => {
            counts[p.videoId] = (counts[p.videoId] || 0) + 1;
        });

        return Object.entries(counts)
            .map(([videoId, count]) => ({ videoId, count }))
            .sort((a, b) => b.count - a.count);
    }

    /**
     * Previsão: O que deve ser baixado a seguir baseado na frota de usuários?
     */
    async predictNextDemands() {
        const activePlayback = await (prisma as any).playbackHistory.findMany({
            where: {
                updatedAt: { gt: new Date(Date.now() - 1 * 60 * 60 * 1000) } // Última 1h
            },
            include: {
                video: {
                    include: {
                        episode: true
                    }
                }
            }
        });

        const predictions: Record<string, { episodeId: string, weight: number }> = {};

        for (const pb of activePlayback) {
            const video = (pb as any).video;
            if (video && video.episode) {
                const currentEp = video.episode;

                const nextEp = await (prisma as any).episode.findFirst({
                    where: {
                        seriesId: currentEp.seriesId,
                        seasonNumber: currentEp.seasonNumber,
                        episodeNumber: currentEp.episodeNumber + 1,
                        status: 'NOT_DOWNLOADED'
                    }
                });

                if (nextEp) {
                    if (!predictions[nextEp.id]) {
                        predictions[nextEp.id] = { episodeId: nextEp.id, weight: 0 };
                    }
                    predictions[nextEp.id].weight += 1;
                }
            }
        }

        return Object.values(predictions).sort((a, b) => b.weight - a.weight);
    }

    /**
     * 🔥 HEATMAP: Identifica o que está "pegando fogo" no sistema agora.
     * Score baseado em janelas deslizantes agressivas:
     * - Últimos 30 min (Burning): +10 pontos por view
     * - Últimas 3h (Warm): +2 pontos por view
     */
    async getHeatmap(): Promise<HotContent[]> {
        const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
        const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);

        const recentHistory = await (prisma as any).playbackHistory.findMany({
            where: { updatedAt: { gt: threeHoursAgo } },
            include: { video: { include: { episode: true } } }
        });

        const heatMap: Record<string, HotContent> = {};

        for (const pb of recentHistory) {
            const video = (pb as any).video;
            if (!video || !video.episode) continue;
            const id = video.episode.id;

            if (!heatMap[id]) {
                heatMap[id] = { id, type: 'EPISODE', score: 0, activeViewers: 0 };
            }

            // Peso agressivo por recência (Decay)
            if (pb.updatedAt > thirtyMinAgo) {
                heatMap[id].score += 10;
            } else {
                heatMap[id].score += 2;
            }
        }

        return Object.values(heatMap).sort((a, b) => b.score - a.score);
    }

    async isHot(episodeId: string): Promise<boolean> {
        const heatmap = await this.getHeatmap();
        const top = heatmap.slice(0, 5);
        return top.some(h => h.id === episodeId);
    }

    /**
     * 💰 ECONOMIA LOCAL: Calcula o valor real de cada arquivo no disco
     * Score = Total de Horas Assistidas / Tamanho em GB
     */
    async getEconomicValues(): Promise<FileValue[]> {
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

        const episodes = await (prisma as any).episode.findMany({
            where: { status: 'READY', videoId: { not: null } },
            include: { video: true }
        });

        const values: FileValue[] = [];

        for (const ep of episodes) {
            const sizeGB = (ep.video?.fileSize || ep.fileSize || 500) / 1024;

            // Buscar sessões de watch para este vídeo
            const sessions = await (prisma as any).watchSession.aggregate({
                where: { videoId: ep.videoId },
                _sum: { duration: true }
            });

            const totalSeconds = sessions._sum.duration || 0;
            const hours = totalSeconds / 3600;

            // Recency Bonus: Arquivos novos (menos de 3 dias) ganham boost de exploração
            const isNew = ep.createdAt > threeDaysAgo;
            const recencyMultiplier = isNew ? 2.5 : 1.0;

            const baseScore = sizeGB > 0 ? (hours / sizeGB) : 0;
            const valueScore = baseScore * recencyMultiplier;

            values.push({
                episodeId: ep.id,
                title: ep.title,
                valueScore: Number(valueScore.toFixed(2)),
                sizeMB: Math.round(sizeGB * 1024),
                hoursWatched: Number(hours.toFixed(1))
            });
        }

        return values.sort((a, b) => b.valueScore - a.valueScore);
    }

    /** Tracking de Cache hits/misses */
    trackCacheEvent(isHit: boolean) {
        this.cacheTotal++;
        if (isHit) this.cacheHits++;
    }

    getCacheHitRate(): number {
        if (this.cacheTotal === 0) return 0;
        return Math.round((this.cacheHits / this.cacheTotal) * 100);
    }

    /**
     * 📊 LUCRATIVIDADE DE CONTEÚDO: Score = Horas Assistidas / Custo de Recurso
     * Custo = (BytesDisk * 0.1) + (BytesNetwork * 0.9)  <-- Rede é mais cara
     */
    async getProfitabilityScores(): Promise<ContentProfitability[]> {
        const episodes = await (prisma as any).episode.findMany({
            where: { status: 'READY', videoId: { not: null } },
            include: { video: true }
        });

        const scores: ContentProfitability[] = [];

        for (const ep of episodes) {
            const stats = await (prisma as any).watchSession.aggregate({
                where: { videoId: ep.videoId },
                _sum: {
                    duration: true,
                    bytesDisk: true,
                    bytesNetwork: true
                }
            });

            const hours = (stats._sum.duration || 0) / 3600;
            const bDisk = stats._sum.bytesDisk || 0;
            const bNet = stats._sum.bytesNetwork || 0;

            // Fórmula de Custo Físico (Ponderada)
            const physicalCost = (bDisk * 0.1) + (bNet * 1.5); // Rede custa 15x mais

            const roi = physicalCost > 0 ? (hours / physicalCost) * 1000 : 0;

            scores.push({
                episodeId: ep.id,
                title: ep.title,
                roi: Number(roi.toFixed(2)),
                cost: Number(physicalCost.toFixed(2)),
                hours: Number(hours.toFixed(1))
            });
        }

        return scores.sort((a, b) => b.roi - a.roi);
    }

    /**
     * ⚖️ EQUILÍBRIO DA ECONOMIA: Monitora se o sistema está saudável
     */
    async getEconomyBalance(): Promise<EconomyBalance> {
        const users = await (prisma as any).user.findMany({
            select: { reputationScore: true }
        });

        const total = users.length || 1;
        const sum = users.reduce((acc: number, u: any) => acc + u.reputationScore, 0);
        const avg = sum / total;

        const dist = { vip: 0, stable: 0, starter: 0, leech: 0 };
        users.forEach((u: any) => {
            if (u.reputationScore > 300) dist.vip++;
            else if (u.reputationScore > 150) dist.stable++;
            else if (u.reputationScore >= 100) dist.starter++;
            else dist.leech++;
        });

        // Sensor de Drift
        let health: EconomyBalance['systemHealth'] = 'STABLE';
        if (avg > 500) health = 'INFLATION';
        if (avg < 80) health = 'COLLAPSE';

        return {
            avgReputation: Number(avg.toFixed(1)),
            userDistribution: dist,
            totalUsers: total,
            systemHealth: health
        };
    }

    /**
     * 🏅 BADGES FÍSICOS: Traduz métricas em status compreensível
     */
    async getUserBadges(userId: string): Promise<string[]> {
        const user = await (prisma as any).user.findUnique({ where: { id: userId } });
        if (!user) return [];

        const badges: string[] = [];

        // 1. Seeder Ativo: Contribuiu mais de 1GB de Upload (Simulado / Placeholder por enquanto)
        if (user.totalUploadBytes > 1024 * 1024 * 1024) badges.push('SEEDER_ATIVO');

        // 2. Maratonista: Mais de 500 minutos de engajamento
        if (user.totalWatchMinutes > 500) badges.push('MARATONISTA');

        // 3. Cache Friend: Baixo consumo de rede comparado ao watch time
        const networkMB = user.totalDownloadBytes / (1024 * 1024);
        if (user.totalWatchMinutes > 60 && networkMB / user.totalWatchMinutes < 0.5) {
            badges.push('CACHE_FRIEND');
        }

        // 4. VIP Orgânico
        if (user.reputationScore > 300) badges.push('VIP_ORGANICO');

        return badges;
    }

    /**
     * 🧠 ADAPTIVE LAYER: Fatores multiplicadores baseados em reputação
     * Em vez de limites binários, usamos ajustes contínuos.
     */
    async getAdaptiveMultipliers(userId: string) {
        const rep = await this.getReputationScore(userId);

        // Curva suave: 100 rep -> 1.0 multiplier
        // 50 rep -> 0.6 multiplier
        // 400 rep -> 1.2 multiplier
        const prefetchFactor = Math.max(0.4, Math.min(1.5, rep / 150));
        const qualityBuffer = rep < 100 ? 0.7 : 1.0; // Conservador se rep baixa

        return {
            prefetchFactor: Number(prefetchFactor.toFixed(2)),
            qualityFactor: qualityBuffer,
            priority: rep > 200 ? 'HIGH' : 'NORMAL'
        };
    }

    /**
     * 📉 UEV (User Experience Variance): Sensor de desigualdade sistêmica
     * O objetivo é manter a variância baixa.
     */
    async getExperienceMetrics() {
        const recentSessions = await (prisma as any).watchSession.findMany({
            where: { createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
            select: { ttff: true, bufferEvents: true, avgBitrate: true }
        });

        if (recentSessions.length === 0) return {
            ttffVariance: 0,
            avgTTFF: 0,
            avgBitrate: 0,
            avgBuffers: 0,
            uevStatus: 'STABLE' as const
        };

        const avgs = {
            ttff: recentSessions.reduce((a: number, s: any) => a + (s.ttff || 0), 0) / recentSessions.length,
            bitrate: recentSessions.reduce((a: number, s: any) => a + (s.avgBitrate || 0), 0) / recentSessions.length,
            buffers: recentSessions.reduce((a: number, s: any) => a + (s.bufferEvents || 0), 0) / recentSessions.length
        };

        // Cálculo de variância do TTFF (exemplo simplificado)
        const ttffVariance = recentSessions.reduce((a: number, s: any) => a + Math.pow((s.ttff || 0) - avgs.ttff, 2), 0) / recentSessions.length;

        return {
            avgTTFF: Math.round(avgs.ttff),
            avgBitrate: Number(avgs.bitrate.toFixed(2)),
            avgBuffers: Number(avgs.buffers.toFixed(1)),
            ttffVariance: Math.round(Math.sqrt(ttffVariance)), // Desvio padrão
            uevStatus: Math.sqrt(ttffVariance) > 1000 ? 'HIGH_INEQUALITY' : 'STABLE'
        };
    }

    /**
     * 🛡️ REMOTE TRUST FACTOR: Calcula o quão confiável é um sinal remoto.
     * Decai se o ROI local for baixo para o tipo de conteúdo.
     */
    async getRemoteTrustFactor(nodeId: string): Promise<number> {
        // Por enquanto, trust base = 1.0. 
        // No futuro, isso seria persistido por nodeId
        const baseTrust = 1.0;

        // Se o sistema está instável, desconfiamos de tudo (Fator de proteção)
        const uev = await this.getExperienceMetrics();
        const protectionFactor = uev.uevStatus === 'HIGH_INEQUALITY' ? 0.5 : 1.0;

        return baseTrust * protectionFactor;
    }
}

export const ConsumptionAnalytics = new ConsumptionAnalyticsService();
