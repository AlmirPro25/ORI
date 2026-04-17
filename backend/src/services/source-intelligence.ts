import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export type SourceCandidate = {
    magnetURI: string;
    sourceSite: string;
    quality?: string | null;
    language?: string | null;
    seeds?: number | null;
    title?: string | null;
    size?: string | null;
};

type ContentReference = {
    title?: string | null;
    originalTitle?: string | null;
    tmdbId?: string | number | null;
    imdbId?: string | number | null;
    preferredQuality?: string | null;
    preferredLanguage?: string | null;
    seasonNumber?: number | null;
    episodeNumber?: number | null;
    networkProfile?: 'stable' | 'degraded' | 'constrained' | 'unknown' | null;
};

type WarmCacheEntry = {
    infoHash?: string | null;
    sourceSite?: string | null;
    quality?: string | null;
    language?: string | null;
    title?: string | null;
    lastValidatedAt?: string | null;
};

type SourceOutcomeStats = {
    sourceSite: string;
    samples: number;
    good: number;
    neutral: number;
    bad: number;
    avgDuration: number;
    avgTtff: number;
    avgBufferEvents: number;
    lastOutcomeAt?: string | null;
};

type SourceVerificationStats = {
    sourceSite: string;
    samples: number;
    verifiedAudioPtBr: number;
    verifiedSubtitlePtBr: number;
    mislabeled: number;
    lastVerifiedAt?: string | null;
};

type RankedSourceCandidate = SourceCandidate & {
    intelligenceScore: number;
    scoreBreakdown: {
        warmStart: number;
        sourceReliability: number;
        quality: number;
        language: number;
        seeds: number;
        titleAffinity: number;
        codec: number;
        recency: number;
    };
};

function normalize(value?: string | number | null) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function extractInfoHash(magnetURI?: string | null) {
    const match = String(magnetURI || '').match(/btih:([a-zA-Z0-9]+)/i);
    return match ? match[1].toLowerCase() : null;
}

function contentKey(ref: ContentReference) {
    const episodeSuffix = Number.isFinite(Number(ref.seasonNumber)) && Number.isFinite(Number(ref.episodeNumber))
        ? `:s${String(Number(ref.seasonNumber)).padStart(2, '0')}e${String(Number(ref.episodeNumber)).padStart(2, '0')}`
        : '';

    if (ref.imdbId) return `imdb:${normalize(ref.imdbId)}${episodeSuffix}`;
    if (ref.tmdbId) return `tmdb:${normalize(ref.tmdbId)}${episodeSuffix}`;
    const titleKey = normalize(ref.originalTitle || ref.title);
    return `title:${titleKey}${episodeSuffix}`;
}

function getContextProfileKey(ref: ContentReference) {
    const networkProfile = normalize(ref.networkProfile || 'unknown') || 'unknown';
    const preferredLanguage = normalize(ref.preferredLanguage || 'und') || 'und';
    const preferredQuality = normalize(ref.preferredQuality || 'unknown') || 'unknown';
    return `net:${networkProfile}|lang:${preferredLanguage}|quality:${preferredQuality}`;
}

function parseCodec(title?: string | null) {
    const haystack = normalize(title);
    if (/\bx265\b|\bhevc\b|\bh\.?265\b/.test(haystack)) return 'x265';
    if (/\bx264\b|\bavc\b|\bh\.?264\b/.test(haystack)) return 'x264';
    return 'unknown';
}

function parseResolution(candidate: SourceCandidate) {
    const haystack = `${candidate.quality || ''} ${candidate.title || ''}`.toLowerCase();
    if (/2160|4k/.test(haystack)) return '2160p';
    if (/1080/.test(haystack)) return '1080p';
    if (/720/.test(haystack)) return '720p';
    if (/480/.test(haystack)) return '480p';
    return 'unknown';
}

function parseAgeDays(title?: string | null) {
    const normalized = normalize(title);
    const dayMatch = normalized.match(/(\d+)\s*(day|days|dia|dias)\b/);
    if (dayMatch) return Number(dayMatch[1] || 0);
    return null;
}

function isGenericObservedSource(source?: string | null) {
    const normalized = normalize(source);
    return !normalized
        || normalized === 'local'
        || normalized === 'remote'
        || normalized === 'cache'
        || normalized === 'p2p'
        || normalized === 'unknown'
        || normalized === 'resolved';
}

function calculateTitleAffinity(ref: ContentReference, candidate: SourceCandidate) {
    const title = normalize(candidate.title);
    const preferredTitles = [ref.title, ref.originalTitle]
        .map(normalize)
        .filter(Boolean);

    let score = 0;
    for (const preferred of preferredTitles) {
        if (title.includes(preferred)) {
            score = Math.max(score, 24);
        } else {
            const preferredTokens = preferred.split(/\s+/).filter(Boolean);
            const matchedTokens = preferredTokens.filter((token) => token.length > 2 && title.includes(token)).length;
            score = Math.max(score, Math.min(18, matchedTokens * 4));
        }
    }

    return score;
}

async function readWarmCache(ref: ContentReference): Promise<WarmCacheEntry | null> {
    try {
        const store = (prisma as any).systemStats;
        if (!store) return null;
        const row = await store.findUnique({
            where: { key: `source-intel:warm:${contentKey(ref)}` },
        });
        if (!row?.valueString) return null;
        return JSON.parse(row.valueString);
    } catch {
        return null;
    }
}

async function writeWarmCache(ref: ContentReference, candidate: SourceCandidate) {
    try {
        const store = (prisma as any).systemStats;
        if (!store) return;
        const payload: WarmCacheEntry = {
            infoHash: extractInfoHash(candidate.magnetURI),
            sourceSite: candidate.sourceSite,
            quality: candidate.quality || null,
            language: candidate.language || null,
            title: candidate.title || null,
            lastValidatedAt: new Date().toISOString(),
        };

        await store.upsert({
            where: { key: `source-intel:warm:${contentKey(ref)}` },
            update: {
                valueString: JSON.stringify(payload),
                updatedAt: new Date(),
            },
            create: {
                key: `source-intel:warm:${contentKey(ref)}`,
                valueString: JSON.stringify(payload),
                updatedAt: new Date(),
            },
        });
    } catch {
        // warm cache is opportunistic
    }
}

async function readOutcomeStats(key: string): Promise<SourceOutcomeStats | null> {
    try {
        const store = (prisma as any).systemStats;
        if (!store) return null;
        const row = await store.findUnique({ where: { key } });
        if (!row?.valueString) return null;
        return JSON.parse(row.valueString);
    } catch {
        return null;
    }
}

async function writeOutcomeStats(key: string, stats: SourceOutcomeStats) {
    try {
        const store = (prisma as any).systemStats;
        if (!store) return;
        await store.upsert({
            where: { key },
            update: {
                valueString: JSON.stringify(stats),
                updatedAt: new Date(),
            },
            create: {
                key,
                valueString: JSON.stringify(stats),
                updatedAt: new Date(),
            },
        });
    } catch {
        // source learning is opportunistic
    }
}

async function readVerificationStats(key: string): Promise<SourceVerificationStats | null> {
    try {
        const store = (prisma as any).systemStats;
        if (!store) return null;
        const row = await store.findUnique({ where: { key } });
        if (!row?.valueString) return null;
        return JSON.parse(row.valueString);
    } catch {
        return null;
    }
}

async function writeVerificationStats(key: string, stats: SourceVerificationStats) {
    try {
        const store = (prisma as any).systemStats;
        if (!store) return;
        await store.upsert({
            where: { key },
            update: {
                valueString: JSON.stringify(stats),
                updatedAt: new Date(),
            },
            create: {
                key,
                valueString: JSON.stringify(stats),
                updatedAt: new Date(),
            },
        });
    } catch {
        // verification learning is opportunistic
    }
}

function buildGlobalOutcomeKey(sourceSite: string) {
    return `source-intel:outcome:global:${normalize(sourceSite)}`;
}

function buildGlobalVerificationKey(sourceSite: string) {
    return `source-intel:verification:global:${normalize(sourceSite)}`;
}

function buildContentOutcomeKey(ref: ContentReference, sourceSite: string) {
    return `source-intel:outcome:${contentKey(ref)}:${normalize(sourceSite)}`;
}

function buildContextOutcomeKey(ref: ContentReference, sourceSite: string) {
    return `source-intel:context:${getContextProfileKey(ref)}:${normalize(sourceSite)}`;
}

function buildContentVerificationKey(ref: ContentReference, sourceSite: string) {
    return `source-intel:verification:${contentKey(ref)}:${normalize(sourceSite)}`;
}

function classifyNetworkProfile(params: {
    ttff?: number | null;
    bufferEvents?: number | null;
    bytesNetwork?: number | null;
    avgBitrate?: number | null;
}) {
    const ttff = Math.max(0, Number(params.ttff || 0));
    const bufferEvents = Math.max(0, Number(params.bufferEvents || 0));
    const bytesNetwork = Math.max(0, Number(params.bytesNetwork || 0));
    const avgBitrate = Math.max(0, Number(params.avgBitrate || 0));

    if (ttff >= 30000 || bufferEvents >= 6) return 'degraded' as const;
    if (ttff >= 12000 || bufferEvents >= 3 || (bytesNetwork > 0 && avgBitrate > 0 && bytesNetwork < avgBitrate * 45)) {
        return 'constrained' as const;
    }
    if (ttff > 0 || avgBitrate > 0 || bytesNetwork > 0) return 'stable' as const;
    return 'unknown' as const;
}

async function getSourceReliabilityScore(sourceSite: string, ref?: ContentReference) {
    const normalizedSource = normalize(sourceSite);
    if (!normalizedSource) return 0;

    try {
        const videos = await (prisma as any).video.findMany({
            where: {
                OR: [
                    { tags: { contains: sourceSite } as any },
                    { tags: { contains: normalizedSource } as any },
                ],
            },
            take: 60,
            orderBy: { updatedAt: 'desc' },
            select: {
                status: true,
                views: true,
                hasDubbed: true,
                hasPortugueseAudio: true,
                hasPortugueseSubs: true,
            } as any,
        }).catch(() => []);

        const learnedGlobal = await readOutcomeStats(buildGlobalOutcomeKey(sourceSite));
        const learnedContent = ref ? await readOutcomeStats(buildContentOutcomeKey(ref, sourceSite)) : null;
        const learnedContext = ref ? await readOutcomeStats(buildContextOutcomeKey(ref, sourceSite)) : null;
        const verifiedGlobal = await readVerificationStats(buildGlobalVerificationKey(sourceSite));
        const verifiedContent = ref ? await readVerificationStats(buildContentVerificationKey(ref, sourceSite)) : null;
        const historicalScore = videos.length
            ? (() => {
                const successful = videos.filter((video: any) => video.status === 'READY' || Number(video.views || 0) > 0).length;
                const failed = videos.filter((video: any) => video.status === 'FAILED').length;
                const completionRate = successful / videos.length;
                const failRate = failed / videos.length;
                return Math.round((completionRate * 40) - (failRate * 18));
            })()
            : 0;

        const scoreLearned = (stats: SourceOutcomeStats | null, weight: number) => {
            if (!stats || stats.samples <= 0) return 0;
            const successRate = stats.good / stats.samples;
            const failureRate = stats.bad / stats.samples;
            const stability = Math.max(0, 1 - Math.min(stats.avgBufferEvents, 8) / 8);
            const ttffBonus = Math.max(0, 1 - Math.min(stats.avgTtff, 30000) / 30000);
            return Math.round((((successRate * 36) - (failureRate * 22)) + (stability * 8) + (ttffBonus * 6)) * weight);
        };

        const scoreVerification = (stats: SourceVerificationStats | null, weight: number) => {
            if (!stats || stats.samples <= 0) return 0;
            const audioRate = stats.verifiedAudioPtBr / stats.samples;
            const subtitleRate = stats.verifiedSubtitlePtBr / stats.samples;
            const mislabeledRate = stats.mislabeled / stats.samples;
            return Math.round((((audioRate * 28) + (subtitleRate * 12)) - (mislabeledRate * 26)) * weight);
        };

        return historicalScore
            + scoreLearned(learnedGlobal, 1)
            + scoreLearned(learnedContent, 1.25)
            + scoreLearned(learnedContext, 1.4)
            + scoreVerification(verifiedGlobal, 1)
            + scoreVerification(verifiedContent, 1.2);
    } catch {
        return 0;
    }
}

function computeScore(ref: ContentReference, candidate: SourceCandidate, warm: WarmCacheEntry | null, sourceReliability: number): RankedSourceCandidate {
    const resolution = parseResolution(candidate);
    const codec = parseCodec(candidate.title);
    const ageDays = parseAgeDays(candidate.title);
    const preferredQuality = normalize(ref.preferredQuality || '1080p');
    const preferredLanguage = normalize(ref.preferredLanguage || 'pt-br');
    const candidateLanguage = normalize(candidate.language || '');
    const candidateTitle = normalize(candidate.title || '');
    const candidateHash = extractInfoHash(candidate.magnetURI);

    const warmStart = warm && (
        (warm.infoHash && warm.infoHash === candidateHash)
        || (warm.sourceSite && normalize(warm.sourceSite) === normalize(candidate.sourceSite))
    ) ? 120 : 0;

    const quality = resolution === '2160p' ? 18
        : resolution === '1080p' ? 14
            : resolution === '720p' ? 8
                : 2;
    const preferredQualityBoost = preferredQuality.includes('2160') && resolution === '2160p'
        ? 8
        : preferredQuality.includes('720') && resolution === '720p'
            ? 6
            : preferredQuality.includes('1080') && resolution === '1080p'
                ? 6
                : 0;

    const language = preferredLanguage.startsWith('pt')
        ? candidateLanguage === 'pt-br' ? 40 : candidateLanguage === 'pt-br-sub' ? 20 : 0
        : candidateLanguage ? 8 : 0;

    const seeds = Math.min(36, Math.round(Math.log2(Math.max(1, Number(candidate.seeds || 0) + 1)) * 6));
    const titleAffinity = calculateTitleAffinity(ref, candidate);
    const codecScore = codec === 'x265' ? 6 : codec === 'x264' ? 4 : 0;
    const recency = ageDays === null ? 0 : Math.max(-6, 8 - Math.min(ageDays, 14));
    const extraPortugueseHint = /dublado|dual audio|pt-br|legendado/.test(candidateTitle) ? 8 : 0;

    const intelligenceScore = warmStart + sourceReliability + quality + preferredQualityBoost + language + extraPortugueseHint + seeds + titleAffinity + codecScore + recency;

    return {
        ...candidate,
        intelligenceScore,
        scoreBreakdown: {
            warmStart,
            sourceReliability,
            quality: quality + preferredQualityBoost,
            language: language + extraPortugueseHint,
            seeds,
            titleAffinity,
            codec: codecScore,
            recency,
        },
    };
}

class SourceIntelligenceLayer {
    async rankCandidates(ref: ContentReference, candidates: SourceCandidate[]): Promise<RankedSourceCandidate[]> {
        const warm = await readWarmCache(ref);
        const reliabilityCache = new Map<string, number>();

        const ranked = await Promise.all(
            candidates.map(async (candidate) => {
                const sourceKey = normalize(candidate.sourceSite);
                if (!reliabilityCache.has(sourceKey)) {
                    reliabilityCache.set(sourceKey, await getSourceReliabilityScore(candidate.sourceSite, ref));
                }
                return computeScore(ref, candidate, warm, reliabilityCache.get(sourceKey) || 0);
            })
        );

        return ranked.sort((a, b) => b.intelligenceScore - a.intelligenceScore);
    }

    async chooseBestCandidate(ref: ContentReference, candidates: SourceCandidate[]) {
        const ranked = await this.rankCandidates(ref, candidates);
        return ranked[0] || null;
    }

    async rememberWarmSuccess(ref: ContentReference, candidate: SourceCandidate) {
        await writeWarmCache(ref, candidate);
    }

    async recordPlaybackOutcome(ref: ContentReference, params: {
        observedSource?: string | null;
        duration: number;
        ttff?: number | null;
        bufferEvents?: number | null;
        bytesNetwork?: number | null;
        avgBitrate?: number | null;
    }) {
        const warm = await readWarmCache(ref);
        const sourceSite = isGenericObservedSource(params.observedSource)
            ? warm?.sourceSite || null
            : params.observedSource || null;

        if (!sourceSite) return;

        const duration = Math.max(0, Number(params.duration || 0));
        const ttff = Math.max(0, Number(params.ttff || 0));
        const bufferEvents = Math.max(0, Number(params.bufferEvents || 0));
        const bytesNetwork = Math.max(0, Number(params.bytesNetwork || 0));
        const avgBitrate = Math.max(0, Number(params.avgBitrate || 0));
        const contextualRef: ContentReference = {
            ...ref,
            networkProfile: ref.networkProfile || classifyNetworkProfile({
                ttff,
                bufferEvents,
                bytesNetwork,
                avgBitrate,
            }),
        };

        const label = duration >= 1800 && bufferEvents <= 2 && ttff <= 15000
            ? 'good'
            : duration < 180 || bufferEvents >= 6 || ttff >= 30000
                ? 'bad'
                : duration >= 600 && bufferEvents <= 4
                    ? 'good'
                    : 'neutral';

        const updateStats = async (key: string) => {
            const current = await readOutcomeStats(key) || {
                sourceSite,
                samples: 0,
                good: 0,
                neutral: 0,
                bad: 0,
                avgDuration: 0,
                avgTtff: 0,
                avgBufferEvents: 0,
                lastOutcomeAt: null,
            };

            const nextSamples = current.samples + 1;
            const next: SourceOutcomeStats = {
                ...current,
                sourceSite,
                samples: nextSamples,
                good: current.good + (label === 'good' ? 1 : 0),
                neutral: current.neutral + (label === 'neutral' ? 1 : 0),
                bad: current.bad + (label === 'bad' ? 1 : 0),
                avgDuration: ((current.avgDuration * current.samples) + duration) / nextSamples,
                avgTtff: ((current.avgTtff * current.samples) + ttff) / nextSamples,
                avgBufferEvents: ((current.avgBufferEvents * current.samples) + bufferEvents) / nextSamples,
                lastOutcomeAt: new Date().toISOString(),
            };

            await writeOutcomeStats(key, next);
        };

        await updateStats(buildGlobalOutcomeKey(sourceSite));
        await updateStats(buildContentOutcomeKey(contextualRef, sourceSite));
        await updateStats(buildContextOutcomeKey(contextualRef, sourceSite));
    }

    async recordMediaVerification(ref: ContentReference, params: {
        observedSource?: string | null;
        hasPortugueseAudio: boolean;
        hasPortugueseSubtitle: boolean;
        claimedLanguage?: string | null;
    }) {
        const warm = await readWarmCache(ref);
        const sourceSite = isGenericObservedSource(params.observedSource)
            ? warm?.sourceSite || null
            : params.observedSource || null;

        if (!sourceSite) return;

        const claimedLanguage = normalize(params.claimedLanguage || '');
        const claimedPtBr = claimedLanguage === 'pt-br' || claimedLanguage === 'pt-br-sub';
        const deliveredPtBr = params.hasPortugueseAudio || params.hasPortugueseSubtitle;
        const mislabeled = claimedPtBr && !deliveredPtBr;

        const updateStats = async (key: string) => {
            const current = await readVerificationStats(key) || {
                sourceSite,
                samples: 0,
                verifiedAudioPtBr: 0,
                verifiedSubtitlePtBr: 0,
                mislabeled: 0,
                lastVerifiedAt: null,
            };

            const next: SourceVerificationStats = {
                ...current,
                sourceSite,
                samples: current.samples + 1,
                verifiedAudioPtBr: current.verifiedAudioPtBr + (params.hasPortugueseAudio ? 1 : 0),
                verifiedSubtitlePtBr: current.verifiedSubtitlePtBr + (params.hasPortugueseSubtitle ? 1 : 0),
                mislabeled: current.mislabeled + (mislabeled ? 1 : 0),
                lastVerifiedAt: new Date().toISOString(),
            };

            await writeVerificationStats(key, next);
        };

        await updateStats(buildGlobalVerificationKey(sourceSite));
        await updateStats(buildContentVerificationKey(ref, sourceSite));
    }

    async getOperationalSnapshot(options?: {
        ref?: ContentReference;
        limit?: number;
    }) {
        const store = (prisma as any).systemStats;
        if (!store) {
            return { rising: [], falling: [], content: [] };
        }

        const limit = Math.max(1, Math.min(20, Number(options?.limit || 8)));
        const outcomeRows = await store.findMany({
            where: {
                key: {
                    startsWith: options?.ref
                        ? `source-intel:outcome:${contentKey(options.ref)}:`
                        : 'source-intel:outcome:global:',
                },
            },
            orderBy: { updatedAt: 'desc' },
            take: 100,
        }).catch(() => []);

        const verificationRows = await store.findMany({
            where: {
                key: {
                    startsWith: options?.ref
                        ? `source-intel:verification:${contentKey(options.ref)}:`
                        : 'source-intel:verification:global:',
                },
            },
            orderBy: { updatedAt: 'desc' },
            take: 100,
        }).catch(() => []);

        const verificationMap = new Map<string, SourceVerificationStats>();
        for (const row of verificationRows) {
            try {
                const stats = JSON.parse(row.valueString || '{}') as SourceVerificationStats;
                verificationMap.set(normalize(stats.sourceSite), stats);
            } catch {
                // ignore invalid stats
            }
        }

        const sources: Array<{
            sourceSite: string;
            samples: number;
            good: number;
            neutral: number;
            bad: number;
            avgDuration: number;
            avgTtff: number;
            avgBufferEvents: number;
            momentum: number;
            successRate: number;
            failureRate: number;
            verifiedAudioPtBrRate: number;
            verifiedSubtitlePtBrRate: number;
            mislabeledRate: number;
            lastOutcomeAt: string | null;
            lastVerifiedAt: string | null;
        }> = outcomeRows.flatMap((row: any) => {
            try {
                const stats = JSON.parse(row.valueString || '{}') as SourceOutcomeStats;
                const verification = verificationMap.get(normalize(stats.sourceSite));
                const successRate = stats.samples > 0 ? stats.good / stats.samples : 0;
                const failureRate = stats.samples > 0 ? stats.bad / stats.samples : 0;
                const momentum = Math.round((successRate * 100) - (failureRate * 100) - Math.min(stats.avgBufferEvents, 8) * 4);
                return [{
                    sourceSite: stats.sourceSite,
                    samples: stats.samples,
                    good: stats.good,
                    neutral: stats.neutral,
                    bad: stats.bad,
                    avgDuration: Math.round(stats.avgDuration),
                    avgTtff: Math.round(stats.avgTtff),
                    avgBufferEvents: Number(stats.avgBufferEvents.toFixed(2)),
                    momentum,
                    successRate: Number((successRate * 100).toFixed(1)),
                    failureRate: Number((failureRate * 100).toFixed(1)),
                    verifiedAudioPtBrRate: verification?.samples ? Number(((verification.verifiedAudioPtBr / verification.samples) * 100).toFixed(1)) : 0,
                    verifiedSubtitlePtBrRate: verification?.samples ? Number(((verification.verifiedSubtitlePtBr / verification.samples) * 100).toFixed(1)) : 0,
                    mislabeledRate: verification?.samples ? Number(((verification.mislabeled / verification.samples) * 100).toFixed(1)) : 0,
                    lastOutcomeAt: stats.lastOutcomeAt || null,
                    lastVerifiedAt: verification?.lastVerifiedAt || null,
                }];
            } catch {
                return [];
            }
        });

        const sorted = sources.sort((a, b) => b.momentum - a.momentum);
        return {
            rising: sorted.slice(0, limit),
            falling: [...sorted].reverse().slice(0, limit),
            content: sorted.slice(0, limit),
        };
    }
}

export const SourceIntelligence = new SourceIntelligenceLayer();
