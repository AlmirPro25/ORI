import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { SearchRankingTelemetry } from './search-ranking-telemetry';

const prisma = new PrismaClient();

interface StremioManifest {
    id: string;
    version: string;
    name: string;
    description?: string;
    resources: string[] | { name: string; types: string[]; idPrefixes?: string[] }[];
    types: string[];
    catalogs: any[];
    background?: string;
    logo?: string;
}

type ResolvedIds = {
    preferred: string;
    alternates: string[];
};

type ParsedStreamId = {
    baseId: string;
    suffix: string;
};

type StreamContext = {
    title?: string;
    titleAliases?: string[];
    searchVariants?: string[];
    seasonNumber?: number;
    episodeNumber?: number;
    preferSeasonPack?: boolean;
    preferPortugueseAudio?: boolean;
    acceptPortugueseSubtitles?: boolean;
    userId?: string;
    forceRefresh?: boolean;
};

type PrioritizedAddon = {
    addon: any;
    policy: any;
    operationalPriority: number;
    concurrencyWeight: number;
};

type AddonOperationalSnapshot = {
    addonId: string;
    addonName: string;
    enabled: boolean;
    operationalPriority: number;
    concurrencyWeight: number;
    keepRate: number;
    discardRate: number;
    samples: number;
    cooldown: boolean;
    cooldownUntil: number | null;
    cooldownReason: string | null;
    rateLimitCooldown: boolean;
    rateLimitCooldownUntil: number | null;
    timeoutBudgetMs: number;
    budgetTier: 'primary' | 'standard' | 'degraded' | 'disabled';
};

export class AddonService {
    private static idCache = new Map<string, string>();
    private static streamCache = new Map<string, { expiresAt: number; streams: any[] }>();
    private static addonCooldownUntil = new Map<string, number>();
    private static readonly STREAM_CACHE_TTL_MS = 2 * 60 * 1000;
    private static readonly RATE_LIMIT_COOLDOWN_MS = 5 * 60 * 1000;
    private static readonly ADDON_TIMEOUT_BUDGET_MS = {
        primary: 5200,
        standard: 3600,
        degraded: 1800,
        disabled: 900,
    } as const;

    private static BROKEN_STREAM_PATTERNS = [
        /please configure/i,
        /not configured/i,
        /configuration required/i,
        /^\[❌\]/i,
        /\berror\b/i,
    ];

    private static ADDON_PRIORITY: Record<string, number> = {
        'brazuca torrents': 110,
        'indexabr': 78,
        'thepiratebay+': 60,
        'top streaming': 40,
        'streaming catalogs': 30,
        'aiostreams | elfhosted': 10,
    };

    static async installAddon(manifestUrl: string) {
        try {
            if (!manifestUrl.startsWith('http')) {
                throw new Error('URL invalida. Deve comecar com http:// ou https://');
            }

            console.log(`Buscando manifesto em: ${manifestUrl}`);
            const response = await axios.get(manifestUrl);
            const manifest = response.data as StremioManifest;

            if (!manifest.id || !manifest.name || !manifest.version) {
                throw new Error('Manifesto invalido: faltam campos obrigatorios (id, name, version)');
            }

            const existing = await prisma.addon.findUnique({
                where: { manifestUrl }
            });

            if (existing) {
                return { success: false, message: 'Addon ja instalado', addon: existing };
            }

            const newAddon = await prisma.addon.create({
                data: {
                    manifestUrl,
                    name: manifest.name,
                    description: manifest.description || '',
                    version: manifest.version,
                    types: manifest.types ? JSON.stringify(manifest.types) : null,
                    resources: manifest.resources ? JSON.stringify(manifest.resources.map((r: any) => typeof r === 'string' ? r : r.name)) : null,
                    enabled: true
                }
            });

            return { success: true, message: 'Addon instalado com sucesso', addon: newAddon };
        } catch (error: any) {
            console.error('Erro ao instalar addon:', error.message);
            throw new Error(`Falha na instalacao: ${error.message}`);
        }
    }

    static async listAddons() {
        return prisma.addon.findMany({
            orderBy: { createdAt: 'desc' }
        });
    }

    static async removeAddon(id: string) {
        return prisma.addon.delete({
            where: { id }
        });
    }

    private static parseStreamId(type: string, id: string): ParsedStreamId {
        if (type !== 'series') {
            return { baseId: id, suffix: '' };
        }

        const [baseId, ...rest] = String(id).split(':');
        const suffix = rest.length ? `:${rest.join(':')}` : '';
        return { baseId, suffix };
    }

    static async proxyRequest(addonId: string, resource: string, type: string, id: string) {
        const addon = await prisma.addon.findUnique({ where: { id: addonId } });
        if (!addon) throw new Error('Addon nao encontrado');

        const baseUrl = addon.manifestUrl.replace('/manifest.json', '');
        const url = `${baseUrl}/${resource}/${type}/${id}.json`;

        try {
            const response = await axios.get(url);
            return response.data;
        } catch (error: any) {
            console.error(`Erro no proxy do addon ${addon.name}:`, error.message);
            throw new Error(`Erro no addon remoto: ${error.message}`);
        }
    }

    private static async resolveExternalIds(type: string, id: string): Promise<ResolvedIds> {
        const { baseId, suffix } = this.parseStreamId(type, id);

        if (baseId.startsWith('tt') || !/^\d+$/.test(baseId)) {
            const directId = `${baseId}${suffix}`;
            return { preferred: directId, alternates: [directId] };
        }

        const cacheKey = `${type}:${baseId}`;
        if (this.idCache.has(cacheKey)) {
            const cached = this.idCache.get(cacheKey)!;
            return {
                preferred: `${cached}${suffix}`,
                alternates: [`${cached}${suffix}`, `${baseId}${suffix}`],
            };
        }

        const tmdbType = type === 'series' ? 'tv' : 'movie';
        const alternates = new Set<string>([baseId]);

        try {
            const apiKey = process.env.TMDB_API_KEY;
            if (apiKey) {
                const extUrl = `https://api.themoviedb.org/3/${tmdbType}/${baseId}/external_ids?api_key=${apiKey}`;
                const extResponse = await axios.get(extUrl, { timeout: 5000 }) as any;

                if (extResponse.data?.imdb_id) {
                    this.idCache.set(cacheKey, extResponse.data.imdb_id);
                    alternates.add(extResponse.data.imdb_id);
                }

                if (extResponse.data?.tvdb_id) {
                    alternates.add(String(extResponse.data.tvdb_id));
                }
            }
        } catch (error: any) {
            console.warn(`TMDB external_ids falhou para ${type}/${id}: ${error.message}`);
        }

        try {
            const apiKey = process.env.TMDB_API_KEY;
            if (apiKey) {
                const detailUrl = `https://api.themoviedb.org/3/${tmdbType}/${baseId}?api_key=${apiKey}`;
                const detailResponse = await axios.get(detailUrl, { timeout: 5000 }) as any;
                if (detailResponse.data?.imdb_id) {
                    this.idCache.set(cacheKey, detailResponse.data.imdb_id);
                    alternates.add(detailResponse.data.imdb_id);
                }
            }
        } catch {
            // ignora fallback de detalhe
        }

        const normalizedAlternates = [...alternates].map((value) => `${value}${suffix}`);
        const preferred = normalizedAlternates.find((value) => value.startsWith('tt')) || `${baseId}${suffix}`;
        return { preferred, alternates: normalizedAlternates };
    }

    private static normalizeText(value?: string) {
        return (value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
    }

    private static parseStoredTasteProfile(raw?: string | null) {
        if (!raw) {
            return {
                categories: {} as Record<string, number>,
                tags: {} as Record<string, number>,
                titleFamilies: {} as Record<string, number>,
                languageSignals: {} as Record<string, number>,
                preferredQuality: '1080p',
            };
        }

        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                return {
                    categories: parsed.categories || {},
                    tags: parsed.tags || {},
                    titleFamilies: parsed.titleFamilies || {},
                    languageSignals: parsed.languageSignals || {},
                    preferredQuality: parsed.preferredQuality || '1080p',
                };
            }
        } catch {
            // fallback abaixo
        }

        return {
            categories: {} as Record<string, number>,
            tags: {} as Record<string, number>,
            titleFamilies: {} as Record<string, number>,
            languageSignals: {} as Record<string, number>,
            preferredQuality: '1080p',
        };
    }

    private static getEpisodeSpecificityScore(stream: any, context: StreamContext = {}) {
        const haystack = this.normalizeText([
            stream?.title,
            stream?.name,
            stream?.description,
            stream?.behaviorHints?.filename,
        ].filter(Boolean).join(' '));
        const aliases = Array.from(new Set([context.title, ...(context.titleAliases || []), ...(context.searchVariants || [])]
            .map((value) => this.normalizeText(value))
            .filter(Boolean)));
        const target = aliases[0] || this.normalizeText(context.title);
        const episodeMatch = target.match(/s(\d{2})e(\d{2})/i);

        let score = 0;
        const titleTokenHits = aliases
            .flatMap((alias) => alias.split(/\s+/).filter((token) => token.length > 2))
            .filter((token, index, arr) => arr.indexOf(token) === index)
            .reduce((hits, token) => hits + (haystack.includes(token) ? 1 : 0), 0);
        score += Math.min(40, titleTokenHits * 4);

        if (episodeMatch) {
            const [, season, episode] = episodeMatch;
            const seasonNum = String(Number(season));
            const episodeNum = String(Number(episode));
            const exactEpisodePatterns = [
                new RegExp(`s${season}e${episode}`),
                new RegExp(`${seasonNum}x${episodeNum}`),
                new RegExp(`episodio\\s*${episodeNum}`),
                new RegExp(`episode\\s*${episodeNum}`),
            ];

            if (exactEpisodePatterns.some((pattern) => pattern.test(haystack))) {
                score += 120;
            }

            if (new RegExp(`e${episode}\\s*[-_]\\s*e?\\d{2}`).test(haystack) || new RegExp(`${seasonNum}x${episodeNum}\\s*[-_]\\s*\\d{1,2}`).test(haystack)) {
                score -= 60;
            }

            if (new RegExp(`s${season}(?!e${episode})`).test(haystack) || new RegExp(`season\\s*${seasonNum}`).test(haystack) || new RegExp(`temporada\\s*${seasonNum}`).test(haystack)) {
                score -= 10;
            }
        }

        if (/\bcomplete\b|\bcompleta\b|\btemporada\b|\bseason\b/.test(haystack)) {
            score += context.preferSeasonPack ? 36 : -20;
        }

        if (/\bdual\b|\bdublado\b|\bpt-br\b/.test(haystack)) {
            score += 10;
        }

        if (context.preferSeasonPack && episodeMatch) {
            const [, season, episode] = episodeMatch;
            const seasonNum = String(Number(season));
            const episodeNum = String(Number(episode));
            if (new RegExp(`temporada\\s*${seasonNum}`).test(haystack) || new RegExp(`season\\s*${seasonNum}`).test(haystack)) {
                score += 24;
            }
            if (new RegExp(`${seasonNum}x${episodeNum}`).test(haystack) || new RegExp(`s${season}e${episode}`).test(haystack)) {
                score += 28;
            }
        }

        return score;
    }

    private static extractSwarmScore(stream: any) {
        const haystack = `${stream?.title || ''} ${stream?.name || ''} ${stream?.description || ''}`;
        const matches = [...haystack.matchAll(/(?:👤|seed(?:s|ers?)?|peer(?:s)?)[^\d]{0,6}(\d{1,5})/gi)];
        if (!matches.length) return 0;

        return matches.reduce((best, match) => {
            const value = Number(match[1] || 0);
            return Number.isFinite(value) ? Math.max(best, value) : best;
        }, 0);
    }

    private static extractAvailabilityScore(stream: any) {
        const haystack = `${stream?.title || ''} ${stream?.name || ''} ${stream?.description || ''}`;
        const peersMatch = haystack.match(/(?:👤|peers?)[^\d]{0,6}(\d{1,5})/i);
        const seedsMatch = haystack.match(/seed(?:s|ers?)?[^\d]{0,6}(\d{1,5})/i);
        const peers = peersMatch ? Number(peersMatch[1]) : 0;
        const seeds = seedsMatch ? Number(seedsMatch[1]) : 0;
        const swarm = this.extractSwarmScore(stream);
        return (seeds * 4) + (peers * 2) + swarm;
    }

    private static hasPortugueseHint(title?: string) {
        const normalized = this.normalizeText(title);
        if (!normalized) return false;

        return /(dublado|dual audio|legendado|temporada|serie|episodio|filme|portugues|pt-br|brasil|familia|criancas|animacao|desenho|aventura|comedia|drama|acao|terror|suspense)/i.test(normalized);
    }

    private static getBrazilianNamingScore(stream: any, context: StreamContext = {}) {
        const haystack = this.getStreamText(stream);
        let score = 0;

        if (/\bdublado\b/.test(haystack)) score += 30;
        if (/\bdual\b|\bdual audio\b/.test(haystack)) score += 20;
        if (/\bpt-br\b|\bptbr\b|\bportugues\b|\bportuguese\b/.test(haystack)) score += 25;
        if (/\bnacional\b|\baudio br\b|\baudio pt\b/.test(haystack)) score += 14;
        if (/\blegendado\b|\blegenda\b|\bsub\b|\bsubtitle\b/.test(haystack)) score += context.acceptPortugueseSubtitles === false ? -10 : 6;
        if (context.preferSeasonPack && /\btemporada\b|\bseason\b|\bpack\b|\bcomplete\b|\bcompleta\b/.test(haystack)) score += 18;

        return score;
    }

    private static getStreamText(stream: any) {
        return this.normalizeText([
            stream?.title,
            stream?.name,
            stream?.description,
            stream?.behaviorHints?.filename,
        ].filter(Boolean).join(' '));
    }

    private static hasExplicitPortugueseAudio(stream: any) {
        const haystack = this.getStreamText(stream);
        return /\bdublado\b|\bpt-br\b|\bptbr\b|\bportugues\b|\bportuguese\b|\baudio pt\b|\baudio br\b|\bdub pt\b|\bdubbed pt\b/.test(haystack);
    }

    private static getPortugueseAudioScore(stream: any) {
        const haystack = this.getStreamText(stream);
        let score = 0;

        if (this.hasExplicitPortugueseAudio(stream)) {
            score += 90;
        }

        if (/\blat\b/.test(haystack)) {
            score += 15;
        }

        if (/\beng\b|\benglish\b|\boriginal\b|\bjapanese\b|\bjap\b/.test(haystack) && !this.hasExplicitPortugueseAudio(stream)) {
            score -= 20;
        }

        return score;
    }

    private static getPortugueseSubtitleScore(stream: any) {
        const haystack = this.getStreamText(stream);
        let score = 0;

        if (/\blegenda pt\b|\blegenda pt-br\b|\bsub pt\b|\bsub pt-br\b|\bsubtitle pt\b|\bsubtitle pt-br\b|\bsubs pt\b|\bsubs pt-br\b/.test(haystack)) {
            score += 60;
        } else if (/\bpt-br\b|\bptbr\b|\bportugues\b|\bportuguese\b/.test(haystack) && /\blegenda\b|\blegendado\b|\bsub\b|\bsubtitle\b|\bsubs\b/.test(haystack)) {
            score += 40;
        }

        return score;
    }

    private static getPortugueseAffinityBoost(stream: any, addonName: string, preferPortuguese: boolean) {
        if (!preferPortuguese) return 0;

        const audioScore = this.getPortugueseAudioScore(stream);
        const subtitleScore = this.getPortugueseSubtitleScore(stream);
        const hasPortugueseValue = audioScore > 0 || subtitleScore > 0;
        const normalizedAddon = this.normalizeText(addonName);

        if (normalizedAddon.includes('brazuca')) {
            return hasPortugueseValue ? 55 : 12;
        }

        if (normalizedAddon.includes('indexabr')) {
            if (audioScore > 0) return 18;
            if (subtitleScore > 0) return 8;
            return -35;
        }

        if (normalizedAddon.includes('top streaming')) {
            return hasPortugueseValue ? 14 : 0;
        }

        return hasPortugueseValue ? 8 : 0;
    }

    private static getSourceHealthPenalty(stream: any, policy: any, addonName: string, preferPortuguese: boolean) {
        const keepRate = Number(policy?.keepRate || 0);
        const discardRate = Number(policy?.discardRate || 0);
        const cooldown = Boolean(policy?.cooldown && policy?.cooldownUntil && policy.cooldownUntil > Date.now());
        const portugueseSignal = this.getPortugueseAudioScore(stream) > 0 || this.getPortugueseSubtitleScore(stream) > 0;

        let penalty = 0;
        if (discardRate >= 80) penalty += 40;
        else if (discardRate >= 65) penalty += 22;

        if (keepRate > 0 && keepRate <= 15) penalty += 26;
        else if (keepRate > 0 && keepRate <= 30) penalty += 12;

        if (cooldown) {
            penalty += preferPortuguese && portugueseSignal ? 18 : 55;
        }

        if (this.normalizeText(addonName).includes('unknown')) {
            penalty += 6;
        }

        return penalty;
    }

    private static getAddonOperationalPriority(addonName: string, policy: any, preferPortuguese: boolean) {
        const normalizedAddon = this.normalizeText(addonName);
        const keepRate = Number(policy?.keepRate || 0);
        const discardRate = Number(policy?.discardRate || 0);
        const samples = Number(policy?.samples || 0);
        const coolingDown = Boolean(policy?.cooldown && policy?.cooldownUntil && policy.cooldownUntil > Date.now());

        let score = this.ADDON_PRIORITY[normalizedAddon] || 0;
        score += Math.min(24, Math.round(keepRate / 6));
        score -= Math.min(36, Math.round(discardRate / 4));

        if (samples >= 6) {
            score += 8;
        }

        if (coolingDown) {
            score -= preferPortuguese && normalizedAddon.includes('brazuca') ? 22 : 80;
        }

        return score;
    }

    private static getAddonConcurrencyWeight(addonName: string, policy: any, preferPortuguese: boolean) {
        const normalizedAddon = this.normalizeText(addonName);
        const keepRate = Number(policy?.keepRate || 0);
        const discardRate = Number(policy?.discardRate || 0);
        const coolingDown = Boolean(policy?.cooldown && policy?.cooldownUntil && policy.cooldownUntil > Date.now());

        if (coolingDown) {
            return preferPortuguese && normalizedAddon.includes('brazuca') ? 1 : 0;
        }

        if (keepRate >= 55 && discardRate <= 35) return 3;
        if (keepRate >= 25 && discardRate <= 60) return 2;
        return 1;
    }

    private static getBudgetTier(concurrencyWeight: number): AddonOperationalSnapshot['budgetTier'] {
        if (concurrencyWeight >= 3) return 'primary';
        if (concurrencyWeight === 2) return 'standard';
        if (concurrencyWeight === 1) return 'degraded';
        return 'disabled';
    }

    private static getAddonTimeoutBudgetMs(addonName: string, policy: any, preferPortuguese: boolean) {
        const tier = this.getBudgetTier(this.getAddonConcurrencyWeight(addonName, policy, preferPortuguese));
        const keepRate = Number(policy?.keepRate || 0);
        const discardRate = Number(policy?.discardRate || 0);
        const base = this.ADDON_TIMEOUT_BUDGET_MS[tier];

        if (tier === 'primary' && keepRate >= 75 && discardRate <= 20) {
            return base + 700;
        }

        if (tier === 'degraded' && discardRate >= 80) {
            return Math.max(1200, base - 400);
        }

        return base;
    }

    private static async runWithAdaptiveConcurrency<T>(items: T[], concurrencyOf: (item: T) => number, worker: (item: T) => Promise<void>) {
        const healthy = items.filter((item) => concurrencyOf(item) >= 3);
        const normal = items.filter((item) => concurrencyOf(item) === 2);
        const degraded = items.filter((item) => concurrencyOf(item) === 1);

        await Promise.all(healthy.map((item) => worker(item)));

        const runSequentialBatches = async (batchItems: T[], batchSize: number) => {
            for (let index = 0; index < batchItems.length; index += batchSize) {
                const batch = batchItems.slice(index, index + batchSize);
                await Promise.all(batch.map((item) => worker(item)));
            }
        };

        await runSequentialBatches(normal, 2);
        await runSequentialBatches(degraded, 1);
    }

    private static async prioritizeAddons(addons: any[], preferPortuguese: boolean) {
        const healthPolicies = new Map<string, any>(
            (await Promise.all(
                addons.map(async (addon) => [
                    this.normalizeText(addon?.name || ''),
                    await SearchRankingTelemetry.getAdaptivePolicyForSource(addon?.name || 'unknown'),
                ] as const)
            )).map(([key, value]) => [key, value])
        );

        return addons
            .map((addon) => ({
                addon,
                policy: healthPolicies.get(this.normalizeText(addon?.name || '')),
                operationalPriority: this.getAddonOperationalPriority(
                    addon?.name || '',
                    healthPolicies.get(this.normalizeText(addon?.name || '')),
                    preferPortuguese
                ),
                concurrencyWeight: this.getAddonConcurrencyWeight(
                    addon?.name || '',
                    healthPolicies.get(this.normalizeText(addon?.name || '')),
                    preferPortuguese
                ),
            }))
            .sort((a, b) => {
                const aPriority = a.operationalPriority;
                const bPriority = b.operationalPriority;
                if (aPriority !== bPriority) return bPriority - aPriority;

                const aSamples = Number(a.policy?.samples || 0);
                const bSamples = Number(b.policy?.samples || 0);
                if (aSamples !== bSamples) return bSamples - aSamples;

                return String(a.addon?.name || '').localeCompare(String(b.addon?.name || ''));
            }) as PrioritizedAddon[];
    }

    private static isRateLimited(error: any) {
        const status = error?.response?.status;
        const message = String(error?.response?.data || error?.message || '');
        return status === 429 || /too many requests|rate limit/i.test(message);
    }

    private static isAddonCoolingDown(addonName: string) {
        const until = this.addonCooldownUntil.get(addonName) || 0;
        return until > Date.now();
    }

    private static getAddonRateLimitCooldownUntil(addonName: string) {
        const until = this.addonCooldownUntil.get(addonName) || 0;
        return until > Date.now() ? until : null;
    }

    private static setAddonCooldown(addonName: string) {
        this.addonCooldownUntil.set(addonName, Date.now() + this.RATE_LIMIT_COOLDOWN_MS);
    }

    static async getOperationalSnapshot(options: { preferPortuguese?: boolean } = {}) {
        const preferPortuguese = Boolean(options.preferPortuguese);
        const addons = await prisma.addon.findMany({
            where: { enabled: true },
            orderBy: { createdAt: 'desc' },
        });
        const prioritized = await this.prioritizeAddons(addons, preferPortuguese);

        return prioritized.map((entry): AddonOperationalSnapshot => {
            const policy = entry.policy || {};
            const cooldownUntil = policy?.cooldownUntil && policy.cooldownUntil > Date.now()
                ? policy.cooldownUntil
                : null;
            const rateLimitCooldownUntil = this.getAddonRateLimitCooldownUntil(entry.addon?.name || '');
            const budgetTier = this.getBudgetTier(entry.concurrencyWeight);

            return {
                addonId: String(entry.addon?.id || ''),
                addonName: String(entry.addon?.name || 'unknown'),
                enabled: Boolean(entry.addon?.enabled),
                operationalPriority: Number(entry.operationalPriority || 0),
                concurrencyWeight: Number(entry.concurrencyWeight || 0),
                keepRate: Number(policy?.keepRate || 0),
                discardRate: Number(policy?.discardRate || 0),
                samples: Number(policy?.samples || 0),
                cooldown: Boolean(cooldownUntil),
                cooldownUntil,
                cooldownReason: policy?.cooldownReason || null,
                rateLimitCooldown: Boolean(rateLimitCooldownUntil),
                rateLimitCooldownUntil,
                timeoutBudgetMs: this.getAddonTimeoutBudgetMs(entry.addon?.name || '', policy, preferPortuguese),
                budgetTier,
            };
        });
    }

    static async getStreamsFromAllAddons(type: string, id: string, context: StreamContext = {}) {
        const cacheKey = `${type}:${id}:${this.normalizeText(context.title)}:${this.normalizeText((context.titleAliases || []).join('|'))}:${context.preferPortugueseAudio ? 'ptaudio' : 'audio-any'}:${context.acceptPortugueseSubtitles === false ? 'subs-off' : 'subs-on'}:${context.preferSeasonPack ? 'season-pack' : 'direct'}:${context.userId || 'anon'}`;
        const cached = this.streamCache.get(cacheKey);
        if (!context.forceRefresh && cached && cached.expiresAt > Date.now()) {
            return cached.streams;
        }

        const preferPortuguese = context.preferPortugueseAudio !== false && this.hasPortugueseHint(context.title);
        const { preferred, alternates } = await this.resolveExternalIds(type, id);
        const prioritizedAddons = await this.prioritizeAddons(
            await prisma.addon.findMany({ where: { enabled: true } }),
            preferPortuguese
        );
        const allStreams: any[] = [];

        await this.runWithAdaptiveConcurrency(prioritizedAddons, (entry) => entry.concurrencyWeight, async ({ addon, concurrencyWeight, policy }) => {
            try {
                if (concurrencyWeight <= 0) {
                    return;
                }

                if (this.isAddonCoolingDown(addon.name)) {
                    return;
                }

                const baseUrl = addon.manifestUrl.replace('/manifest.json', '');
                let responseData: any = null;
                const timeoutBudgetMs = this.getAddonTimeoutBudgetMs(addon.name, policy, preferPortuguese);

                for (const candidateId of [preferred, ...alternates.filter((value) => value !== preferred)]) {
                    const url = `${baseUrl}/stream/${type}/${candidateId}.json`;
                    try {
                        const response = await axios.get(url, { timeout: timeoutBudgetMs }) as any;
                        if (response.data?.streams?.length) {
                            responseData = response.data;
                            break;
                        }
                    } catch (error: any) {
                        if (this.isRateLimited(error)) {
                            this.setAddonCooldown(addon.name);
                            break;
                        }
                    }
                }

                if (!responseData?.streams) return;

                const streams = responseData.streams
                    .map((stream: any) => ({
                        ...stream,
                        addonName: addon.name,
                        _addonId: addon.id,
                        title: stream.title || stream.name || stream.description || `Stream ${addon.name}`
                    }))
                    .filter((stream: any) => this.isUsableStream(stream));

                allStreams.push(...streams);
            } catch {
                // um addon falhar nao derruba os outros
            }
        });

        const ranked = await this.rankStreams(type, allStreams, context);
        this.streamCache.set(cacheKey, {
            expiresAt: Date.now() + this.STREAM_CACHE_TTL_MS,
            streams: ranked,
        });
        return ranked;
    }

    private static isUsableStream(stream: any) {
        const haystack = `${stream?.title || ''} ${stream?.name || ''} ${stream?.description || ''}`.trim();
        if (!haystack && !stream?.url && !stream?.infoHash && !stream?.ytId) return false;
        if (this.BROKEN_STREAM_PATTERNS.some((pattern) => pattern.test(haystack))) return false;
        if (!stream?.url && !stream?.infoHash && !stream?.ytId) return false;
        return true;
    }

    private static async rankStreams(type: string, streams: any[], context: StreamContext = {}) {
        const seen = new Set<string>();
        const preferPortuguese = context.preferPortugueseAudio !== false && this.hasPortugueseHint(context.title);
        const addonNames = Array.from(new Set(
            streams
                .map((stream) => String(stream?.addonName || '').trim())
                .filter(Boolean)
        ));
        const [userProfile, addonHeuristics] = await Promise.all([
            context.userId
                ? (prisma as any).userProfile.findUnique({ where: { userId: context.userId } }).catch(() => null)
                : Promise.resolve(null),
            prisma.systemStats.findMany({
                where: {
                    key: {
                        in: Array.from(new Set(
                            streams
                                .map((stream) => `arconte:heuristic:addon:${type}:${this.normalizeText(stream.addonName || '')}`)
                                .filter((key) => !key.endsWith(':'))
                        )),
                    },
                },
            }).catch(() => []),
        ]);
        const addonHealthPolicies = new Map<string, any>(
            (await Promise.all(
                addonNames.map(async (addonName) => [
                    this.normalizeText(addonName),
                    await SearchRankingTelemetry.getAdaptivePolicyForSource(addonName),
                ] as const)
            )).map(([key, value]) => [key, value])
        );
        const tasteProfile = this.parseStoredTasteProfile(userProfile?.preferredGenres);
        const heuristicMap = new Map<string, any>(
            addonHeuristics.map((row: any) => {
                try {
                    return [row.key, row.valueString ? JSON.parse(row.valueString) : null];
                } catch {
                    return [row.key, null];
                }
            })
        );

        return streams
            .filter((stream) => {
                const key = stream.infoHash || stream.url || `${stream.addonName}:${stream.title}`;
                if (!key || seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .sort((a, b) => {
                const aName = String(a.addonName || '').toLowerCase();
                const bName = String(b.addonName || '').toLowerCase();
                const aTitle = String(a.title || a.name || '');
                const bTitle = String(b.title || b.name || '');
                const aPolicy = addonHealthPolicies.get(this.normalizeText(a.addonName || ''));
                const bPolicy = addonHealthPolicies.get(this.normalizeText(b.addonName || ''));
                const aPortugueseAudio = this.getPortugueseAudioScore(a);
                const bPortugueseAudio = this.getPortugueseAudioScore(b);
                if (aPortugueseAudio !== bPortugueseAudio) return bPortugueseAudio - aPortugueseAudio;

                const aPortugueseSubtitle = context.acceptPortugueseSubtitles === false ? 0 : this.getPortugueseSubtitleScore(a);
                const bPortugueseSubtitle = context.acceptPortugueseSubtitles === false ? 0 : this.getPortugueseSubtitleScore(b);
                if (aPortugueseSubtitle !== bPortugueseSubtitle) return bPortugueseSubtitle - aPortugueseSubtitle;

                const aBrazilianNaming = this.getBrazilianNamingScore(a, context);
                const bBrazilianNaming = this.getBrazilianNamingScore(b, context);
                if (aBrazilianNaming !== bBrazilianNaming) return bBrazilianNaming - aBrazilianNaming;

                if (type === 'series') {
                    const aSpecificity = this.getEpisodeSpecificityScore(a, context);
                    const bSpecificity = this.getEpisodeSpecificityScore(b, context);
                    if (aSpecificity !== bSpecificity) return bSpecificity - aSpecificity;
                }

                const aAvailability = this.extractAvailabilityScore(a);
                const bAvailability = this.extractAvailabilityScore(b);
                if (Math.abs(aAvailability - bAvailability) >= 25) return bAvailability - aAvailability;

                const getPersonalizedBoost = (stream: any, addonName: string, portugueseAudio: number, portugueseSubtitle: number, availability: number) => {
                    const addonKey = `arconte:heuristic:addon:${type}:${this.normalizeText(addonName)}`;
                    const heuristic = heuristicMap.get(addonKey);
                    const wins = Number(heuristic?.wins || 0);
                    const ptBrWins = Number(heuristic?.ptBrWins || 0);
                    const avgAvailability = wins > 0 ? Number(heuristic?.totalAvailability || 0) / wins : 0;
                    const preferredQuality = String(tasteProfile.preferredQuality || '1080p').toLowerCase();
                    const titleText = `${stream?.title || ''} ${stream?.name || ''}`;
                    const qualityBoost = preferredQuality.includes('2160')
                        ? (/2160|4k/i.test(titleText) ? 12 : 0)
                        : preferredQuality.includes('720')
                            ? (/720/i.test(titleText) ? 8 : 0)
                            : (/1080/i.test(titleText) ? 10 : 0);
                    const portugueseAffinity = Number(tasteProfile.languageSignals?.['audio-pt-br'] || 0)
                        + Number(tasteProfile.languageSignals?.dubbed || 0);
                    const subtitleAffinity = Number(tasteProfile.languageSignals?.['subtitle-pt-br'] || 0);
                    const addonFamilyBoost = addonName.includes('brazuca') && portugueseAffinity > 1 ? 42
                        : addonName.includes('indexabr') && wins > 0 && portugueseAudio > 0 ? 12
                        : 0;

                    return addonFamilyBoost
                        + qualityBoost
                        + Math.min(40, ptBrWins * 8)
                        + Math.min(25, wins * 3)
                        + Math.min(20, Math.round(avgAvailability / 6))
                        + (portugueseAudio > 0 ? Math.min(28, portugueseAffinity * 3) : 0)
                        + (portugueseSubtitle > 0 ? Math.min(14, subtitleAffinity * 2) : 0)
                        + (availability > 0 && avgAvailability > 20 ? 6 : 0);
                };

                const aPersonalized = getPersonalizedBoost(a, aName, aPortugueseAudio, aPortugueseSubtitle, aAvailability);
                const bPersonalized = getPersonalizedBoost(b, bName, bPortugueseAudio, bPortugueseSubtitle, bAvailability);
                if (aPersonalized !== bPersonalized) return bPersonalized - aPersonalized;

                const aHealthPenalty = this.getSourceHealthPenalty(a, aPolicy, aName, preferPortuguese);
                const bHealthPenalty = this.getSourceHealthPenalty(b, bPolicy, bName, preferPortuguese);
                if (aHealthPenalty !== bHealthPenalty) return aHealthPenalty - bHealthPenalty;

                const aPriority = (this.ADDON_PRIORITY[aName] || 0)
                    + this.getPortugueseAffinityBoost(a, aName, preferPortuguese)
                    + (preferPortuguese && aName.includes('brazuca') && aPortugueseAudio > 0 ? 35 : 0)
                    + (preferPortuguese ? Math.min(aPortugueseAudio, 60) : 0)
                    - aHealthPenalty;
                const bPriority = (this.ADDON_PRIORITY[bName] || 0)
                    + this.getPortugueseAffinityBoost(b, bName, preferPortuguese)
                    + (preferPortuguese && bName.includes('brazuca') && bPortugueseAudio > 0 ? 35 : 0)
                    + (preferPortuguese ? Math.min(bPortugueseAudio, 60) : 0)
                    - bHealthPenalty;

                if (aPriority !== bPriority) return bPriority - aPriority;

                const aP2P = a.infoHash || String(a.url || '').startsWith('magnet:') ? 1 : 0;
                const bP2P = b.infoHash || String(b.url || '').startsWith('magnet:') ? 1 : 0;
                if (type === 'series' && aP2P !== bP2P) return bP2P - aP2P;

                const aSwarm = this.extractSwarmScore(a);
                const bSwarm = this.extractSwarmScore(b);
                if (aSwarm !== bSwarm) return bSwarm - aSwarm;

                const aQuality = /2160|4k/i.test(aTitle) ? 4 : /1080/i.test(aTitle) ? 3 : /720/i.test(aTitle) ? 2 : 1;
                const bQuality = /2160|4k/i.test(bTitle) ? 4 : /1080/i.test(bTitle) ? 3 : /720/i.test(bTitle) ? 2 : 1;
                if (aQuality !== bQuality) return bQuality - aQuality;

                return aTitle.localeCompare(bTitle);
            });
    }
}
