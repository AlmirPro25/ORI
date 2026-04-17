import { PrismaClient } from '@prisma/client';
import { resilientGet } from '../utils/resilient-http';
import { SearchRankingTelemetry } from './search-ranking-telemetry';

const prisma = new PrismaClient();

type DiscoveryOptions = {
    searchTerms?: string[];
    limit?: number;
};

type DiscoveryResult = {
    manifests: string[];
    installed: any[];
    skipped: string[];
    errors: string[];
};

type StremioManifest = {
    id?: string;
    version?: string;
    name?: string;
    description?: string;
    resources?: string[] | { name: string; types?: string[]; idPrefixes?: string[] }[];
    types?: string[];
};

export class SourceDiscoveryService {
    private static readonly REQUEST_TIMEOUT_MS = 8000;
    private static readonly DEFAULT_LIMIT = 8;
    private static readonly MANIFEST_REGEX = /https?:\/\/[^\s"'<>]+\/manifest\.json/gi;
    private static readonly HREF_REGEX = /href=["']([^"'#?]+(?:manifest\.json|stremio[^"'<>]*|addon[^"'<>]*))["']/gi;
    private static readonly DEFAULT_DISCOVERY_TARGETS = [
        'https://stremio-addons.netlify.app/',
        'https://www.stremio-addons.com/',
        'https://be941afb5956-indexabrr.baby-beamup.club/manifest.json',
    ];

    private static normalizeUrl(value: string) {
        return String(value || '').trim();
    }

    private static normalizeText(value?: string) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }

    private static getConfiguredTargets(searchTerms: string[] = []) {
        const envTargets = String(process.env.ADDON_DISCOVERY_URLS || '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);

        const queryTargets = searchTerms
            .map((term) => this.normalizeText(term))
            .filter(Boolean)
            .flatMap((term) => [
                `https://www.google.com/search?q=${encodeURIComponent(`${term} stremio addon manifest`)}`,
                `https://duckduckgo.com/html/?q=${encodeURIComponent(`${term} stremio addon manifest`)}`,
            ]);

        return [...new Set([...this.DEFAULT_DISCOVERY_TARGETS, ...envTargets, ...queryTargets])];
    }

    private static extractManifestUrlsFromHtml(html: string, baseUrl: string) {
        const discovered = new Set<string>();

        for (const match of html.matchAll(this.MANIFEST_REGEX)) {
            discovered.add(this.normalizeUrl(match[0]));
        }

        for (const match of html.matchAll(this.HREF_REGEX)) {
            try {
                const absolute = new URL(match[1], baseUrl).toString();
                if (absolute.includes('/manifest.json')) {
                    discovered.add(this.normalizeUrl(absolute));
                }
            } catch {
                // ignora href inválido
            }
        }

        return [...discovered];
    }

    private static async fetchCandidatePage(url: string) {
        const response = await resilientGet(url, {
            timeoutMs: this.REQUEST_TIMEOUT_MS,
            serviceName: 'addon-discovery',
            headers: {
                'User-Agent': 'ORI-SourceDiscovery/1.0',
                Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
            },
        });

        return response.data;
    }

    private static async validateManifest(url: string) {
        const response = await resilientGet(url, {
            timeoutMs: this.REQUEST_TIMEOUT_MS,
            serviceName: 'addon-manifest',
            headers: {
                'User-Agent': 'ORI-SourceDiscovery/1.0',
                Accept: 'application/json,text/plain;q=0.9,*/*;q=0.8',
            },
        });

        const manifest = response.data as StremioManifest;
        if (!manifest?.id || !manifest?.name) {
            throw new Error('Manifesto inválido');
        }

        return manifest;
    }

    private static async installManifest(url: string, manifest: StremioManifest) {
        const existing = await prisma.addon.findUnique({
            where: { manifestUrl: url },
        });

        if (existing) {
            return { addon: existing, installed: false };
        }

        const addon = await prisma.addon.create({
            data: {
                manifestUrl: url,
                name: manifest.name || 'Addon descoberto',
                description: manifest.description || 'Fonte descoberta automaticamente pelo Nexus/Arconte',
                version: manifest.version || 'unknown',
                types: manifest.types ? JSON.stringify(manifest.types) : null,
                resources: manifest.resources
                    ? JSON.stringify(
                        manifest.resources.map((resource: any) =>
                            typeof resource === 'string' ? resource : resource?.name
                        ).filter(Boolean)
                    )
                    : null,
                enabled: true,
            },
        });

        return { addon, installed: true };
    }

    static async discoverManifests(options: DiscoveryOptions = {}) {
        const searchTerms = options.searchTerms || [];
        const limit = options.limit || this.DEFAULT_LIMIT;
        const targets = this.getConfiguredTargets(searchTerms).slice(0, limit * 2);
        const manifestCandidates = new Set<string>();

        for (const target of targets) {
            try {
                if (target.endsWith('/manifest.json')) {
                    manifestCandidates.add(target);
                    continue;
                }

                const payload = await this.fetchCandidatePage(target);
                if (typeof payload === 'string') {
                    this.extractManifestUrlsFromHtml(payload, target).forEach((url) => manifestCandidates.add(url));
                } else if (payload && typeof payload === 'object') {
                    const serialized = JSON.stringify(payload);
                    this.extractManifestUrlsFromHtml(serialized, target).forEach((url) => manifestCandidates.add(url));
                }
            } catch {
                // descoberta é oportunística; um alvo falhar não bloqueia
            }

            if (manifestCandidates.size >= limit) break;
        }

        return [...manifestCandidates].slice(0, limit);
    }

    static async discoverAndInstall(options: DiscoveryOptions = {}): Promise<DiscoveryResult> {
        const manifests = await this.discoverManifests(options);
        const installed: any[] = [];
        const skipped: string[] = [];
        const errors: string[] = [];
        const validatedCandidates: { manifestUrl: string; manifest: StremioManifest; cooldown: Awaited<ReturnType<typeof SearchRankingTelemetry.isSourceCoolingDown>> }[] = [];

        for (const manifestUrl of manifests) {
            try {
                const manifest = await this.validateManifest(manifestUrl);
                const cooldown = await SearchRankingTelemetry.isSourceCoolingDown(manifest.name || 'unknown');
                validatedCandidates.push({ manifestUrl, manifest, cooldown });
            } catch (error: any) {
                errors.push(`${manifestUrl}: ${error?.message || 'erro desconhecido'}`);
            }
        }

        validatedCandidates.sort((a, b) => {
            const aCooling = a.cooldown.coolingDown ? 1 : 0;
            const bCooling = b.cooldown.coolingDown ? 1 : 0;
            if (aCooling !== bCooling) return aCooling - bCooling;

            const aKeepRate = Number(a.cooldown.policy?.keepRate || 0);
            const bKeepRate = Number(b.cooldown.policy?.keepRate || 0);
            if (aKeepRate !== bKeepRate) return bKeepRate - aKeepRate;

            const aDiscardRate = Number(a.cooldown.policy?.discardRate || 0);
            const bDiscardRate = Number(b.cooldown.policy?.discardRate || 0);
            return aDiscardRate - bDiscardRate;
        });

        for (const candidate of validatedCandidates) {
            try {
                if (candidate.cooldown.coolingDown) {
                    skipped.push(`${candidate.manifestUrl}#cooldown:${candidate.cooldown.reason || 'logical-cooldown'}`);
                    continue;
                }

                const result = await this.installManifest(candidate.manifestUrl, candidate.manifest);
                if (result.installed) {
                    installed.push(result.addon);
                } else {
                    skipped.push(candidate.manifestUrl);
                }
            } catch (error: any) {
                errors.push(`${candidate.manifestUrl}: ${error?.message || 'erro desconhecido'}`);
            }
        }

        return {
            manifests,
            installed,
            skipped,
            errors,
        };
    }
}
