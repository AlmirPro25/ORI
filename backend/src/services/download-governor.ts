/**
 * 🛡️ DOWNLOAD GOVERNOR
 * 
 * Governança inteligente sobre decisões de auto-download.
 * Impede o efeito avalanche quando muitos usuários assistem simultaneamente.
 * 
 * Critérios de decisão:
 * 1. CPU/Memória disponível
 * 2. Fila de encoding ativa
 * 3. Número de downloads simultâneos
 * 4. Número de usuários assistindo no momento
 * 5. Saúde do swarm (se disponível)
 * 6. Hora do dia (off-peak = mais agressivo)
 * 7. Histórico de falhas recentes
 * 8. Popularidade Global (Hot Content)
 * 
 * Filosofia: "Sistemas não quebram quando falham.
 *             Sistemas quebram quando dão certo rápido demais."
 */

import os from 'os';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { ConsumptionAnalytics } from './consumption-analytics';

const prisma = new PrismaClient();

// === CONFIGURAÇÃO ===
const CONFIG = {
    // Limites hard (nunca exceder)
    MAX_CONCURRENT_DOWNLOADS: parseInt(process.env.MAX_CONCURRENT_DOWNLOADS || '3', 10),
    MAX_CONCURRENT_ENCODES: parseInt(process.env.MAX_CONCURRENT_ENCODES || '2', 10),

    // Thresholds de saúde
    CPU_THRESHOLD_PERCENT: 80,       // Acima disso, não auto-baixa
    MEMORY_THRESHOLD_PERCENT: 85,    // Acima disso, não auto-baixa

    // Limites de usuários
    ACTIVE_VIEWERS_SOFT_LIMIT: 5,    // Acima disso, reduz agressividade
    ACTIVE_VIEWERS_HARD_LIMIT: 20,   // Acima disso, para auto-download

    // TTFF GOALS (Golden Metric)
    TTFF_HEALTHY_MS: 2000,           // 2s = objetivo
    TTFF_DEGRADED_MS: 5000,          // 5s = alerta
    TTFF_CRITICAL_MS: 8000,          // 8s = pânico

    // Cooldowns
    FAILURE_COOLDOWN_MS: 5 * 60 * 1000,   // 5min após falha
    DECISION_CACHE_MS: 10 * 1000,          // Cache decisão por 10s

    // Horários off-peak (mais agressivo)
    OFF_PEAK_START: 2,   // 2:00 AM
    OFF_PEAK_END: 8,     // 8:00 AM

    // STORAGE LIMITS
    DISK_RESERVE_MB: 5000,           // Reservar 5GB no mínimo
    DISK_CRITICAL_THRESHOLD: 95,     // 95% = Parar TUDO
    DISK_WARNING_THRESHOLD: 85,      // 85% = Parar PREFETCH

    // 🛡️ AUTO-HEALER & STRESS
    STABILIZATION_COOLDOWN_MS: 60_000,
    HYSTERESIS_UEV_THRESHOLD: 800,   // Variance must be below this to exit (vs 1000 to enter)
};

export enum OperationMode {
    HEALTHY = 'HEALTHY',
    DEGRADED = 'DEGRADED',   // CPU/Disk alta: Parar automação não essencial
    CRITICAL = 'CRITICAL',   // Sistema no limite: Parar todos os auto-downloads
    STABILIZING = 'STABILIZING' // Auto-Healer ativo: Recuperando de variância alta
}

// === TIPOS ===
export interface GovernorDecision {
    allowed: boolean;
    reason: string;
    confidence: number;       // 0-100, quão confiante estamos
    suggestedDelay?: number;  // ms para esperar antes de tentar novamente
    systemHealth: SystemHealth;
}

export interface SystemHealth {
    cpuUsagePercent: number;
    memoryUsagePercent: number;
    activeDownloads: number;
    activeEncodes: number;
    activeViewers: number;
    recentFailures: number;
    diskUsagePercent: number;
    diskFreeMB: number;
    avgTTFF: number;          // Métrica de ouro (ms)
    isOffPeak: boolean;
    overallScore: number;     // 0-100, saúde geral
    mode: OperationMode;
}

// === ESTADO INTERNO ===
class DownloadGovernorService {
    private recentFailures: { timestamp: number; episodeId: string }[] = [];
    private activeViewers = new Set<string>();  // userId ativos
    private episodeViewers = new Map<string, Set<string>>(); // episodeId -> Set(userIds)
    private recentTTFF: number[] = [];      // Janela deslizante de TTFF
    private lastDecision: { timestamp: number; decision: GovernorDecision } | null = null;
    private activeDownloadCount = 0;
    private activeEncodeCount = 0;

    // 🧠 AUTO-HEALER STATE
    private isStabilizing = false;
    private stabilizationStartTime = 0;
    private lastStabilizationEndTime = 0;
    private lastUEVStatus: 'STABLE' | 'HIGH_INEQUALITY' = 'STABLE';
    private totalRecoveryTime = 0;
    private recoveryCount = 0;

    // 🧠 DAMPING & SMOOTHING
    private smoothedScore = 100;
    private readonly DAMPING_FACTOR = 0.3; // EWMA weight (30% new, 70% memory)
    private readonly RECOVERY_RAMP_MS = 5 * 60 * 1000; // 5 min para carga total post-cura

    // 📈 STRESS SENSORS
    private elasticLimit = 0;       // Elastic Limit: Max stable concurrency
    private painThreshold = 0;      // Pain Threshold: Concurrency at trigger
    private lastUEVVariance = 0;

    // ==========================================
    // �️ FEDERATION: ADMISSION CONTROL
    // ==========================================

    /**
     * Decide se este nó pode aceitar usuários redirecionados de outro nó.
     * Regra: Sobrevivência Primeiro.
     */
    async canAcceptFederatedTraffic(): Promise<{ allowed: boolean; reason: string }> {
        const health = await this.getSystemHealth();
        const sc = this.getEffectiveSustainableConcurrency();
        const concurrency = this.activeViewers.size;

        if (this.isStabilizing) {
            return { allowed: false, reason: '🛡️ AUTO-HEALER ACTIVE: Stabilization in progress.' };
        }

        // Pânico post-estabilização: Se saímos agora, operamos com cautela
        if (health.overallScore < 75) {
            return { allowed: false, reason: `💔 LOW HEALTH (${health.overallScore}/100): Node is still sensitive post-recovery.` };
        }

        if (concurrency >= sc * 0.9) {
            return { allowed: false, reason: `📈 CAPACITY LIMIT: Node reached 90% of dynamic SC (${concurrency}/${sc}).` };
        }

        return { allowed: true, reason: '🟢 HEALTHY: Node has surplus capacity.' };
    }

    /**
     * Calcula o SC dinâmico com Ramp-up (Cooldown de Recuperação)
     */
    private getEffectiveSustainableConcurrency(): number {
        const baseSC = Math.floor(this.elasticLimit * 0.9) || 5;

        if (this.isStabilizing) return Math.floor(baseSC * 0.5); // 50% capacity if recovering

        const timeSinceRecovery = Date.now() - this.lastStabilizationEndTime;
        if (timeSinceRecovery < this.RECOVERY_RAMP_MS) {
            // Ramp-up linear: de 50% a 100% do SC em 5 minutos
            const rampFactor = 0.5 + (0.5 * (timeSinceRecovery / this.RECOVERY_RAMP_MS));
            return Math.floor(baseSC * rampFactor);
        }

        return baseSC;
    }

    /**
     * Retorna o Heartbeat (NIB - Node Intelligence Bundle) para a rede Nexus
     */
    async getNexusHeartbeat() {
        const health = await this.getSystemHealth();
        return {
            nodeId: process.env.NODE_ID || os.hostname(),
            concurrency: this.activeViewers.size,
            sc: this.getEffectiveSustainableConcurrency(),
            healthScore: Math.round(this.smoothedScore), // Enviar o score amortecido
            stabilizationMode: this.isStabilizing,
            avgTTFF: health.avgTTFF,
            timestamp: Date.now()
        };
    }

    // ==========================================
    // �📊 DECISÃO PRINCIPAL
    // ==========================================

    /**
     * Decide SE um auto-download deve acontecer.
     * Esta é a função central do Governor.
     */
    async shouldAutoDownload(episodeId: string, userId?: string): Promise<GovernorDecision> {
        // Cache de decisão (evitar sobrecarga de métricas)
        // Omitir cache se houver userId específico para garantir prioridade dinâmica
        if (!userId && this.lastDecision && Date.now() - this.lastDecision.timestamp < CONFIG.DECISION_CACHE_MS) {
            return this.lastDecision.decision;
        }

        const health = await this.getSystemHealth();
        const decision = await this.evaluate(health, episodeId, userId);

        if (!userId) {
            this.lastDecision = { timestamp: Date.now(), decision };
        }

        // Log da decisão
        const emoji = decision.allowed ? '✅' : '🛑';
        console.log(
            `${emoji} [Governor] Auto-download ${decision.allowed ? 'ALLOWED' : 'BLOCKED'}: ` +
            `${decision.reason} (health: ${health.overallScore}/100, confidence: ${decision.confidence}%)`
        );

        return decision;
    }

    /**
     * Avalia as condições e retorna a decisão
     */
    private async evaluate(health: SystemHealth, episodeId: string, userId?: string): Promise<GovernorDecision> {
        // 🧠 ADAPTIVE LAYER: Fatores suaves em vez de limites binários
        const multipliers = userId ? await ConsumptionAnalytics.getAdaptiveMultipliers(userId) : { prefetchFactor: 1.0, qualityFactor: 1.0, priority: 'NORMAL' };

        // 🛡️ AUTO-HEALER: Aplicar redutor global se estiver em modo de estabilização
        const stabilizationFactor = this.isStabilizing ? 0.6 : 1.0;
        const effectivePrefetchFactor = multipliers.prefetchFactor * stabilizationFactor;

        const isVIP = multipliers.priority === 'HIGH';
        const isLowRep = effectivePrefetchFactor < 0.7;

        // 🚨 CRITICAL: Falta de Espaço em Disco
        if (health.diskUsagePercent > CONFIG.DISK_CRITICAL_THRESHOLD || health.diskFreeMB < CONFIG.DISK_RESERVE_MB) {
            // VIPs amargam o mesmo destino em falha catastrófica de hardware
            return {
                allowed: false,
                reason: `🚨 DISK CRITICAL: Only ${health.diskFreeMB}MB remaining. Operations suspended.`,
                confidence: 100,
                suggestedDelay: 600_000,
                systemHealth: health,
            };
        }

        // 🔴 HARD LIMITS — nunca exceder
        if (health.activeDownloads >= CONFIG.MAX_CONCURRENT_DOWNLOADS) {
            // VIPs podem tentar furar fila se a carga não for extrema
            if (isVIP && health.activeDownloads < CONFIG.MAX_CONCURRENT_DOWNLOADS + 1) {
                // Permitir 1 download extra para VIPs
            } else {
                return {
                    allowed: false,
                    reason: `Download limit reached (${health.activeDownloads}/${CONFIG.MAX_CONCURRENT_DOWNLOADS})`,
                    confidence: 100,
                    suggestedDelay: 30_000,
                    systemHealth: health,
                };
            }
        }

        // 🔴 CPU crítica
        if (health.cpuUsagePercent > CONFIG.CPU_THRESHOLD_PERCENT) {
            return {
                allowed: false,
                reason: `CPU too high (${health.cpuUsagePercent.toFixed(0)}% > ${CONFIG.CPU_THRESHOLD_PERCENT}%)`,
                confidence: 95,
                suggestedDelay: 60_000,
                systemHealth: health,
            };
        }

        // 🔴 Memória crítica
        if (health.memoryUsagePercent > CONFIG.MEMORY_THRESHOLD_PERCENT) {
            return {
                allowed: false,
                reason: `Memory too high (${health.memoryUsagePercent.toFixed(0)}% > ${CONFIG.MEMORY_THRESHOLD_PERCENT}%)`,
                confidence: 95,
                suggestedDelay: 60_000,
                systemHealth: health,
            };
        }

        // 🔴 Muitos viewers ativos (hard limit)
        if (health.activeViewers >= CONFIG.ACTIVE_VIEWERS_HARD_LIMIT) {
            return {
                allowed: false,
                reason: `Too many active viewers (${health.activeViewers} >= ${CONFIG.ACTIVE_VIEWERS_HARD_LIMIT})`,
                confidence: 90,
                suggestedDelay: 120_000,
                systemHealth: health,
            };
        }

        // 🟡 Falhas recentes neste episódio
        const recentEpFailures = this.recentFailures.filter(
            f => f.episodeId === episodeId && Date.now() - f.timestamp < CONFIG.FAILURE_COOLDOWN_MS
        );
        if (recentEpFailures.length >= 3) {
            return {
                allowed: false,
                reason: `Too many recent failures for this episode (${recentEpFailures.length})`,
                confidence: 85,
                suggestedDelay: CONFIG.FAILURE_COOLDOWN_MS,
                systemHealth: health,
            };
        }

        // 🟡 Muitos encodes ativos + downloads
        if (health.activeEncodes >= CONFIG.MAX_CONCURRENT_ENCODES && health.activeDownloads > 0) {
            return {
                allowed: false,
                reason: `Encode queue full (${health.activeEncodes}) with active downloads (${health.activeDownloads})`,
                confidence: 80,
                suggestedDelay: 45_000,
                systemHealth: health,
            };
        }

        // 🛡️ ACTIVE SWARM: Proteção máxima para conteúdo com múltiplos espectadores simultâneos
        // Capped at 5 viewers to prevent I/O black holes
        if (this.isEpisodeInActiveSwarm(episodeId)) {
            const viewers = this.episodeViewers.get(episodeId)?.size || 0;
            const cappedViewers = Math.min(viewers, 5);
            return {
                allowed: true,
                reason: `🛡️ ACTIVE SWARM: ${viewers} active viewers (Priority capped at ${cappedViewers}).`,
                confidence: 90 + (cappedViewers * 2),
                systemHealth: health,
            };
        }

        // 🎲 EXPLORATION CHANCE: Pequena chance de permitir conteúdo não-quente para evitar cache conservador
        // Aplicar o prefetchFactor aqui: usuários ruins exploram menos (poupam rede)
        // 🛡️ AUTO-HEALER: Exploration é ZERADA em modo de estabilização
        const explorationBaseChance = this.isStabilizing ? 0 : 0.05 * effectivePrefetchFactor;
        if (health.overallScore > 60 && Math.random() < explorationBaseChance) {
            return {
                allowed: true,
                reason: `🎲 EXPLORATION: Controlled budget (${multipliers.prefetchFactor.toFixed(1)}x) for cache diversification.`,
                confidence: 50,
                systemHealth: health,
            };
        }

        // 🟢 Off-peak: mais permissivo
        if (health.isOffPeak) {
            return {
                allowed: true,
                reason: 'Off-peak hours — aggressive auto-download enabled',
                confidence: 95,
                systemHealth: health,
            };
        }

        // 🔥 Hot Content: Abrir exceção ou permitir com carga maior
        const isHot = await ConsumptionAnalytics.isHot(episodeId);

        // Se estiver em modo DEGRADADO, só permite se for HOT
        if (health.mode === OperationMode.DEGRADED && !isHot) {
            return {
                allowed: false,
                reason: `DEGRADED MODE: Resource scarcity. Only hot content allowed.`,
                confidence: 90,
                systemHealth: health,
            };
        }

        if (isHot && health.overallScore > 40) {
            // Check Profitability (ROI)
            // Se o ROI for extremamente baixo, talvez seja "Tóxico"
            const profitability = await ConsumptionAnalytics.getProfitabilityScores();
            const myScore = profitability.find(p => p.episodeId === episodeId);

            if (myScore && myScore.roi < 10 && !this.isEpisodeInActiveSwarm(episodeId)) {
                return {
                    allowed: false,
                    reason: `🚫 TOXIC CONTENT: Low ROI (${myScore.roi}). Resource consumption exceeds value.`,
                    confidence: 80,
                    systemHealth: health,
                };
            }

            return {
                allowed: true,
                reason: `🔥 HOT CONTENT: High demand detected. Priority bypass enabled.`,
                confidence: 90,
                systemHealth: health,
            };
        }

        // 🟡 Viewers no soft limit: permitir com cautela
        if (health.activeViewers >= CONFIG.ACTIVE_VIEWERS_SOFT_LIMIT) {
            // Permitir apenas se saúde geral > 60
            if (health.overallScore < 60) {
                return {
                    allowed: false,
                    reason: `Many viewers (${health.activeViewers}) + low health (${health.overallScore}/100)`,
                    confidence: 70,
                    suggestedDelay: 30_000,
                    systemHealth: health,
                };
            }
        }

        // 🟢 Todas as condições OK
        // Bônus de confiança baseado na reputação (Adaptado para multiplicador efetivo)
        const repBonus = Math.floor(effectivePrefetchFactor * 15);

        return {
            allowed: true,
            reason: `System healthy. ${this.isStabilizing ? '🛡️ STABILIZING (' + effectivePrefetchFactor.toFixed(1) + 'x)' : 'Adaptive Factor: ' + effectivePrefetchFactor.toFixed(1) + 'x'}`,
            confidence: Math.min(health.overallScore + repBonus, 98),
            systemHealth: health,
        };
    }

    // ==========================================
    // 📊 MÉTRICAS DE SAÚDE
    // ==========================================

    /**
     * Coleta todas as métricas do sistema
     */
    async getSystemHealth(): Promise<SystemHealth> {
        const [cpuUsage, memUsage, activeDownloads, activeEncodes, recentFailureCount, diskStats] = await Promise.all([
            this.getCpuUsage(),
            this.getMemoryUsage(),
            this.getActiveDownloads(),
            this.getActiveEncodes(),
            Promise.resolve(this.recentFailures.filter(f => Date.now() - f.timestamp < CONFIG.FAILURE_COOLDOWN_MS).length),
            this.getDiskStats(),
        ]);

        const avgTTFF = this.recentTTFF.length > 0
            ? Math.round(this.recentTTFF.reduce((a, b) => a + b, 0) / this.recentTTFF.length)
            : 0;

        const hour = new Date().getHours();
        const isOffPeak = hour >= CONFIG.OFF_PEAK_START && hour < CONFIG.OFF_PEAK_END;

        const partialHealth: any = {
            cpuUsagePercent: cpuUsage,
            memoryUsagePercent: memUsage,
            activeDownloads,
            activeEncodes,
            activeViewers: this.activeViewers.size,
            recentFailures: recentFailureCount,
            diskUsagePercent: diskStats.usagePercent,
            diskFreeMB: diskStats.freeMB,
            avgTTFF,
            isOffPeak,
        };

        const overallScore = this.calculateHealthScore(partialHealth);

        // 🧠 Trigger Auto-Healer Cycle
        await this.runAutoHealerCycle();

        const mode = this.getOperationMode(partialHealth, overallScore);

        return {
            ...partialHealth,
            overallScore,
            mode,
        };
    }

    /**
     * Determina o modo de operação baseado na saúde e recursos
     */
    private getOperationMode(health: any, score: number): OperationMode {
        // 🚨 Prioridade 1: TTFF (Experiência)
        if (health.avgTTFF > CONFIG.TTFF_CRITICAL_MS || health.diskUsagePercent > CONFIG.DISK_CRITICAL_THRESHOLD || score < 15) {
            return OperationMode.CRITICAL;
        }

        if (health.avgTTFF > CONFIG.TTFF_HEALTHY_MS || health.diskUsagePercent > CONFIG.DISK_WARNING_THRESHOLD || score < 40) {
            return OperationMode.DEGRADED;
        }

        if (this.isStabilizing) {
            return OperationMode.STABILIZING;
        }

        return OperationMode.HEALTHY;
    }

    /**
     * Calcula um score de saúde de 0-100
     */
    private calculateHealthScore(health: any): number {
        let score = 100;

        // CPU: -1 ponto por % acima de 50
        if (health.cpuUsagePercent > 50) {
            score -= (health.cpuUsagePercent - 50) * 1;
        }

        // Memória: -1.5 pontos por % acima de 60
        if (health.memoryUsagePercent > 60) {
            score -= (health.memoryUsagePercent - 60) * 1.5;
        }

        // Disco: -2 pontos por % acima de 70
        if (health.diskUsagePercent > 70) {
            score -= (health.diskUsagePercent - 70) * 2;
        }

        // Downloads ativos: -10 por download
        score -= health.activeDownloads * 10;

        // Encodes ativos: -15 por encode
        score -= health.activeEncodes * 15;

        // Viewers: -2 por viewer acima de 3
        if (health.activeViewers > 3) {
            score -= (health.activeViewers - 3) * 2;
        }

        // Falhas recentes: -5 por falha
        score -= health.recentFailures * 5;

        // TTFF penalty: -5 pontos por cada 500ms acima do healthy
        if (health.avgTTFF > CONFIG.TTFF_HEALTHY_MS) {
            const extra = health.avgTTFF - CONFIG.TTFF_HEALTHY_MS;
            score -= Math.floor(extra / 500) * 5;
        }

        // Off-peak bonus: +15
        if (health.isOffPeak) {
            score += 15;
        }

        // 📉 UEV Variance Penalty: Se o TTFF médio está instável, penalizamos a saúde geral
        if (health.avgTTFF > CONFIG.TTFF_DEGRADED_MS) {
            score -= 10;
        }

        const finalScore = Math.max(0, Math.min(100, Math.round(score)));

        // 📈 EWMA Smoothing: Evitar oscilação frenética
        this.smoothedScore = (finalScore * this.DAMPING_FACTOR) + (this.smoothedScore * (1 - this.DAMPING_FACTOR));

        return finalScore;
    }

    // ==========================================
    // 📡 COLETORES DE MÉTRICAS
    // ==========================================

    private async getCpuUsage(): Promise<number> {
        const cpus = os.cpus();
        const totalIdle = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0);
        const totalTick = cpus.reduce((acc, cpu) => acc + Object.values(cpu.times).reduce((a, b) => a + b, 0), 0);
        return ((1 - totalIdle / totalTick) * 100);
    }

    private getMemoryUsage(): number {
        const total = os.totalmem();
        const free = os.freemem();
        return ((total - free) / total) * 100;
    }

    private async getActiveDownloads(): Promise<number> {
        try {
            const count = await (prisma as any).episode.count({
                where: { status: 'DOWNLOADING' },
            });
            return count + this.activeDownloadCount;
        } catch {
            return this.activeDownloadCount;
        }
    }

    private async getActiveEncodes(): Promise<number> {
        try {
            const count = await (prisma as any).video.count({
                where: { status: 'PROCESSING' },
            });
            return count + this.activeEncodeCount;
        } catch {
            return this.activeEncodeCount;
        }
    }

    private async getDiskStats(): Promise<{ freeMB: number; usagePercent: number }> {
        try {
            // No Windows (e outros), usaremos uma abordagem simplista ou fs.statfs se disponível
            // Como estamos em Node.js genérico, vamos tentar simular ou focar em caminhos conhecidos
            const stats = fs.statfsSync(process.cwd());
            const free = (stats.bavail * stats.bsize) / (1024 * 1024);
            const total = (stats.blocks * stats.bsize) / (1024 * 1024);
            const usage = ((total - free) / total) * 100;

            return { freeMB: Math.round(free), usagePercent: Math.round(usage) };
        } catch {
            // Fallback se statfs não existir no OS (ex: Windows antigo)
            return { freeMB: 10000, usagePercent: 50 };
        }
    }

    // ==========================================
    // 📡 TRACKING DE ESTADO
    // ==========================================

    /** Registrar um viewer ativo em um conteúdo específico */
    registerViewer(userId: string, episodeId?: string): void {
        this.activeViewers.add(userId);

        if (episodeId) {
            if (!this.episodeViewers.has(episodeId)) {
                this.episodeViewers.set(episodeId, new Set());
            }
            this.episodeViewers.get(episodeId)?.add(userId);
            console.log(`📡 [Swarm] Episode ${episodeId} has ${this.episodeViewers.get(episodeId)?.size} viewers`);
        }
    }

    /** Remover um viewer de todos os mapeamentos */
    unregisterViewer(userId: string): void {
        this.activeViewers.delete(userId);

        for (const [epId, viewers] of this.episodeViewers.entries()) {
            if (viewers.has(userId)) {
                viewers.delete(userId);
                if (viewers.size === 0) {
                    this.episodeViewers.delete(epId);
                }
            }
        }
    }

    /** 🛡️ Verifica se o episódio está em estado de ACTIVE_SWARM (Viewers >= 3) */
    isEpisodeInActiveSwarm(episodeId: string): boolean {
        const count = this.episodeViewers.get(episodeId)?.size || 0;
        return count >= 3;
    }

    /** Retorna os episódios mais assistidos agora */
    getActiveSwarms(): { episodeId: string; count: number }[] {
        const swarms: { episodeId: string; count: number }[] = [];
        for (const [episodeId, viewers] of this.episodeViewers.entries()) {
            swarms.push({ episodeId, count: viewers.size });
        }
        return swarms.sort((a, b) => b.count - a.count);
    }

    /** Registrar uma falha de download */
    registerFailure(episodeId: string): void {
        this.recentFailures.push({ timestamp: Date.now(), episodeId });
        // Limpar falhas antigas (> 30 min)
        this.recentFailures = this.recentFailures.filter(
            f => Date.now() - f.timestamp < 30 * 60 * 1000
        );
    }

    /** Registrar métrica de TTFF com contexto */
    registerTTFF(ms: number, isLocal: boolean): void {
        // Se for Local, usamos para medir performance de disco/governor
        // Se for Remote, usamos para medir latência de rede/prefetch
        this.recentTTFF.push(ms);
        if (this.recentTTFF.length > 50) {
            this.recentTTFF.shift();
        }
    }

    /** Atualizar contagem de downloads ativos */
    setActiveDownloads(count: number): void {
        this.activeDownloadCount = count;
    }

    /** Atualizar contagem de encodes ativos */
    setActiveEncodes(count: number): void {
        this.activeEncodeCount = count;
    }

    /** Retornar número de viewers ativos */
    getActiveViewerCount(): number {
        return this.activeViewers.size;
    }

    // ==========================================
    // 🧠 AUTO-HEALER LOGIC
    // ==========================================

    private async runAutoHealerCycle() {
        const uev = await ConsumptionAnalytics.getExperienceMetrics();
        this.lastUEVVariance = uev.ttffVariance || 0;
        const currentConcurrency = this.activeViewers.size || 0;

        // 1. Detectar Entrada (Trigger)
        if (uev.uevStatus === 'HIGH_INEQUALITY' && !this.isStabilizing) {
            console.log(`🛡️ [AutoHealer] Pain Threshold Reached: ${currentConcurrency} viewers (Variance: ${uev.ttffVariance}ms)`);
            this.isStabilizing = true;
            this.stabilizationStartTime = Date.now();
            this.painThreshold = currentConcurrency;
            // O Elastic Limit é o que vínhamos aguentando com sucesso
            this.elasticLimit = Math.max(this.elasticLimit, currentConcurrency - 1);
        }

        // 2. Tentar Sair (Recovery with Oscillation Protection)
        else if (this.isStabilizing) {
            const duration = Date.now() - this.stabilizationStartTime;
            const isCooldownOver = duration > CONFIG.STABILIZATION_COOLDOWN_MS;
            const isUEVHealthy = uev.ttffVariance < CONFIG.HYSTERESIS_UEV_THRESHOLD;

            if (isCooldownOver && isUEVHealthy) {
                console.log(`🛡️ [AutoHealer] System balanced (Variance: ${uev.ttffVariance || 0}ms). RT: ${(duration / 1000).toFixed(1)}s`);
                this.isStabilizing = false;
                this.lastStabilizationEndTime = Date.now();

                // Track RT
                this.totalRecoveryTime += duration;
                this.recoveryCount++;
            }
        }

        this.lastUEVStatus = uev.uevStatus as 'STABLE' | 'HIGH_INEQUALITY';
    }

    getRecoveryMetrics() {
        return {
            isStabilizing: this.isStabilizing,
            avgRT: this.recoveryCount > 0 ? Math.round(this.totalRecoveryTime / this.recoveryCount) : 0,
            status: this.isStabilizing ? 'RECOVERING' : 'STABLE',
            elasticLimit: this.elasticLimit,
            painThreshold: this.painThreshold,
            currentConcurrency: this.activeViewers.size,
            sustainableConcurrency: Math.floor(this.elasticLimit * 0.9) // SC (Safe Margin)
        };
    }
}

// Singleton
export const DownloadGovernor = new DownloadGovernorService();
