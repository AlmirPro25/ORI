import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type VideoSelectionSample = {
    videoId: string;
    selectedFile: string;
    selectedScore: number;
    selectedReasons: string[];
    sourceTorrentName?: string | null;
    seasonNumber?: number | null;
    episodeNumber?: number | null;
    topCandidates: Array<{
        file: string;
        score: number;
        reasons: string[];
    }>;
    outcome?: 'selected' | 'completed' | 'fallback' | 'retry' | 'failed';
    outcomeDetail?: string | null;
    verifiedPortugueseAudio?: boolean;
    verifiedPortugueseSubtitle?: boolean;
    recordedAt: string;
};

class VideoSelectionTelemetryService {
    private hydrated = false;
    private samples: VideoSelectionSample[] = [];
    private readonly maxSamples = 120;
    private persistTimer: ReturnType<typeof setTimeout> | null = null;

    private async hydrateIfNeeded() {
        if (this.hydrated) return;
        this.hydrated = true;

        try {
            const row = await (prisma as any).systemStats.findUnique({
                where: { key: 'video-selection:telemetry:v1' },
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
            where: { key: 'video-selection:telemetry:v1' },
            update: {
                valueString: payload,
                updatedAt: new Date(),
            },
            create: {
                key: 'video-selection:telemetry:v1',
                valueString: payload,
                updatedAt: new Date(),
            },
        });
    }

    async record(sample: Omit<VideoSelectionSample, 'recordedAt'>) {
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

    async markOutcome(videoId: string, outcome: NonNullable<VideoSelectionSample['outcome']>, outcomeDetail?: string | null) {
        await this.hydrateIfNeeded();

        for (let index = this.samples.length - 1; index >= 0; index -= 1) {
            if (this.samples[index]?.videoId === videoId) {
                this.samples[index] = {
                    ...this.samples[index],
                    outcome,
                    outcomeDetail: outcomeDetail || null,
                };
                this.schedulePersist();
                return;
            }
        }
    }

    async markVerification(videoId: string, verification: {
        hasPortugueseAudio: boolean;
        hasPortugueseSubtitle: boolean;
    }) {
        await this.hydrateIfNeeded();

        for (let index = this.samples.length - 1; index >= 0; index -= 1) {
            if (this.samples[index]?.videoId === videoId) {
                this.samples[index] = {
                    ...this.samples[index],
                    verifiedPortugueseAudio: verification.hasPortugueseAudio,
                    verifiedPortugueseSubtitle: verification.hasPortugueseSubtitle,
                };
                this.schedulePersist();
                return;
            }
        }
    }

    async getSnapshot(options?: { limit?: number; videoId?: string | null }) {
        await this.hydrateIfNeeded();
        const take = Math.max(1, Math.min(100, Number(options?.limit || 20)));
        const filteredSamples = options?.videoId
            ? this.samples.filter((sample) => sample.videoId === options.videoId)
            : this.samples;
        const recentSamples = filteredSamples.slice(-take).reverse();
        const outcomes = filteredSamples.reduce((acc, sample) => {
            const key = String(sample.outcome || 'selected');
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const byVideo = new Map<string, VideoSelectionSample[]>();
        for (const sample of filteredSamples) {
            const current = byVideo.get(sample.videoId) || [];
            current.push(sample);
            byVideo.set(sample.videoId, current);
        }

        const videos = Array.from(byVideo.entries()).map(([videoId, samples]) => ({
            videoId,
            samples: samples.length,
            latestSelectedFile: samples[samples.length - 1]?.selectedFile || null,
            avgSelectedScore: Number((samples.reduce((sum, sample) => sum + Number(sample.selectedScore || 0), 0) / Math.max(1, samples.length)).toFixed(2)),
            completed: samples.filter((sample) => sample.outcome === 'completed').length,
            failed: samples.filter((sample) => sample.outcome === 'failed').length,
            fallbacks: samples.filter((sample) => sample.outcome === 'fallback').length,
            verifiedPtBrAudio: samples.filter((sample) => sample.verifiedPortugueseAudio).length,
            verifiedPtBrSubtitle: samples.filter((sample) => sample.verifiedPortugueseSubtitle).length,
        })).sort((a, b) => b.samples - a.samples);

        return {
            totals: {
                samples: filteredSamples.length,
                uniqueVideos: byVideo.size,
                outcomes,
            },
            adaptivePatterns: await this.getAdaptivePatternPolicies(),
            videos,
            recentSamples,
        };
    }

    async getAdaptivePatternPolicies() {
        await this.hydrateIfNeeded();
        const patternMap = new Map<string, VideoSelectionSample[]>();

        for (const sample of this.samples) {
            for (const pattern of extractSelectionPatterns(sample.selectedFile)) {
                const current = patternMap.get(pattern) || [];
                current.push(sample);
                patternMap.set(pattern, current);
            }
        }

        return Array.from(patternMap.entries()).map(([pattern, samples]) => {
            const completed = samples.filter((sample) => sample.outcome === 'completed').length;
            const fallback = samples.filter((sample) => sample.outcome === 'fallback').length;
            const failed = samples.filter((sample) => sample.outcome === 'failed').length;
            const retry = samples.filter((sample) => sample.outcome === 'retry').length;
            const verifiedPtBrAudio = samples.filter((sample) => sample.verifiedPortugueseAudio).length;
            const verifiedPtBrSubtitle = samples.filter((sample) => sample.verifiedPortugueseSubtitle).length;
            const completionRate = completed / Math.max(1, samples.length);
            const fallbackRate = fallback / Math.max(1, samples.length);
            const failedRate = failed / Math.max(1, samples.length);
            const retryRate = retry / Math.max(1, samples.length);
            const audioPtBrRate = verifiedPtBrAudio / Math.max(1, samples.length);
            const subtitlePtBrRate = verifiedPtBrSubtitle / Math.max(1, samples.length);

            let scoreBias = 0;
            if (samples.length >= 3) {
                scoreBias += completionRate * 18;
                scoreBias -= fallbackRate * 12;
                scoreBias -= failedRate * 18;
                scoreBias -= retryRate * 8;
                scoreBias += audioPtBrRate * 10;
                scoreBias += subtitlePtBrRate * 6;
            }

            return {
                pattern,
                samples: samples.length,
                completionRate: Number((completionRate * 100).toFixed(1)),
                fallbackRate: Number((fallbackRate * 100).toFixed(1)),
                failedRate: Number((failedRate * 100).toFixed(1)),
                retryRate: Number((retryRate * 100).toFixed(1)),
                audioPtBrRate: Number((audioPtBrRate * 100).toFixed(1)),
                subtitlePtBrRate: Number((subtitlePtBrRate * 100).toFixed(1)),
                scoreBias: Number(Math.max(-18, Math.min(18, scoreBias)).toFixed(2)),
            };
        }).sort((a, b) => b.samples - a.samples);
    }
}

export const VideoSelectionTelemetry = new VideoSelectionTelemetryService();

function extractSelectionPatterns(filename?: string | null) {
    const normalized = String(filename || '').toLowerCase();
    const patterns = new Set<string>();

    if (/s\d{2}e\d{2}/i.test(normalized)) patterns.add('episode-code:sxxexx');
    if (/\d{1,2}x\d{2}/i.test(normalized)) patterns.add('episode-code:1x01');
    if (/complete season|season pack|temporada completa|collection/i.test(normalized)) patterns.add('shape:season-pack');
    if (/2160|4k/i.test(normalized)) patterns.add('quality:2160p');
    if (/1080/i.test(normalized)) patterns.add('quality:1080p');
    if (/720/i.test(normalized)) patterns.add('quality:720p');
    if (/dual|dublado|pt-br/i.test(normalized)) patterns.add('language:ptbr-signal');
    if (/\.mkv$/i.test(normalized)) patterns.add('container:mkv');
    if (/\.mp4$/i.test(normalized)) patterns.add('container:mp4');

    return Array.from(patterns);
}
