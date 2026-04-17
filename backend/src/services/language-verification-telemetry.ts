import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type VerificationSample = {
    videoId: string;
    title: string;
    source: string;
    primaryAudioLanguage: string | null;
    primarySubtitleLanguage: string | null;
    portugueseAudioConfidence: number;
    portugueseSubtitleConfidence: number;
    dubbedConfidence: number;
    subtitleConfidence: number;
    recordedAt: string;
};

class LanguageVerificationTelemetryService {
    private hydrated = false;
    private samples: VerificationSample[] = [];
    private readonly maxSamples = 120;
    private persistTimer: ReturnType<typeof setTimeout> | null = null;

    private async hydrateIfNeeded() {
        if (this.hydrated) return;
        this.hydrated = true;

        try {
            const row = await (prisma as any).systemStats.findUnique({
                where: { key: 'language-verification:telemetry:v1' },
            });
            if (!row?.valueString) return;
            const parsed = JSON.parse(row.valueString);
            this.samples = Array.isArray(parsed?.samples) ? parsed.samples.slice(-this.maxSamples) : [];
        } catch {
            // opportunistic hydration
        }
    }

    private schedulePersist() {
        if (this.persistTimer) return;
        this.persistTimer = setTimeout(() => {
            this.persistTimer = null;
            this.persist().catch(() => {
                // ignore persistence failures
            });
        }, 1500);
    }

    private async persist() {
        const payload = JSON.stringify({
            samples: this.samples.slice(-this.maxSamples),
        });

        await (prisma as any).systemStats.upsert({
            where: { key: 'language-verification:telemetry:v1' },
            update: {
                valueString: payload,
                updatedAt: new Date(),
            },
            create: {
                key: 'language-verification:telemetry:v1',
                valueString: payload,
                updatedAt: new Date(),
            },
        });
    }

    async record(sample: Omit<VerificationSample, 'recordedAt'>) {
        await this.hydrateIfNeeded();
        this.samples.push({
            ...sample,
            recordedAt: new Date().toISOString(),
        });
        if (this.samples.length > this.maxSamples) {
            this.samples = this.samples.slice(-this.maxSamples);
        }
        this.schedulePersist();
    }

    async getSnapshot(limit: number = 20) {
        await this.hydrateIfNeeded();
        const recentSamples = this.samples.slice(-Math.max(1, Math.min(100, limit))).reverse();
        const totals = this.samples.reduce((acc, sample) => {
            if (sample.portugueseAudioConfidence >= 0.6) acc.audioPtBrConfirmed += 1;
            if (sample.portugueseSubtitleConfidence >= 0.55) acc.subtitlePtBrConfirmed += 1;
            if ((sample.portugueseAudioConfidence < 0.4) && (sample.portugueseSubtitleConfidence < 0.4)) acc.noPtBrSignal += 1;
            return acc;
        }, {
            samples: this.samples.length,
            audioPtBrConfirmed: 0,
            subtitlePtBrConfirmed: 0,
            noPtBrSignal: 0,
        });

        const bySource = new Map<string, VerificationSample[]>();
        for (const sample of this.samples) {
            const source = String(sample.source || 'unknown');
            const current = bySource.get(source) || [];
            current.push(sample);
            bySource.set(source, current);
        }

        const sources = Array.from(bySource.entries()).map(([source, samples]) => ({
            source,
            samples: samples.length,
            audioPtBrRate: Number(((samples.filter((sample) => sample.portugueseAudioConfidence >= 0.6).length / Math.max(1, samples.length)) * 100).toFixed(1)),
            subtitlePtBrRate: Number(((samples.filter((sample) => sample.portugueseSubtitleConfidence >= 0.55).length / Math.max(1, samples.length)) * 100).toFixed(1)),
            avgDubbedConfidence: Number((samples.reduce((sum, sample) => sum + sample.dubbedConfidence, 0) / Math.max(1, samples.length)).toFixed(3)),
        })).sort((a, b) => b.samples - a.samples);

        return {
            totals,
            sources,
            recentSamples,
        };
    }
}

export const LanguageVerificationTelemetry = new LanguageVerificationTelemetryService();
