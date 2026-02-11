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
}

class SystemTelemetryService {
    private startTime: number = Date.now();
    private activeDownloads: number = 0;
    private successCount: number = 0;
    private failureCount: number = 0;
    private retryCount: number = 0; // Quantas vezes o sistema "se salvou"
    private zombieCount: number = 0;
    private totalDownloadTimeMs: number = 0;

    // Métodos de Ação
    public trackDownloadStart() { this.activeDownloads++; }

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
        this.retryCount++; // Um retry é uma falha EVITADA, aumenta a confiança no sistema
    }

    public trackZombieRecovery(count: number = 1) {
        this.zombieCount += count;
    }

    public getSnapshot(): TelemetrySnapshot {
        // Cálculo de Saúde (Health Score) - A Mágica Industrial
        // Base 100
        // -5 por falha definitiva (inaceitável)
        // -2 por zumbi (recuperado, mas indica crash anterior)
        // +1 por retry (sistema resiliente atuou com sucesso)
        // +0.1 por sucesso (bonus de estabilidade contínua)

        let score = 100;
        score -= (this.failureCount * 5);
        score -= (this.zombieCount * 2);
        score += (this.retryCount * 1);
        score += (this.successCount * 0.1);

        // Penalidade por uptime baixo demais (instabilidade de reboot loop)
        const uptimeSec = (Date.now() - this.startTime) / 1000;
        if (uptimeSec < 60 && this.zombieCount > 0) {
            score -= 10; // Boot com zumbis = crash recente
        }

        // Clamp 0-100
        score = Math.min(100, Math.max(0, score));

        let status: TelemetrySnapshot['status'] = 'EXCELLENT';
        if (score < 90) status = 'GOOD';
        if (score < 70) status = 'DEGRADED';
        if (score < 50) status = 'CRITICAL';

        return {
            uptime: Math.floor(uptimeSec),
            activeDownloads: this.activeDownloads,
            totalSuccess: this.successCount,
            totalFailures: this.failureCount,
            totalRetries: this.retryCount,
            zombiesRecovered: this.zombieCount,
            avgDownloadTimeMs: this.successCount > 0 ? Math.round(this.totalDownloadTimeMs / this.successCount) : 0,
            healthScore: Math.round(score),
            status
        };
    }
}

export const SystemTelemetry = new SystemTelemetryService();
