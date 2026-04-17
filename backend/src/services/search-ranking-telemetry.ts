import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type RankingSample = {
    query: string;
    title: string;
    action: 'kept' | 'discarded';
    reason: string;
    relevanceScore?: number;
    titleSimilarity?: number;
    seeds?: number;
    peers?: number;
    source?: string;
    recordedAt: string;
};

type SourceAdaptivePolicy = {
    source: string;
    samples: number;
    keepRate: number;
    discardRate: number;
    minSeeds: number;
    minTitleSimilarity: number;
    cooldown: boolean;
    cooldownUntil: number | null;
    cooldownReason: string | null;
};

class SearchRankingTelemetryService {
    private discardReasons = new Map<string, number>();
    private keepReasons = new Map<string, number>();
    private samples: RankingSample[] = [];
    private readonly maxSamples = 120;
    private hydrated = false;
    private persistTimer: ReturnType<typeof setTimeout> | null = null;

    private async hydrateIfNeeded() {
        if (this.hydrated) return;
        this.hydrated = true;

        try {
            const row = await (prisma as any).systemStats.findUnique({
                where: { key: 'search-ranking:telemetry:v1' },
            });
            if (!row?.valueString) return;

            const parsed = JSON.parse(row.valueString);
            this.discardReasons = new Map(Object.entries(parsed?.discardReasons || {}));
            this.keepReasons = new Map(Object.entries(parsed?.keepReasons || {}));
            this.samples = Array.isArray(parsed?.samples) ? parsed.samples.slice(-this.maxSamples) : [];
        } catch {
            // persistence is opportunistic
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
        try {
            await (prisma as any).systemStats.upsert({
                where: { key: 'search-ranking:telemetry:v1' },
                update: {
                    valueString: JSON.stringify({
                        discardReasons: Object.fromEntries(this.discardReasons.entries()),
                        keepReasons: Object.fromEntries(this.keepReasons.entries()),
                        samples: this.samples.slice(-this.maxSamples),
                    }),
                    updatedAt: new Date(),
                },
                create: {
                    key: 'search-ranking:telemetry:v1',
                    valueString: JSON.stringify({
                        discardReasons: Object.fromEntries(this.discardReasons.entries()),
                        keepReasons: Object.fromEntries(this.keepReasons.entries()),
                        samples: this.samples.slice(-this.maxSamples),
                    }),
                    updatedAt: new Date(),
                },
            });
        } catch {
            // persistence is opportunistic
        }
    }

    private bump(map: Map<string, number>, key: string) {
        map.set(key, (map.get(key) || 0) + 1);
    }

    recordDiscard(sample: Omit<RankingSample, 'action' | 'recordedAt'>) {
        this.hydrateIfNeeded().catch(() => {
            // ignore hydration failures
        });
        this.bump(this.discardReasons, sample.reason);
        this.samples.push({
            ...sample,
            action: 'discarded',
            recordedAt: new Date().toISOString(),
        });
        if (this.samples.length > this.maxSamples) {
            this.samples = this.samples.slice(-this.maxSamples);
        }
        this.schedulePersist();
    }

    recordKeep(sample: Omit<RankingSample, 'action' | 'recordedAt'>) {
        this.hydrateIfNeeded().catch(() => {
            // ignore hydration failures
        });
        this.bump(this.keepReasons, sample.reason);
        this.samples.push({
            ...sample,
            action: 'kept',
            recordedAt: new Date().toISOString(),
        });
        if (this.samples.length > this.maxSamples) {
            this.samples = this.samples.slice(-this.maxSamples);
        }
        this.schedulePersist();
    }

    async getSnapshot(limit: number = 20) {
        await this.hydrateIfNeeded();
        const take = Math.max(1, Math.min(100, Number(limit || 20)));
        return {
            discardReasons: Object.fromEntries(this.discardReasons.entries()),
            keepReasons: Object.fromEntries(this.keepReasons.entries()),
            adaptivePolicies: this.getAdaptivePolicies(),
            recentSamples: this.samples.slice(-take).reverse(),
        };
    }

    getAdaptivePolicies(limit: number = 12): SourceAdaptivePolicy[] {
        const bySource = new Map<string, RankingSample[]>();
        for (const sample of this.samples) {
            const source = String(sample.source || 'unknown').trim() || 'unknown';
            const current = bySource.get(source) || [];
            current.push(sample);
            bySource.set(source, current);
        }

        const policies = Array.from(bySource.entries()).map(([source, samples]) => {
            const kept = samples.filter((sample) => sample.action === 'kept');
            const discarded = samples.filter((sample) => sample.action === 'discarded');
            const keepRate = kept.length / Math.max(1, samples.length);
            const discardRate = discarded.length / Math.max(1, samples.length);
            const avgKeptSeeds = kept.length
                ? kept.reduce((sum, sample) => sum + Number(sample.seeds || 0), 0) / kept.length
                : 0;
            const avgDiscardedSimilarity = discarded
                .filter((sample) => Number.isFinite(sample.titleSimilarity))
                .reduce((sum, sample, _index, arr) => sum + Number(sample.titleSimilarity || 0) / Math.max(1, arr.length), 0);

            const minSeeds = keepRate < 0.25
                ? Math.max(4, Math.round(avgKeptSeeds || 4))
                : keepRate > 0.7
                    ? 2
                    : 3;
            const minTitleSimilarity = discardRate > 0.65
                ? 0.4
                : avgDiscardedSimilarity > 0
                    ? Math.max(0.28, Math.min(0.42, avgDiscardedSimilarity + 0.04))
                    : 0.32;
            const shouldCooldown = samples.length >= 8 && (discardRate >= 0.85 || (discardRate >= 0.7 && keepRate <= 0.15));
            const cooldownUntil = shouldCooldown ? Date.now() + (10 * 60 * 1000) : null;
            const cooldownReason = shouldCooldown
                ? discardRate >= 0.85
                    ? 'high-discard-rate'
                    : 'low-keep-rate'
                : null;

            return {
                source,
                samples: samples.length,
                keepRate: Number((keepRate * 100).toFixed(1)),
                discardRate: Number((discardRate * 100).toFixed(1)),
                minSeeds,
                minTitleSimilarity: Number(minTitleSimilarity.toFixed(3)),
                cooldown: shouldCooldown,
                cooldownUntil,
                cooldownReason,
            };
        });

        return policies
            .sort((a, b) => b.samples - a.samples)
            .slice(0, Math.max(1, Math.min(50, Number(limit || 12))));
    }

    async getAdaptivePolicyForSource(source?: string | null) {
        await this.hydrateIfNeeded();
        const normalized = String(source || 'unknown').trim() || 'unknown';
        return this.getAdaptivePolicies(50).find((policy) => policy.source === normalized) || {
            source: normalized,
            samples: 0,
            keepRate: 0,
            discardRate: 0,
            minSeeds: 3,
            minTitleSimilarity: 0.32,
            cooldown: false,
            cooldownUntil: null,
            cooldownReason: null,
        };
    }

    async isSourceCoolingDown(source?: string | null) {
        const policy = await this.getAdaptivePolicyForSource(source);
        return {
            coolingDown: Boolean(policy.cooldown && policy.cooldownUntil && policy.cooldownUntil > Date.now()),
            cooldownUntil: policy.cooldownUntil,
            reason: policy.cooldownReason,
            policy,
        };
    }
}

export const SearchRankingTelemetry = new SearchRankingTelemetryService();
