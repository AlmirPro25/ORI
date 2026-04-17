export interface TelemetrySnapshot {
    uptime: number;
    activeDownloads: number;
    totalSuccess: number;
    totalFailures: number;
    totalRetries: number;
    zombiesRecovered: number;
    avgDownloadTimeMs: number;
    healthScore: number;
    status: 'EXCELLENT' | 'GOOD' | 'DEGRADED' | 'CRITICAL';
    process: {
        rssMb: number;
        heapUsedMb: number;
        heapTotalMb: number;
        externalMb: number;
    };
    externalRequests: {
        total: number;
        failures: number;
        inFlight: number;
        avgLatencyMs: number;
        lastError: string | null;
        services: Array<{
            service: string;
            total: number;
            failures: number;
            retries: number;
            avgLatencyMs: number;
            consecutiveFailures: number;
            circuitOpen: boolean;
            circuitOpenUntil: number | null;
            lastError: string | null;
        }>;
    };
    rateLimits: {
        totalBlocked: number;
        routes: Array<{
            route: string;
            blocked: number;
            lastBlockedAt: number | null;
        }>;
    };
    queueProtection: {
        busyBackoffs: number;
        serializedSkips: number;
        rarityBoostsApplied: number;
        lastBusyBackoffAt: number | null;
        lastSerializedSkipAt: number | null;
        lastRarityBoostAt: number | null;
        recentWindowMs: number;
        recent: {
            busyBackoffs: number;
            serializedSkips: number;
            rarityBoostsApplied: number;
        };
    };
}

type ExternalServiceStats = {
    total: number;
    failures: number;
    retries: number;
    inFlight: number;
    totalLatencyMs: number;
    lastError: string | null;
    consecutiveFailures: number;
    circuitOpenUntil: number | null;
};

class SystemTelemetryService {
    private static readonly QUEUE_WINDOW_MS = 5 * 60 * 1000;
    private startTime: number = Date.now();
    private activeDownloads: number = 0;
    private successCount: number = 0;
    private failureCount: number = 0;
    private retryCount: number = 0;
    private zombieCount: number = 0;
    private totalDownloadTimeMs: number = 0;
    private externalRequestsTotal: number = 0;
    private externalRequestFailures: number = 0;
    private externalRequestLatencyMs: number = 0;
    private externalRequestsInFlight: number = 0;
    private externalLastError: string | null = null;
    private externalServices = new Map<string, ExternalServiceStats>();
    private rateLimitBlocksTotal: number = 0;
    private rateLimitBlocks = new Map<string, { blocked: number; lastBlockedAt: number | null }>();
    private queueBusyBackoffs: number = 0;
    private queueSerializedSkips: number = 0;
    private queueRarityBoostsApplied: number = 0;
    private lastQueueBusyBackoffAt: number | null = null;
    private lastQueueSerializedSkipAt: number | null = null;
    private lastQueueRarityBoostAt: number | null = null;
    private queueBusyBackoffEvents: number[] = [];
    private queueSerializedSkipEvents: number[] = [];
    private queueRarityBoostEvents: number[] = [];

    private recordQueueEvent(store: number[]) {
        const now = Date.now();
        store.push(now);
        const threshold = now - SystemTelemetryService.QUEUE_WINDOW_MS;
        while (store.length > 0 && store[0] < threshold) {
            store.shift();
        }
    }

    private getRecentQueueEventCount(store: number[]) {
        const threshold = Date.now() - SystemTelemetryService.QUEUE_WINDOW_MS;
        let startIndex = 0;
        while (startIndex < store.length && store[startIndex] < threshold) {
            startIndex++;
        }
        if (startIndex > 0) {
            store.splice(0, startIndex);
        }
        return store.length;
    }

    private getOrCreateServiceStats(service: string) {
        const existing = this.externalServices.get(service);
        if (existing) return existing;

        const initialState: ExternalServiceStats = {
            total: 0,
            failures: 0,
            retries: 0,
            inFlight: 0,
            totalLatencyMs: 0,
            lastError: null,
            consecutiveFailures: 0,
            circuitOpenUntil: null,
        };

        this.externalServices.set(service, initialState);
        return initialState;
    }

    public trackDownloadStart() {
        this.activeDownloads++;
    }

    public trackDownloadSuccess(durationMs: number) {
        this.activeDownloads = Math.max(0, this.activeDownloads - 1);
        this.successCount++;
        this.totalDownloadTimeMs += durationMs;
    }

    public trackDownloadFail() {
        this.activeDownloads = Math.max(0, this.activeDownloads - 1);
        this.failureCount++;
    }

    public trackRetry() {
        this.retryCount++;
    }

    public trackExternalRequestStart(service: string, _method: string) {
        const stats = this.getOrCreateServiceStats(service);
        this.externalRequestsTotal++;
        this.externalRequestsInFlight++;
        stats.total++;
        stats.inFlight++;
    }

    public trackExternalRequestSuccess(service: string, durationMs: number, _statusCode: number) {
        const stats = this.getOrCreateServiceStats(service);
        this.externalRequestLatencyMs += durationMs;
        this.externalRequestsInFlight = Math.max(0, this.externalRequestsInFlight - 1);
        stats.inFlight = Math.max(0, stats.inFlight - 1);
        stats.totalLatencyMs += durationMs;
        stats.consecutiveFailures = 0;
        stats.circuitOpenUntil = null;
    }

    public trackExternalRequestFailure(service: string, durationMs: number, errorMessage: string, retried: boolean) {
        const stats = this.getOrCreateServiceStats(service);
        this.externalRequestFailures++;
        this.externalRequestLatencyMs += durationMs;
        this.externalRequestsInFlight = Math.max(0, this.externalRequestsInFlight - 1);
        this.externalLastError = `${service}: ${errorMessage}`;
        stats.failures++;
        stats.inFlight = Math.max(0, stats.inFlight - 1);
        stats.totalLatencyMs += durationMs;
        stats.lastError = errorMessage;
        stats.consecutiveFailures += 1;

        if (retried) {
            stats.retries++;
        }
    }

    public trackCircuitOpen(service: string, waitMs: number) {
        const stats = this.getOrCreateServiceStats(service);
        stats.circuitOpenUntil = Date.now() + waitMs;
        stats.lastError = `Circuit open for ${waitMs}ms`;
    }

    public trackZombieRecovery(count: number = 1) {
        this.zombieCount += count;
    }

    public trackRateLimitBlock(route: string) {
        this.rateLimitBlocksTotal++;
        const current = this.rateLimitBlocks.get(route) || { blocked: 0, lastBlockedAt: null };
        current.blocked += 1;
        current.lastBlockedAt = Date.now();
        this.rateLimitBlocks.set(route, current);
    }

    public trackQueueBusyBackoff() {
        this.queueBusyBackoffs++;
        this.lastQueueBusyBackoffAt = Date.now();
        this.recordQueueEvent(this.queueBusyBackoffEvents);
    }

    public trackQueueSerializedSkip() {
        this.queueSerializedSkips++;
        this.lastQueueSerializedSkipAt = Date.now();
        this.recordQueueEvent(this.queueSerializedSkipEvents);
    }

    public trackQueueRarityBoostApplied() {
        this.queueRarityBoostsApplied++;
        this.lastQueueRarityBoostAt = Date.now();
        this.recordQueueEvent(this.queueRarityBoostEvents);
    }

    public getSnapshot(): TelemetrySnapshot {
        let score = 100;
        score -= this.failureCount * 5;
        score -= this.zombieCount * 2;
        score += this.retryCount * 1;
        score += this.successCount * 0.1;
        score -= Math.min(20, this.externalRequestFailures * 0.5);

        const uptimeSec = (Date.now() - this.startTime) / 1000;
        if (uptimeSec < 60 && this.zombieCount > 0) {
            score -= 10;
        }

        score = Math.min(100, Math.max(0, score));

        let status: TelemetrySnapshot['status'] = 'EXCELLENT';
        if (score < 90) status = 'GOOD';
        if (score < 70) status = 'DEGRADED';
        if (score < 50) status = 'CRITICAL';

        const memory = process.memoryUsage();
        const services = Array.from(this.externalServices.entries())
            .map(([service, stats]) => ({
                service,
                total: stats.total,
                failures: stats.failures,
                retries: stats.retries,
                avgLatencyMs: stats.total > 0 ? Math.round(stats.totalLatencyMs / stats.total) : 0,
                consecutiveFailures: stats.consecutiveFailures,
                circuitOpen: !!stats.circuitOpenUntil && stats.circuitOpenUntil > Date.now(),
                circuitOpenUntil: stats.circuitOpenUntil,
                lastError: stats.lastError,
            }))
            .sort((a, b) => b.failures - a.failures || b.total - a.total);

        return {
            uptime: Math.floor(uptimeSec),
            activeDownloads: this.activeDownloads,
            totalSuccess: this.successCount,
            totalFailures: this.failureCount,
            totalRetries: this.retryCount,
            zombiesRecovered: this.zombieCount,
            avgDownloadTimeMs: this.successCount > 0 ? Math.round(this.totalDownloadTimeMs / this.successCount) : 0,
            healthScore: Math.round(score),
            status,
            process: {
                rssMb: Math.round((memory.rss / 1024 / 1024) * 10) / 10,
                heapUsedMb: Math.round((memory.heapUsed / 1024 / 1024) * 10) / 10,
                heapTotalMb: Math.round((memory.heapTotal / 1024 / 1024) * 10) / 10,
                externalMb: Math.round((memory.external / 1024 / 1024) * 10) / 10,
            },
            externalRequests: {
                total: this.externalRequestsTotal,
                failures: this.externalRequestFailures,
                inFlight: this.externalRequestsInFlight,
                avgLatencyMs: this.externalRequestsTotal > 0 ? Math.round(this.externalRequestLatencyMs / this.externalRequestsTotal) : 0,
                lastError: this.externalLastError,
                services,
            },
            rateLimits: {
                totalBlocked: this.rateLimitBlocksTotal,
                routes: Array.from(this.rateLimitBlocks.entries())
                    .map(([route, stats]) => ({
                        route,
                        blocked: stats.blocked,
                        lastBlockedAt: stats.lastBlockedAt,
                    }))
                    .sort((a, b) => b.blocked - a.blocked),
            },
            queueProtection: {
                busyBackoffs: this.queueBusyBackoffs,
                serializedSkips: this.queueSerializedSkips,
                rarityBoostsApplied: this.queueRarityBoostsApplied,
                lastBusyBackoffAt: this.lastQueueBusyBackoffAt,
                lastSerializedSkipAt: this.lastQueueSerializedSkipAt,
                lastRarityBoostAt: this.lastQueueRarityBoostAt,
                recentWindowMs: SystemTelemetryService.QUEUE_WINDOW_MS,
                recent: {
                    busyBackoffs: this.getRecentQueueEventCount(this.queueBusyBackoffEvents),
                    serializedSkips: this.getRecentQueueEventCount(this.queueSerializedSkipEvents),
                    rarityBoostsApplied: this.getRecentQueueEventCount(this.queueRarityBoostEvents),
                },
            },
        };
    }
}

export const SystemTelemetry = new SystemTelemetryService();
