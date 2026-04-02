import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import jwt from 'jsonwebtoken';
import axios from 'axios';

import { Server } from 'socket.io';
import http from 'http';
import { ArconteAutoCurator } from './auto-curator';
import { aiService } from './ai-service';
import iptvRouter from './iptv-routes';
import { YouTubeService } from './youtube-service';
import { TMDBService } from './tmdb-service';
import dubbingRoutes from './dubbing-routes';
import intelligenceRoutes from './intelligence-routes';
import { startWorker } from './intelligence-worker';
import { startQueueProcessor, queueDownload, getSystemStats, getPredictionAccuracy, cancelDownload, shutdownDownloader } from './torrent-downloader-v2';
import downloaderRoutes from './routes-downloader-v2';
import seriesRoutes from './routes/series-routes';
import mediaInfoRoutes from './routes/media-info-routes';
import { addonRoutes } from './routes/addon.routes';
import aiChatRoutes from './ai-chat-routes';
import { materializeVideo } from './workers/media-worker';
import { AddonService } from './services/addon.service';

import { governanceRoutes, healthRoutes, searchRoutes, createAuthRoutes } from './modules';
import { SystemTelemetry } from './services/system-telemetry';


// Configuração do FFmpeg local (Portable)
try {
    ffmpeg.setFfmpegPath(ffmpegInstaller.path);
    ffmpeg.setFfprobePath(ffprobeInstaller.path);
} catch (e) {
    console.warn("Aviso: FFmpeg paths não puderam ser definidos automaticamente.", e);
}

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);

// Inicializar Arconte Auto-Curator
const curator = new ArconteAutoCurator();
// Inicia ciclo de 12 horas (para não sobrecarregar em dev)
curator.start(12);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

import { DownloadGovernor } from './services/download-governor';
import { ConsumptionAnalytics } from './services/consumption-analytics';
import { NexusFederation } from './services/nexus-federation';

// 📡 SOCKET.IO: UNIFIED CONNECTION HANDLER
// Registra TODOS os eventos de socket num único handler (evita listeners duplicados)
io.on('connection', (socket) => {
    let activeUserId: string | null = null;
    console.log('⚡ Socket conectado:', socket.id);

    // ── Watch Tracking (Governor) ──
    socket.on('watch:start', async (data: { userId: string, episodeId: string, isFederated?: boolean }) => {
        activeUserId = data.userId;
        DownloadGovernor.registerViewer(data.userId, data.episodeId);

        // Tracking Local vs Federated
        ConsumptionAnalytics.trackRequest(!data.isFederated);

        // 🧠 Cache Intelligence: Verificar se foi um HIT ou MISS
        if (data.episodeId) {
            const ep = await (prisma as any).episode.findUnique({
                where: { id: data.episodeId },
                select: { status: true }
            });
            ConsumptionAnalytics.trackCacheEvent(ep?.status === 'READY');
        }

        console.log(`👁️ [Monitor] Usuário ${data.userId} começou a assistir ${data.episodeId || 'vídeo'}`);
    });

    socket.on('watch:stop', () => {
        if (activeUserId) {
            DownloadGovernor.unregisterViewer(activeUserId);
            activeUserId = null;
        }
    });

    // ── Live Chat (P2P Bridge) ──
    socket.on('join_room', (videoId) => {
        socket.join(videoId);
        console.log(`👤 Socket ${socket.id} entrou na sala do vídeo: ${videoId}`);
    });

    socket.on('send_message', (data) => {
        // data: { videoId, text, user }
        io.to(data.videoId).emit('receive_message', {
            id: Date.now(),
            text: data.text,
            user: data.user,
            timestamp: new Date().toISOString()
        });
    });

    // ── Cleanup ──
    socket.on('disconnect', () => {
        if (activeUserId) {
            DownloadGovernor.unregisterViewer(activeUserId);
        }
        console.log('🔥 Socket desconectado:', socket.id);
    });
});

const PORT = 3000;

// 🔐 SEGURANÇA: JWT Secret — Fail-fast em produção
const isProduction = process.env.NODE_ENV === 'production';
if (!process.env.JWT_SECRET && isProduction) {
    console.error('🚨 [FATAL] JWT_SECRET não definido em produção. Abortando.');
    process.exit(1);
}
if (!process.env.JWT_SECRET) {
    console.warn('⚠️ [SECURITY] JWT_SECRET não definido. Usando chave efêmera (APENAS DEV).');
}
const JWT_SECRET = process.env.JWT_SECRET || require('crypto').randomBytes(32).toString('hex');

function inferCategory(rawCategory?: string, tags?: string[] | string, title?: string) {
    const tagList = Array.isArray(tags)
        ? tags.map(t => String(t).toLowerCase())
        : String(tags || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    const normalized = String(rawCategory || '').toLowerCase();
    const source = `${normalized} ${tagList.join(' ')} ${String(title || '').toLowerCase()}`;

    if (source.includes('series') || source.includes('tv') || source.includes('temporada') || source.includes('season')) {
        return 'Series';
    }

    if (source.includes('movie') || source.includes('filme') || source.includes('movies')) {
        return 'Movies';
    }

    return rawCategory || 'Geral';
}

function inferLanguage(rawLanguage?: string, tags?: string[] | string, title?: string) {
    const haystack = `${rawLanguage || ''} ${Array.isArray(tags) ? tags.join(' ') : tags || ''} ${title || ''}`.toLowerCase();
    if (haystack.includes('pt-br') || haystack.includes('dublado') || haystack.includes('dual audio')) return 'pt-BR';
    if (haystack.includes('legendado')) return 'pt-BR-sub';
    return rawLanguage || 'und';
}

function inferQuality(rawQuality?: string, title?: string) {
    const haystack = `${rawQuality || ''} ${title || ''}`.toLowerCase();
    if (haystack.includes('2160') || haystack.includes('4k') || haystack.includes('uhd')) return '2160p';
    if (haystack.includes('1080')) return '1080p';
    if (haystack.includes('720')) return '720p';
    if (haystack.includes('480')) return '480p';
    return rawQuality || '1080p';
}

function extractMagnetInfoHash(magnet?: string) {
    const match = magnet?.match(/btih:([a-zA-Z0-9]+)/i);
    return match ? match[1].toLowerCase() : null;
}

function buildBasicMagnet(infoHash?: string | null) {
    const normalized = String(infoHash || '').trim().toLowerCase();
    if (!normalized) return null;
    return `magnet:?xt=urn:btih:${normalized}`;
}

async function resolveMovieMaterializationSource(video: any) {
    const normalize = (value?: string | null) => String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    const titleHint = `${video.title || ''} ${video.originalTitle || ''} ${video.description || ''} ${video.tags || ''}`.trim();
    const prefersPortuguese = /(dublado|dual audio|legendado|pt-br|portugues|familia|filme|acao|drama|comedia|terror|aventura)/i.test(titleHint);
    const buildCandidate = (params: {
        magnetURI: string;
        sourceSite: string;
        quality?: string | null;
        language?: string | null;
        seeds?: number | null;
        title?: string | null;
    }) => ({
        magnetURI: params.magnetURI,
        sourceSite: params.sourceSite,
        quality: params.quality || null,
        language: params.language || 'und',
        seeds: Number(params.seeds || 0),
        title: params.title || '',
    });
    const scoreCandidate = (candidate: {
        sourceSite: string;
        quality?: string | null;
        language?: string | null;
        seeds?: number;
        title?: string;
    }) => {
        const sourceName = normalize(candidate.sourceSite);
        const title = String(candidate.title || '');
        const quality = String(candidate.quality || '').toLowerCase();
        const language = String(candidate.language || '').toLowerCase();
        const portugueseTitle = /(dublado|dual audio|pt-br|portuguese|portugues|latino|multi audio)/i.test(title);
        const subtitledTitle = /(legendado|sub)/i.test(title);
        const addonBoost = sourceName.includes('brazuca') ? 40
            : sourceName.includes('torrentio') ? 26
                : sourceName.includes('thepiratebay') ? 14
                    : sourceName.includes('nexus') ? 10
                        : 0;
        const qualityBoost = quality.includes('2160') || quality.includes('4k') ? 14
            : quality.includes('1080') ? 10
                : quality.includes('720') ? 6
                    : 2;
        const portugueseBoost = prefersPortuguese
            ? (language === 'pt-br' || portugueseTitle ? 55 : language === 'pt-br-sub' || subtitledTitle ? 26 : 0)
            : (language === 'pt-br' || portugueseTitle ? 20 : 0);

        return addonBoost + qualityBoost + portugueseBoost + Math.min(40, Number(candidate.seeds || 0));
    };
    const existingMagnet = video.hlsPath?.startsWith('magnet:')
        ? video.hlsPath
        : video.storageKey?.startsWith('magnet:')
            ? video.storageKey
            : null;

    if (existingMagnet) {
        return {
            magnetURI: existingMagnet,
            sourceSite: 'catalog',
            quality: video.quality || null,
            language: video.hasDubbed ? 'pt-BR' : video.hasPortuguese ? 'pt-BR-sub' : 'und',
        };
    }

    const candidates: Array<{
        magnetURI: string;
        sourceSite: string;
        quality?: string | null;
        language?: string | null;
        seeds?: number;
        title?: string;
    }> = [];

    const addonLookupId = video.imdbId || video.tmdbId || null;
    if (addonLookupId) {
        try {
            const streams = await AddonService.getStreamsFromAllAddons('movie', String(addonLookupId), {
                title: titleHint,
            });

            streams
                .filter((candidate: any) => candidate?.url?.startsWith('magnet:') || candidate?.infoHash)
                .slice(0, 12)
                .forEach((stream: any) => {
                    const magnetURI = stream.url?.startsWith('magnet:') ? stream.url : buildBasicMagnet(stream.infoHash);
                    if (!magnetURI) return;

                    candidates.push(buildCandidate({
                        magnetURI,
                        sourceSite: stream.addonName || 'addon',
                        quality: /2160|4k/i.test(stream.title || '') ? '2160p' : /1080/i.test(stream.title || '') ? '1080p' : /720/i.test(stream.title || '') ? '720p' : video.quality || '1080p',
                        language: /dublado|dual audio|pt-br|multi audio|latino/i.test(stream.title || '') ? 'pt-BR' : /legendado|sub/i.test(stream.title || '') ? 'pt-BR-sub' : 'und',
                        seeds: (() => {
                            const matches = [...String(stream.title || '').matchAll(/(?:peer(?:s)?|seed(?:s|ers?)?|👤)[^\d]{0,6}(\d{1,5})/gi)];
                            return matches.reduce((best, match) => Math.max(best, Number(match[1] || 0)), 0);
                        })(),
                        title: stream.title || stream.name || '',
                    }));
                });
        } catch (error: any) {
            console.warn(`⚠️ [Play] Addon lookup falhou para ${video.title}: ${error?.message || error}`);
        }
    }

    const searchTerms = [video.title, video.originalTitle].filter(Boolean);
    for (const query of searchTerms) {
        try {
            const nexusResponse = await axios.post('http://localhost:3005/api/search/ultra', {
                query,
                category: 'Movies',
                limit: 8,
            }, { timeout: 20000 });

            const nexusCandidates = (nexusResponse.data?.results || [])
                .filter((item: any) => item?.magnetLink)
                .sort((a: any, b: any) => {
                    const aPt = /dublado|dual audio|pt-br/i.test(a.title || '') ? 25 : 0;
                    const bPt = /dublado|dual audio|pt-br/i.test(b.title || '') ? 25 : 0;
                    return ((b.seeds || 0) + bPt) - ((a.seeds || 0) + aPt);
                })
                .slice(0, 8);

            nexusCandidates.forEach((candidate: any) => {
                candidates.push(buildCandidate({
                    magnetURI: candidate.magnetLink,
                    sourceSite: candidate.sourceSite || candidate.provider || 'Nexus',
                    quality: /2160|4k/i.test(candidate.title || '') ? '2160p' : /1080/i.test(candidate.title || '') ? '1080p' : /720/i.test(candidate.title || '') ? '720p' : video.quality || '1080p',
                    language: /dublado|dual audio|pt-br|multi audio|latino/i.test(candidate.title || '') ? 'pt-BR' : /legendado|sub/i.test(candidate.title || '') ? 'pt-BR-sub' : 'und',
                    seeds: Number(candidate.seeds || 0),
                    title: candidate.title || '',
                }));
            });
        } catch (error: any) {
            console.warn(`⚠️ [Play] Nexus lookup falhou para ${query}: ${error?.message || error}`);
        }
    }

    const seen = new Set<string>();
    const ranked = candidates
        .filter((candidate) => {
            const key = extractMagnetInfoHash(candidate.magnetURI) || candidate.magnetURI;
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((a, b) => scoreCandidate(b) - scoreCandidate(a));

    if (ranked[0]) {
        return ranked[0];
    }

    return null;
}

function splitTags(tags?: string | string[] | null) {
    if (Array.isArray(tags)) {
        return tags.map(tag => String(tag).trim()).filter(Boolean);
    }

    return String(tags || '')
        .split(',')
        .map(tag => tag.trim())
        .filter(Boolean);
}

function normalizeText(value?: string | null) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function detectPortugueseAffinity(input: { title?: string | null; description?: string | null; tags?: string[] | string | null; category?: string | null; hasDubbed?: boolean; hasPortuguese?: boolean; hasPortugueseAudio?: boolean; hasPortugueseSubs?: boolean; }) {
    const tagList = splitTags(input.tags);
    const haystack = normalizeText([
        input.title,
        input.description,
        input.category,
        ...tagList,
    ].join(' '));

    const dubbed = !!input.hasDubbed || !!input.hasPortugueseAudio || /\bdublado\b|\bdual audio\b|\bpt-br\b|\bportugues\b|\bportuguese\b/.test(haystack);
    const subtitled = !!input.hasPortugueseSubs || /\blegendado\b|\blegendas\b/.test(haystack);
    const portuguese = dubbed || subtitled || !!input.hasPortuguese;

    return {
        dubbed,
        subtitled,
        portuguese,
        score: dubbed ? 45 : portuguese ? 20 : 0,
    };
}

function detectFamilyAffinity(input: { title?: string | null; description?: string | null; tags?: string[] | string | null; category?: string | null; }) {
    const haystack = normalizeText([
        input.title,
        input.description,
        input.category,
        ...splitTags(input.tags),
    ].join(' '));

    const family = /\bfamily\b|\bfamilia\b|\binfantil\b|\bkids\b|\bcriancas\b|\banimacao\b|\banime\b|\baventura\b|\bcomedia\b|\bcomedy\b|\bdisney\b|\bpixar\b/.test(haystack);
    return {
        family,
        score: family ? 18 : 0,
    };
}

function detectKidsAffinity(input: { title?: string | null; description?: string | null; tags?: string[] | string | null; category?: string | null; }) {
    const haystack = normalizeText([
        input.title,
        input.description,
        input.category,
        ...splitTags(input.tags),
    ].join(' '));

    const kids = /\binfantil\b|\bkids\b|\bcriancas\b|\bcrianca\b|\bdisney\b|\bpixar\b|\bpatrulha canina\b|\bpeppa\b|\bgalinha pintadinha\b|\banimacao\b/.test(haystack);
    return {
        kids,
        score: kids ? 24 : 0,
    };
}

function detectAdultAffinity(input: { title?: string | null; description?: string | null; tags?: string[] | string | null; category?: string | null; }) {
    const haystack = normalizeText([
        input.title,
        input.description,
        input.category,
        ...splitTags(input.tags),
    ].join(' '));

    const adult = /\bterror\b|\bhorror\b|\bthriller\b|\bsuspense\b|\bcrime\b|\bviolencia\b|\bviolent\b|\berotico\b|\badult\b|\bguerra\b|\bwar\b/.test(haystack);
    return {
        adult,
        score: adult ? 14 : 0,
    };
}

function getWeightedBoost(pool: Record<string, number> | undefined, values: string[] = [], cap = 24, multiplier = 6) {
    if (!pool) return 0;
    const total = values.reduce((sum, value) => sum + Number(pool[normalizeText(value)] || 0), 0);
    return Math.min(cap, total * multiplier);
}

function dedupeByTitle(items: any[]) {
    const seen = new Set<string>();
    return items.filter((item) => {
        const key = normalizeText(item.title);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function diversifyItems(items: any[], limit = 18) {
    const selected: any[] = [];
    const categoryCount = new Map<string, number>();

    for (const item of items) {
        if (selected.length >= limit) break;

        const category = normalizeText(item.category || item.kind || 'geral');
        const titleKey = normalizeText(item.title);
        const currentCount = categoryCount.get(category) || 0;
        const alreadyHasTitle = selected.some((candidate) => normalizeText(candidate.title) === titleKey);

        if (alreadyHasTitle) continue;
        if (currentCount >= 4 && items.length > limit) continue;

        selected.push(item);
        categoryCount.set(category, currentCount + 1);
    }

    return selected;
}

function dubbedFirstChoice(items: any[]) {
    return items.find((item) => item.isDubbed && item.status === 'READY')
        || items.find((item) => item.isDubbed)
        || items.find((item) => item.isPortuguese && item.status === 'READY')
        || items.find((item) => item.isPortuguese);
}

function detectSessionFit(item: any) {
    const durationMinutes = Number(item.durationMinutes || 0) || null;
    const episodeReadyCount = Number(item.readyEpisodes || item.views || 0);
    const isSeries = item.kind === 'series';
    const isQuick = isSeries ? episodeReadyCount > 0 && episodeReadyCount <= 6 : (durationMinutes !== null ? durationMinutes <= 120 : false);
    const isMarathon = isSeries ? episodeReadyCount >= 8 : (durationMinutes !== null ? durationMinutes >= 130 : false);

    return {
        quick: isQuick,
        marathon: isMarathon,
    };
}

function getDayMoment() {
    const hour = Number(new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hour12: false,
        timeZone: 'America/Sao_Paulo',
    }).format(new Date()));

    if (hour < 6) return 'late-night';
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    if (hour < 23) return 'evening';
    return 'late-night';
}

function getVideoDiscoveryScore(video: any, context: {
    preferredCategories?: string[];
    preferredTags?: string[];
    preferredCategoryWeights?: Record<string, number>;
    preferredTagWeights?: Record<string, number>;
    favoriteVideoIds?: string[];
    recentVideoIds?: string[];
    completedVideoIds?: string[];
    abandonedVideoIds?: string[];
    audienceProfile?: string;
} = {}) {
    const statusWeight = video.status === 'READY' ? 45 : video.status === 'CATALOG' ? 35 : video.status === 'NEXUS' ? 25 : 10;
    const freshnessHours = Math.max(1, (Date.now() - new Date(video.createdAt).getTime()) / (1000 * 60 * 60));
    const freshness = Math.max(0, 36 - Math.min(36, freshnessHours / 6));
    const popularity = Math.min(40, Number(video.views || 0) * 2);
    const portuguese = detectPortugueseAffinity(video);
    const family = detectFamilyAffinity(video);
    const kids = detectKidsAffinity(video);
    const adult = detectAdultAffinity(video);
    const category = inferCategory(video.category, video.tags, video.title);
    const normalizedTags = splitTags(video.tags).map(normalizeText);
    const preferredCategoryBoost = (context.preferredCategories || []).some((item) => normalizeText(item) === normalizeText(category)) ? 20 : 0;
    const preferredTagBoost = normalizedTags.some((tag) => (context.preferredTags || []).includes(tag)) ? 12 : 0;
    const metadataBonus = video.thumbnailPath ? 10 : 0;
    const weightedCategoryBoost = getWeightedBoost(context.preferredCategoryWeights, [category], 28, 8);
    const weightedTagBoost = getWeightedBoost(context.preferredTagWeights, normalizedTags, 24, 4);
    const favoriteBoost = (context.favoriteVideoIds || []).includes(video.id) ? 18 : 0;
    const repeatPenalty = (context.recentVideoIds || []).includes(video.id) ? 22 : 0;
    const completionBoost = (context.completedVideoIds || []).includes(video.id) ? 16 : 0;
    const abandonPenalty = (context.abandonedVideoIds || []).includes(video.id) ? 28 : 0;
    const readinessBonus = video.status === 'READY' && portuguese.portuguese ? 14 : 0;
    const profileBoost =
        context.audienceProfile === 'kids' ? (kids.score * 2 + family.score + (adult.adult ? -40 : 0)) :
            context.audienceProfile === 'family' ? (family.score * 2 + portuguese.score + (adult.adult ? -20 : 0)) :
                context.audienceProfile === 'adult' ? (adult.score * 2 + (kids.kids ? -24 : 0)) :
                    0;

    return statusWeight + freshness + popularity + portuguese.score + family.score + kids.score + preferredCategoryBoost + preferredTagBoost + weightedCategoryBoost + weightedTagBoost + favoriteBoost + completionBoost + readinessBonus + metadataBonus + profileBoost - repeatPenalty - abandonPenalty;
}

function getSeriesDiscoveryScore(series: any, context: {
    preferredCategories?: string[];
    preferredTags?: string[];
    preferredCategoryWeights?: Record<string, number>;
    preferredTagWeights?: Record<string, number>;
    audienceProfile?: string;
} = {}) {
    const freshnessHours = Math.max(1, (Date.now() - new Date(series.updatedAt || series.createdAt).getTime()) / (1000 * 60 * 60));
    const freshness = Math.max(0, 32 - Math.min(32, freshnessHours / 8));
    const progress = Math.min(35, Number(series.progress || 0) / 2);
    const completeness = Math.min(25, Number(series.readyEpisodes || 0) * 2);
    const portuguese = detectPortugueseAffinity({
        title: series.title,
        description: series.overview,
        tags: series.genres,
        category: 'Series',
    });
    const family = detectFamilyAffinity({
        title: series.title,
        description: series.overview,
        tags: series.genres,
        category: 'Series',
    });
    const kids = detectKidsAffinity({
        title: series.title,
        description: series.overview,
        tags: series.genres,
        category: 'Series',
    });
    const adult = detectAdultAffinity({
        title: series.title,
        description: series.overview,
        tags: series.genres,
        category: 'Series',
    });
    const preferredCategoryBoost = (context.preferredCategories || []).some((item) => normalizeText(item) === 'series') ? 20 : 0;
    const normalizedGenres = splitTags(series.genres).map(normalizeText);
    const preferredTagBoost = normalizedGenres.some((tag) => (context.preferredTags || []).includes(tag)) ? 12 : 0;
    const metadataBonus = series.poster || series.backdrop ? 15 : 0;
    const weightedCategoryBoost = getWeightedBoost(context.preferredCategoryWeights, ['Series'], 28, 8);
    const weightedTagBoost = getWeightedBoost(context.preferredTagWeights, normalizedGenres, 24, 4);
    const profileBoost =
        context.audienceProfile === 'kids' ? (kids.score * 2 + family.score + (adult.adult ? -40 : 0)) :
            context.audienceProfile === 'family' ? (family.score * 2 + portuguese.score + (adult.adult ? -20 : 0)) :
                context.audienceProfile === 'adult' ? (adult.score * 2 + (kids.kids ? -24 : 0)) :
                    0;

    return freshness + progress + completeness + portuguese.score + family.score + kids.score + preferredCategoryBoost + preferredTagBoost + weightedCategoryBoost + weightedTagBoost + metadataBonus + profileBoost;
}

function toDiscoveryVideoItem(video: any, score: number) {
    const portuguese = detectPortugueseAffinity(video);
    const kids = detectKidsAffinity(video);
    const family = detectFamilyAffinity(video);
    const adult = detectAdultAffinity(video);
    return {
        kind: 'video',
        id: video.id,
        title: video.title,
        subtitle: video.description || 'Filme pronto para entrar na sua próxima sessão em família.',
        image: video.thumbnailPath,
        backdrop: video.thumbnailPath,
        href: `/videos/${video.id}`,
        badge: portuguese.dubbed ? 'Dublado' : portuguese.subtitled ? 'Legendado PT-BR' : (video.status || 'Nexus'),
        score,
        status: video.status,
        category: inferCategory(video.category, video.tags, video.title),
        quality: inferQuality(video.quality, video.title),
        durationMinutes: video.duration ? Math.round(Number(video.duration) / 60) : null,
        views: Number(video.views || 0),
        isPortuguese: portuguese.portuguese,
        isDubbed: portuguese.dubbed,
        isKidsSafe: kids.kids,
        isFamilySafe: family.family || kids.kids,
        isAdult: adult.adult,
        safetyLabel: kids.kids ? 'kids-safe' : family.family ? 'family-safe' : adult.adult ? 'adult' : 'general',
        tags: splitTags(video.tags),
        createdAt: video.createdAt,
    };
}

function toDiscoverySeriesItem(series: any, score: number) {
    const portuguese = detectPortugueseAffinity({
        title: series.title,
        description: series.overview,
        tags: series.genres,
        category: 'Series',
    });
    const kids = detectKidsAffinity({
        title: series.title,
        description: series.overview,
        tags: series.genres,
        category: 'Series',
    });
    const family = detectFamilyAffinity({
        title: series.title,
        description: series.overview,
        tags: series.genres,
        category: 'Series',
    });
    const adult = detectAdultAffinity({
        title: series.title,
        description: series.overview,
        tags: series.genres,
        category: 'Series',
    });
    return {
        kind: 'series',
        id: series.id,
        title: series.title,
        subtitle: series.overview || 'Série organizada por temporada e pronta para maratona.',
        image: series.poster || series.backdrop,
        backdrop: series.backdrop || series.poster,
        href: `/series/${series.id}`,
        badge: portuguese.dubbed ? 'Série em português' : `${series.totalSeasons || 0} temporadas`,
        score,
        status: series.status,
        category: 'Series',
        quality: `${series.totalEpisodes || 0} episódios`,
        readyEpisodes: Number(series.readyEpisodes || 0),
        views: Number(series.readyEpisodes || 0),
        isPortuguese: portuguese.portuguese,
        isDubbed: portuguese.dubbed,
        isKidsSafe: kids.kids,
        isFamilySafe: family.family || kids.kids,
        isAdult: adult.adult,
        safetyLabel: kids.kids ? 'kids-safe' : family.family ? 'family-safe' : adult.adult ? 'adult' : 'general',
        tags: splitTags(series.genres),
        createdAt: series.updatedAt || series.createdAt,
    };
}

function chooseFeaturedItem(items: any[], context: {
    dayMoment: string;
    familyHeavy?: boolean;
    adultHeavy?: boolean;
    audienceProfile?: string;
}) {
    const readyItems = items.filter((item) => item.status === 'READY');
    const source = readyItems.length > 0 ? readyItems : items;

    if (context.audienceProfile === 'kids') {
        return source.find((item) => item.isPortuguese && detectKidsAffinity(item).kids)
            || source.find((item) => detectKidsAffinity(item).kids)
            || source.find((item) => item.isPortuguese && detectFamilyAffinity(item).family);
    }

    if (context.audienceProfile === 'family') {
        return source.find((item) => item.isPortuguese && detectFamilyAffinity(item).family)
            || source.find((item) => detectFamilyAffinity(item).family)
            || source.find((item) => item.isPortuguese);
    }

    if (context.audienceProfile === 'adult') {
        return source.find((item) => detectAdultAffinity(item).adult && item.isPortuguese)
            || source.find((item) => detectAdultAffinity(item).adult)
            || source.find((item) => item.kind === 'video');
    }

    if (context.dayMoment === 'morning' || context.dayMoment === 'afternoon') {
        return source.find((item) => item.isPortuguese && detectFamilyAffinity(item).family)
            || source.find((item) => detectSessionFit(item).quick && item.isPortuguese)
            || source.find((item) => detectFamilyAffinity(item).family);
    }

    if (context.dayMoment === 'evening') {
        return source.find((item) => item.kind === 'video' && item.isPortuguese)
            || source.find((item) => item.kind === 'video')
            || source.find((item) => item.kind === 'series' && item.isPortuguese);
    }

    if (context.dayMoment === 'late-night') {
        return source.find((item) => context.adultHeavy && detectAdultAffinity(item).adult)
            || source.find((item) => detectSessionFit(item).marathon)
            || source.find((item) => item.kind === 'series');
    }

    if (context.familyHeavy) {
        return source.find((item) => item.isPortuguese && detectFamilyAffinity(item).family)
            || source.find((item) => detectFamilyAffinity(item).family);
    }

    return dubbedFirstChoice(source) || source[0] || null;
}

function buildDiscoveryRows(items: any[], context: {
    continueWatching?: any[];
    preferredItems?: any[];
    avgSessionTime?: number;
    completionRate?: number;
    dayMoment?: string;
    familyHeavy?: boolean;
    adultHeavy?: boolean;
    audienceProfile?: string;
} = {}) {
    const videos = dedupeByTitle(items.filter(item => item.kind === 'video'));
    const series = dedupeByTitle(items.filter(item => item.kind === 'series'));
    const portugueseFirst = diversifyItems(items.filter(item => item.isPortuguese), 18);
    const dubbedFirst = diversifyItems(items.filter(item => item.isDubbed), 18);
    const kidsFirst = diversifyItems(items.filter((item) => detectKidsAffinity(item).kids).sort((a, b) => b.score - a.score), 18);
    const familyFirst = diversifyItems(items.filter((item) => detectFamilyAffinity(item).family).sort((a, b) => b.score - a.score), 18);
    const adultNight = diversifyItems(items.filter((item) => detectAdultAffinity(item).adult).sort((a, b) => b.score - a.score), 18);
    const recent = diversifyItems([...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), 18);
    const trending = diversifyItems([...items].sort((a, b) => b.score - a.score), 18);
    const continueWatching = dedupeByTitle(context.continueWatching || []).slice(0, 18);
    const becauseYouLike = diversifyItems(context.preferredItems || [], 18);
    const quickSession = diversifyItems(items.filter((item) => detectSessionFit(item).quick).sort((a, b) => b.score - a.score), 18);
    const marathonMode = diversifyItems(items.filter((item) => detectSessionFit(item).marathon).sort((a, b) => b.score - a.score), 18);
    const prefersMarathon = Number(context.avgSessionTime || 0) >= 3600 || Number(context.completionRate || 0) >= 0.65;
    const prefersQuick = Number(context.avgSessionTime || 0) > 0 && Number(context.avgSessionTime || 0) < 2400;

    const rows = [
        {
            id: 'continue-watching',
            title: 'Continue de onde parou',
            subtitle: 'Sessões recentes para voltar com um clique e sem procurar.',
            items: continueWatching,
        },
        {
            id: 'family-portuguese',
            title: 'Em português para sua família',
            subtitle: 'Onde o Orion deve insistir primeiro: dublado, PT-BR e fácil de apertar play.',
            items: dubbedFirst.length > 0 ? dubbedFirst : portugueseFirst,
        },
        {
            id: 'kids-safe',
            title: 'Modo infantil',
            subtitle: 'Uma faixa mais segura e simples para crianças.',
            items: kidsFirst,
        },
        {
            id: 'family-night',
            title: 'Sessão tranquila para a casa toda',
            subtitle: 'Títulos com mais cara de sofá, pipoca e play rápido.',
            items: familyFirst,
        },
        {
            id: 'light-now',
            title: 'Hoje quero algo leve',
            subtitle: 'Uma seleção de play fácil para não cansar a cabeça.',
            items: quickSession.length > 0 ? quickSession : familyFirst,
        },
        {
            id: 'because-you-like',
            title: 'Porque combina com o que vocês assistem',
            subtitle: 'O Orion puxando gêneros e sinais do seu próprio histórico.',
            items: becauseYouLike,
        },
        {
            id: 'quick-session',
            title: 'Sessão curta, impacto rápido',
            subtitle: 'Conteúdo mais leve para sessão curta e imediata.',
            items: quickSession,
        },
        {
            id: 'marathon-mode',
            title: 'Maratona aberta',
            subtitle: 'Quando a casa está com tempo para deixar rodando.',
            items: marathonMode,
        },
        {
            id: 'fresh-discoveries',
            title: 'O que chegou e já merece atenção',
            subtitle: 'Novidades do Arconte com capa, sinopse e potencial real de sessão.',
            items: recent,
        },
        {
            id: 'movie-night',
            title: 'Filme da noite',
            subtitle: 'Longas com mais cara de play imediato.',
            items: videos.slice(0, 18),
        },
        {
            id: 'series-marathon',
            title: 'Séries para maratonar',
            subtitle: 'Séries com mais episódios prontos e melhor apelo visual.',
            items: series.slice(0, 18),
        },
        {
            id: 'after-dark',
            title: 'Depois que as crianças dormem',
            subtitle: 'Catálogo mais adulto para o fim do dia.',
            items: adultNight,
        },
        {
            id: 'nexus-pulse',
            title: 'Radar do Nexus',
            subtitle: 'O mix mais forte do seu catálogo agora.',
            items: trending,
        },
    ].filter(row => row.items.length > 0);

    if (context.audienceProfile === 'kids') {
        return rows
            .filter((row) => row.id !== 'after-dark')
            .sort((a, b) => {
                const scoreA = a.id === 'kids-safe' || a.id === 'light-now' || a.id === 'family-portuguese' ? -3 : 0;
                const scoreB = b.id === 'kids-safe' || b.id === 'light-now' || b.id === 'family-portuguese' ? -3 : 0;
                return scoreA - scoreB;
            });
    }

    if (context.audienceProfile === 'family' || (context.familyHeavy && !context.adultHeavy)) {
        return rows.sort((a, b) => {
            const scoreA = a.id === 'family-portuguese' || a.id === 'family-night' || a.id === 'light-now' ? -2 : 0;
            const scoreB = b.id === 'family-portuguese' || b.id === 'family-night' || b.id === 'light-now' ? -2 : 0;
            return scoreA - scoreB;
        });
    }

    if (context.audienceProfile === 'adult' || context.adultHeavy) {
        return rows.sort((a, b) => {
            const scoreA = a.id === 'after-dark' ? -2 : a.id === 'family-night' ? 2 : 0;
            const scoreB = b.id === 'after-dark' ? -2 : b.id === 'family-night' ? 2 : 0;
            return scoreA - scoreB;
        });
    }

    if (prefersMarathon) {
        return rows.sort((a, b) => {
            const scoreA = a.id === 'marathon-mode' ? -2 : a.id === 'quick-session' ? 2 : 0;
            const scoreB = b.id === 'marathon-mode' ? -2 : b.id === 'quick-session' ? 2 : 0;
            return scoreA - scoreB;
        });
    }

    if (prefersQuick) {
        return rows.sort((a, b) => {
            const scoreA = a.id === 'quick-session' ? -2 : a.id === 'marathon-mode' ? 2 : 0;
            const scoreB = b.id === 'quick-session' ? -2 : b.id === 'marathon-mode' ? 2 : 0;
            return scoreA - scoreB;
        });
    }

    return rows;
}

async function buildDiscoveryFeed(userId?: string, audienceProfile = 'house') {
    const [videosRaw, seriesRaw, history, favorites, watchSessions, userProfile] = await Promise.all([
        prisma.video.findMany({
            where: { status: { in: ['READY', 'CATALOG', 'NEXUS', 'REMOTE'] } },
            orderBy: { createdAt: 'desc' },
            take: 200,
        }),
        (prisma as any).series.findMany({
            include: {
                episodes: { select: { status: true } },
            },
            orderBy: { updatedAt: 'desc' },
            take: 120,
        }),
        userId
            ? prisma.playbackHistory.findMany({
                where: { userId },
                include: { video: true },
                orderBy: { updatedAt: 'desc' },
                take: 12,
            })
            : Promise.resolve([]),
        userId
            ? prisma.favorite.findMany({
                where: { userId },
                include: { video: true },
                orderBy: { createdAt: 'desc' },
                take: 24,
            })
            : Promise.resolve([]),
        userId
            ? (prisma as any).watchSession.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                take: 80,
            })
            : Promise.resolve([]),
        userId
            ? (prisma as any).userProfile.findUnique({
                where: { userId },
            })
            : Promise.resolve(null),
    ]);

    const preferredCategories = history.map((entry: any) => entry.video?.category).filter(Boolean);
    const preferredTags = history
        .flatMap((entry: any) => splitTags(entry.video?.tags))
        .map(normalizeText)
        .filter(Boolean);
    const preferredCategoryWeights = preferredCategories.reduce((acc: Record<string, number>, category: string) => {
        const key = normalizeText(category);
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
    const preferredTagWeights = preferredTags.reduce((acc: Record<string, number>, tag: string) => {
        acc[tag] = (acc[tag] || 0) + 1;
        return acc;
    }, {});
    const favoriteVideoIds = favorites.map((entry: any) => entry.videoId).filter(Boolean);
    const recentVideoIds = history.map((entry: any) => entry.videoId).filter(Boolean);
    const completedVideoIds = Array.from(new Set(
        watchSessions
            .filter((entry: any) => !!entry.completed)
            .map((entry: any) => entry.videoId)
            .filter(Boolean)
    ));
    const abandonedVideoIds = Array.from(new Set(
        watchSessions
            .filter((entry: any) => !!entry.abandoned)
            .map((entry: any) => entry.videoId)
            .filter(Boolean)
    ));
    const familySignal = preferredTags.filter((tag) => /familia|family|infantil|kids|animacao|anime|aventura|comedia/.test(tag)).length;
    const adultSignal = preferredTags.filter((tag) => /terror|horror|thriller|crime|suspense|guerra|adult/.test(tag)).length;
    const dayMoment = getDayMoment();

    const scoredVideos = videosRaw
        .map((video: any) => toDiscoveryVideoItem(video, getVideoDiscoveryScore(video, {
            preferredCategories,
            preferredTags,
            preferredCategoryWeights,
            preferredTagWeights,
            favoriteVideoIds,
            recentVideoIds,
            completedVideoIds,
            abandonedVideoIds,
            audienceProfile,
        })))
        .filter((item: any) => !!item.image)
        .sort((a: any, b: any) => b.score - a.score);

    const scoredSeries = seriesRaw
        .map((series: any) => {
            const readyEpisodes = (series.episodes || []).filter((episode: any) => episode.status === 'READY').length;
            const totalEpisodes = (series.episodes || []).length;
            return {
                ...series,
                readyEpisodes,
                progress: totalEpisodes > 0 ? Math.round((readyEpisodes / totalEpisodes) * 100) : 0,
            };
        })
        .map((series: any) => toDiscoverySeriesItem(series, getSeriesDiscoveryScore(series, {
            preferredCategories,
            preferredTags,
            preferredCategoryWeights,
            preferredTagWeights,
            audienceProfile,
        })))
        .filter((item: any) => !!item.image)
        .sort((a: any, b: any) => b.score - a.score);

    const visibilityFilteredVideos = audienceProfile === 'kids'
        ? scoredVideos.filter((item: any) => !item.isAdult)
        : scoredVideos;
    const visibilityFilteredSeries = audienceProfile === 'kids'
        ? scoredSeries.filter((item: any) => !item.isAdult)
        : scoredSeries;

    const allItems = [...visibilityFilteredVideos, ...visibilityFilteredSeries].sort((a, b) => b.score - a.score);
    const continueWatching = history
        .filter((entry: any) => {
            const duration = Number(entry.video?.duration || 0);
            const lastTime = Number(entry.lastTime || 0);
            if (lastTime < 60) return false;
            if (duration > 0 && lastTime >= duration * 0.92) return false;
            return true;
        })
        .map((entry: any) => visibilityFilteredVideos.find((item: any) => item.id === entry.videoId))
        .filter(Boolean);
    const preferredItems = allItems.filter((item: any) => {
        const normalizedCategory = normalizeText(item.category);
        const itemTags = (item.tags || []).map(normalizeText);
        return !abandonedVideoIds.includes(item.id) && (
            preferredCategories.some((category) => normalizeText(category) === normalizedCategory)
            || itemTags.some((tag: string) => preferredTags.includes(tag))
        );
    });
    const rows = buildDiscoveryRows(allItems, {
        continueWatching,
        preferredItems,
        avgSessionTime: Number(userProfile?.avgSessionTime || 0),
        completionRate: Number(userProfile?.completionRate || 0),
        dayMoment,
        familyHeavy: familySignal >= adultSignal,
        adultHeavy: adultSignal > familySignal,
        audienceProfile,
    });
    const featured = chooseFeaturedItem(allItems, {
        dayMoment,
        familyHeavy: familySignal >= adultSignal,
        adultHeavy: adultSignal > familySignal,
        audienceProfile,
    }) || dubbedFirstChoice(allItems) || allItems[0] || null;

    return {
        featured,
        rows,
        movies: diversifyItems(visibilityFilteredVideos, 30),
        series: diversifyItems(visibilityFilteredSeries, 30),
        spotlight: diversifyItems(allItems, 12),
        audienceProfile,
    };
}

// Middleware CORS Enable All
app.use(cors({ origin: '*' }));
app.use(express.json());

// 📺 IPTV MODULE
app.use('/api/iptv', iptvRouter);
app.use('/api/v1/iptv', iptvRouter);

// 🎙️ DUBBING & SUBTITLES MODULE
app.use('/api/v1', dubbingRoutes);
app.use('/uploads/subtitles', express.static(path.join(__dirname, '../uploads/subtitles')));
app.use('/uploads/dubbing', express.static(path.join(__dirname, '../uploads/dubbing')));

// 🧠 INTELLIGENCE ENGINE (Sistema de Recomendação Híbrido)
app.use('/api/intelligence', intelligenceRoutes);

// 📥 DOWNLOADER V2 (Fila de Ingestão com Orquestração P2P)
app.use('/api/v1/downloads', downloaderRoutes);
app.use('/api/v1/addons', addonRoutes); // 🧩 STREMIO ADDONS MANAGER

// 📺 SERIES MANAGEMENT (Orquestrador de Séries)
app.use('/api/v1/series', seriesRoutes);

// 🎬 MEDIA INFO (Informações de Áudio e Legendas)
app.use('/api/v1/media-info', mediaInfoRoutes);

// 🤖 AI CHAT (Assistente Inteligente)
app.use('/api/ai-chat', aiChatRoutes);

// 🛡️ GOVERNANCE, TELEMETRY, FEDERATION (Module)
app.use('/api/v1', governanceRoutes);

// 🏥 HEALTH CHECK (Module — sem prefixo /api/v1)
app.use('', healthRoutes);

// 🌌 SEARCH (Module)  
app.use('/api/v1/search', searchRoutes);

// 🔐 AUTH (Module)
app.use('/api/v1/auth', createAuthRoutes(JWT_SECRET));

// (Governor, Telemetry, Health, Federation, Search, Auth — agora em modules/)

// 🌌 ORION PROTOCOL (Federation Layer)
import { orionRoutes } from './orion/routes';
import { orionNode } from './orion/service';

app.use('/api/v1/orion', orionRoutes);

// Inicializar Orion Node em Background
orionNode.start().catch(err => console.error('❌ [Orion] Falha ao iniciar nó:', err));


app.get('/api/videos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const video = await YouTubeService.getVideoDetails(id);
        if (!video) return res.status(404).json({ error: "Vídeo não encontrado." });
        res.json(video);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Arquivos Estáticos HLS
app.use('/hls', express.static(process.env.STORAGE_PATH || path.join(__dirname, '../storage')));

// Servir arquivos estáticos (HLS, Vídeos e Thumbnails)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Servir arquivos de downloads (vídeos baixados via torrent)
app.use('/downloads', express.static(path.join(__dirname, '../downloads')));

// Configuração do Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    },
});
const upload = multer({ storage });

// Health Check V1
app.get('/api/v1', (req, res) => {
    res.json({ message: "StreamForge API is running..." });
});


// Auth routes now in modules/auth (registered above)

// ==========================================
// ROTAS DE VÍDEOS & RECOMENDAÇÕES
// ==========================================

app.get('/api/v1/videos', async (req, res) => {
    try {
        const videos = await prisma.video.findMany({ orderBy: { createdAt: 'desc' }, include: { user: true } });
        res.json(videos);
    } catch (e) {
        res.status(500).json({ error: "Failed to fetch videos" });
    }
});

// Sistema de Recomendação Baseado em IA (Simulado)
app.get('/api/v1/videos/recommended', async (req, res) => {
    try {
        // Pega 6 mais vistos e 6 mais recentes para diversidade
        const [topViewed, latest] = await Promise.all([
            prisma.video.findMany({ where: { status: { in: ['READY', 'CATALOG', 'NEXUS', 'REMOTE'] } }, take: 6, orderBy: { views: 'desc' } }),
            prisma.video.findMany({ where: { status: { in: ['READY', 'CATALOG', 'NEXUS', 'REMOTE'] } }, take: 6, orderBy: { createdAt: 'desc' } })
        ]);

        const merged = [...topViewed, ...latest];
        const unique = Array.from(new Map(merged.map(v => [v.id, v])).values());

        res.json(unique);
    } catch (e) {
        res.status(500).json({ error: "Failed to fetch recommendations" });
    }
});

app.get('/api/v1/videos/:id', async (req, res) => {
    const video = await prisma.video.findUnique({ where: { id: req.params.id }, include: { user: true } });
    if (!video) return res.status(404).json({ error: 'Video not found' });
    res.json(video);
});

app.delete('/api/v1/videos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const video = await prisma.video.findUnique({ where: { id } });

        if (!video) return res.status(404).json({ error: 'Vídeo não encontrado' });

        console.log(`🗑️ [Deletor] Removendo ativo: ${video.title} (${id})`);

        // 1. Limpeza de Arquivos Locais (Uploads)
        const uploadDir = path.join(__dirname, '../uploads');
        if (video.storageKey) {
            const videoPath = path.join(uploadDir, video.storageKey);
            if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
        }
        if (video.thumbnailPath && !video.thumbnailPath.startsWith('http')) {
            const thumbPath = path.join(uploadDir, video.thumbnailPath);
            if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
        }

        // 2. Limpeza de HLS (Storage)
        const storageDir = process.env.STORAGE_PATH || path.join(__dirname, '../storage');
        const hlsFolder = path.join(storageDir, id);
        if (fs.existsSync(hlsFolder)) {
            fs.rmSync(hlsFolder, { recursive: true, force: true });
        }

        // 3. Limpeza de Downloads (Torrents)
        const downloadsDir = path.join(__dirname, '../downloads');
        // Tentar encontrar pasta do download pelo título ou ID
        const possibleDownloadPath = path.join(downloadsDir, video.title);
        if (fs.existsSync(possibleDownloadPath)) {
            fs.rmSync(possibleDownloadPath, { recursive: true, force: true });
        }

        // 4. Parar Downloads Ativos / Seeds / Processos Engine
        try {
            await cancelDownload(id);
            await (prisma as any).seedState.deleteMany({ where: { videoId: id } });
        } catch (e) {
            console.warn('[Deletor] Aviso: Falha ao sinalizar cancelamento para a Engine V2');
        }

        // 5. Remover do Banco
        await prisma.video.delete({ where: { id } });

        res.json({ success: true, message: 'Vídeo e arquivos removidos com sucesso.' });
    } catch (error: any) {
        console.error('❌ Erro ao deletar vídeo:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// HISTÓRICO DE REPRODUÇÃO
// ==========================================

app.get('/api/v1/videos/:id/history', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.query.userId as string;
        if (!userId) return res.json({ lastTime: 0 });

        const history = await prisma.playbackHistory.findUnique({
            where: { videoId_userId: { videoId: id, userId } }
        });
        res.json(history || { lastTime: 0 });
    } catch (e) {
        res.status(500).json({ error: 'Failed' });
    }
});

// ==========================================
// O COFRE (FAVORITOS)
// ==========================================

app.get('/api/v1/users/:userId/favorites', async (req, res) => {
    try {
        const { userId } = req.params;
        const favorites = await prisma.favorite.findMany({
            where: { userId },
            include: { video: true },
            orderBy: { createdAt: 'desc' }
        });
        // Retornamos apenas os vídeos
        res.json(favorites.map(f => f.video));
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch favorites' });
    }
});

app.post('/api/v1/users/:userId/favorites/:videoId', async (req, res) => {
    try {
        const { userId, videoId } = req.params;

        const existing = await prisma.favorite.findUnique({
            where: { videoId_userId: { videoId, userId } }
        });

        if (existing) {
            await prisma.favorite.delete({
                where: { videoId_userId: { videoId, userId } }
            });
            return res.json({ favorited: false });
        } else {
            await prisma.favorite.create({
                data: { videoId, userId }
            });
            return res.json({ favorited: true });
        }
    } catch (e) {
        res.status(500).json({ error: 'Failed to toggle favorite' });
    }
});

app.get('/api/v1/users/:userId/favorites/:videoId/status', async (req, res) => {
    try {
        const { userId, videoId } = req.params;
        const existing = await prisma.favorite.findUnique({
            where: { videoId_userId: { videoId, userId } }
        });
        res.json({ favorited: !!existing });
    } catch (e) {
        res.status(500).json({ error: 'Failed to check status' });
    }
});

app.post('/api/v1/videos/:id/history', async (req, res) => {
    try {
        const { id } = req.params;
        const { userId, lastTime } = req.body;
        if (!userId) return res.status(400).json({ error: 'userId required' });

        await prisma.playbackHistory.upsert({
            where: { videoId_userId: { videoId: id, userId } },
            update: { lastTime },
            create: { videoId: id, userId, lastTime }
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to save history' });
    }
});

app.get('/api/v1/users/:userId/history', async (req, res) => {
    try {
        const { userId } = req.params;
        const history = await prisma.playbackHistory.findMany({
            where: { userId },
            include: { video: true },
            orderBy: { updatedAt: 'desc' },
            take: 20
        });
        res.json(history);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

// Upload com Video e Thumbnail
app.post('/api/v1/videos/upload', upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 }
]), async (req: any, res) => {
    try {
        const files = req.files;
        if (!files.file) return res.status(400).json({ error: 'No video file uploaded' });

        const videoFile = files.file[0];
        const thumbFile = files.thumbnail ? files.thumbnail[0] : null;

        let userId = 'anon-user';
        const authHeader = req.headers.authorization;
        if (authHeader) {
            try {
                const token = authHeader.split(' ')[1];
                const decoded: any = jwt.verify(token, JWT_SECRET);
                userId = decoded.id;
            } catch (e) { }
        }

        const video = await prisma.video.create({
            data: {
                title: req.body.title || 'Sem título',
                description: req.body.description || '',
                category: req.body.category || 'Geral',
                originalFilename: videoFile.originalname,
                status: 'PROCESSING',
                userId: userId,
                storageKey: videoFile.filename,
                thumbnailPath: thumbFile ? thumbFile.filename : null
            },
        });

        processVideo(video.id, videoFile.path);
        res.status(202).json({ message: 'Upload recebido.', video });
    } catch (error) {
        res.status(500).json({ error: 'Erro no upload' });
    }
});

// Ingestão Automática via Nexus Agent
app.post('/api/v1/videos/auto-ingest', async (req, res) => {
    try {
        const { title, description, category, externalSource, thumbnailUrl, tags, status: requestedStatus, tmdbId, imdbId, quality, language, sourceSite, backdropUrl } = req.body;
        const isMagnetLink = externalSource && externalSource.startsWith('magnet:');
        const videoId = isMagnetLink ? extractMagnetInfoHash(externalSource) || undefined : undefined;
        const normalizedCategory = inferCategory(category, tags, title);
        const normalizedQuality = inferQuality(quality, title);
        const normalizedLanguage = inferLanguage(language, tags, title);
        const normalizedTags = Array.from(new Set(
            (Array.isArray(tags) ? tags : String(tags || '').split(','))
                .map((tag) => String(tag).trim())
                .filter(Boolean)
                .concat(sourceSite ? [sourceSite] : [])
                .concat(normalizedLanguage !== 'und' ? [normalizedLanguage] : [])
                .concat(normalizedQuality ? [normalizedQuality] : [])
        ));
        const finalStatus = isMagnetLink
            ? (requestedStatus === 'CATALOG' ? 'CATALOG' : 'NEXUS')
            : (requestedStatus || 'READY');

        const existing = await prisma.video.findFirst({
            where: {
                OR: [
                    videoId ? { id: videoId } : undefined,
                    tmdbId ? { tmdbId: String(tmdbId) } : undefined,
                    {
                        title: title || '',
                        category: normalizedCategory,
                    }
                ].filter(Boolean) as any
            }
        });

        const systemAgent = await prisma.user.upsert({
            where: { email: 'arconte@streamforge.ai' },
            update: {},
            create: {
                id: 'nexus-agent-system',
                email: 'arconte@streamforge.ai',
                name: 'Arconte AI',
                password: 'system-process-hash',
                role: 'ADMIN'
            }
        });

        const payload = {
            title: title || 'Ativo Nexus',
            description: description || 'Extraído automaticamente pelo Arconte.',
            category: normalizedCategory,
            status: finalStatus,
            originalFilename: 'nexus-at-source',
            userId: systemAgent.id,
            hlsPath: isMagnetLink ? externalSource : null,
            storageKey: finalStatus === 'CATALOG' ? externalSource : null,
            thumbnailPath: thumbnailUrl || backdropUrl || null,
            tags: normalizedTags.join(','),
            isPredictive: req.body.predictive || false,
            tmdbId: tmdbId ? String(tmdbId) : null,
            imdbId: imdbId ? String(imdbId) : null,
            quality: normalizedQuality,
            originalTitle: req.body.originalTitle || null,
            hasPortuguese: normalizedLanguage.startsWith('pt-BR'),
            hasPortugueseAudio: normalizedLanguage === 'pt-BR',
            hasPortugueseSubs: normalizedLanguage === 'pt-BR-sub' || normalizedLanguage === 'pt-BR',
            hasDubbed: normalizedLanguage === 'pt-BR',
        };

        const video = existing
            ? await prisma.video.update({
                where: { id: existing.id },
                data: {
                    ...payload,
                    status: existing.status === 'READY' ? existing.status : payload.status,
                    hlsPath: payload.hlsPath || existing.hlsPath,
                    storageKey: payload.storageKey || existing.storageKey,
                    thumbnailPath: payload.thumbnailPath || existing.thumbnailPath,
                    tags: Array.from(new Set(
                        `${existing.tags || ''},${payload.tags || ''}`
                            .split(',')
                            .map((tag) => tag.trim())
                            .filter(Boolean)
                    )).join(','),
                }
            })
            : await prisma.video.create({
                data: {
                    ...payload,
                    id: videoId,
                }
            });

        // Notificar via Socket.io que o Arconte adicionou algo novo
        io.emit('arconte_new_content', {
            title: video.title,
            thumbnail: video.thumbnailPath,
            id: video.id
        });

        console.log(`✅ Auto-ingestão iniciada: ${video.title} (${video.status})`);

        // --- ENRIQUECIMENTO EM BACKGROUND ---
        // Despacha o Arconte para analisar o conteúdo sem travar a resposta
        if (isMagnetLink) {
            // Se for preditivo (Arconte decidiu que é tendência forte), enfileira download
            if (req.body.predictive && finalStatus !== 'CATALOG') {
                console.log(`🧠 [Predictive] Iniciando prefech preventivo: ${video.title}`);
                queueDownload({
                    magnetURI: externalSource,
                    videoId: video.id,
                    userId: systemAgent.id,
                    title: video.title,
                    priority: 50 // Prioridade média para prefetch
                }).catch(err => console.error('❌ Erro no prefetch preditivo:', err));
            }

            if (!normalizedTags.includes('Enriched')) {
                aiService.enrichContent(video.title, description || '').then(async (enriched: any) => {
                    await prisma.video.update({
                        where: { id: video.id },
                        data: {
                            title: enriched.title,
                            description: enriched.description,
                            category: inferCategory(enriched.category, normalizedTags, enriched.title),
                            thumbnailPath: enriched.poster || video.thumbnailPath,
                            tags: [...(video.tags?.split(',') || []), ...enriched.tags, 'Enriched', 'Autobot'].join(',')
                        }
                    });
                    console.log(`✨ Conteúdo enriquecido pela IA: ${enriched.title}`);

                    // Notifica novamente com os dados reais
                    io.emit('arconte_new_content', {
                        title: enriched.title,
                        thumbnail: enriched.poster || video.thumbnailPath,
                        id: video.id
                    });
                }).catch((err: Error) => console.error('❌ Erro no enriquecimento em background:', err));
            }
        }

        res.status(201).json(video);
    } catch (error) {
        console.error('❌ Falha na ingestão automática:', error);
        res.status(500).json({ error: 'Falha na ingestão automática' });
    }
});

app.put('/api/v1/videos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const video = await prisma.video.update({
            where: { id },
            data: req.body,
        });

        res.json(video);
    } catch (error: any) {
        console.error('❌ Falha ao atualizar vídeo:', error);
        res.status(500).json({ error: error.message || 'Falha ao atualizar vídeo' });
    }
});

app.post('/api/v1/videos/:id/play', async (req, res) => {
    try {
        const { id } = req.params;
        const video = await prisma.video.findUnique({ where: { id } });

        if (!video) {
            return res.status(404).json({ error: 'Vídeo não encontrado' });
        }

        if (video.status === 'READY') {
            return res.json({ status: 'READY', video });
        }

        const resolvedSource = await resolveMovieMaterializationSource(video);
        const magnetURI = resolvedSource?.magnetURI || null;

        if (!magnetURI) {
            return res.status(400).json({ error: 'Ativo sem magnet para materialização.' });
        }

        if (!video.storageKey?.startsWith('magnet:') || !video.hlsPath?.startsWith('magnet:')) {
            await prisma.video.update({
                where: { id: video.id },
                data: {
                    storageKey: magnetURI,
                    hlsPath: magnetURI,
                    quality: resolvedSource?.quality || video.quality,
                    hasPortuguese: resolvedSource?.language?.startsWith('pt-BR') || video.hasPortuguese,
                    hasPortugueseAudio: resolvedSource?.language === 'pt-BR' || video.hasPortugueseAudio,
                    hasPortugueseSubs: resolvedSource?.language === 'pt-BR-sub' || resolvedSource?.language === 'pt-BR' || video.hasPortugueseSubs,
                    hasDubbed: resolvedSource?.language === 'pt-BR' || video.hasDubbed,
                    tags: Array.from(new Set(
                        `${video.tags || ''},${resolvedSource?.sourceSite || ''},ResolvedSource`
                            .split(',')
                            .map((tag) => tag.trim())
                            .filter(Boolean)
                    )).join(','),
                }
            });
        }

        await materializeVideo(video.id, magnetURI, 90);

        res.status(202).json({
            status: 'PROCESSING',
            message: 'Materialização iniciada.',
        });
    } catch (error: any) {
        console.error('❌ Falha ao iniciar materialização:', error);
        res.status(500).json({ error: error.message || 'Falha ao iniciar materialização' });
    }
});

/**
 * 📥 Importar Metadados do TMDB para a Biblioteca (Povoar)
 */
app.post('/api/v1/videos/import', async (req, res) => {
    try {
        const { tmdbId, imdbId, title, overview, poster_path, backdrop_path, release_date, media_type, userId, tags } = req.body;

        if (!tmdbId || !title) {
            return res.status(400).json({ error: 'TMDB ID e Título são obrigatórios.' });
        }

        // Verificar se já existe pelo TMDB ID
        const existing = await prisma.video.findFirst({
            where: { tmdbId: String(tmdbId) }
        });

        if (existing) {
            return res.json({ message: 'Vídeo já existe na biblioteca', video: existing, imported: false });
        }

        // Garantir usuário do sistema
        let ownerId = userId;
        if (!ownerId) {
            const systemAgent = await prisma.user.upsert({
                where: { email: 'arconte@streamforge.ai' },
                update: {},
                create: {
                    id: 'nexus-agent-system',
                    email: 'arconte@streamforge.ai',
                    name: 'Arconte AI',
                    password: 'system-process-hash',
                    role: 'ADMIN'
                }
            });
            ownerId = systemAgent.id;
        }

        const video = await prisma.video.create({
            data: {
                title: title,
                description: overview || '',
                category: media_type === 'tv' ? 'series' : 'Filmes',
                originalFilename: `TMDB-${tmdbId}`,
                status: 'REMOTE', // Indica que é um item remoto (sem arquivo local físico ainda)
                tmdbId: String(tmdbId),
                imdbId: imdbId ? String(imdbId) : null,
                thumbnailPath: poster_path, // Pode ser URL completa ou path relativo se baixarmos
                userId: ownerId,
                tags: tags || 'TMDB,Imported',
                isPredictive: false
            }
        });

        console.log(`📚 [Library] Vídeo importado do TMDB: ${title} (${tmdbId})`);
        res.status(201).json({ message: 'Vídeo importado com sucesso', video, imported: true });

    } catch (e: any) {
        console.error('Erro ao importar vídeo:', e);
        res.status(500).json({ error: 'Falha na importação: ' + e.message });
    }
});

import { arconteAdmin } from './nexus-bridge';

app.post('/api/v1/ai/deep-search', async (req, res) => {
    const { query, prioritizePTBR = true, ptbrOnly = false } = req.body;
    if (!query) return res.status(400).json({ error: 'Termo de busca vazio.' });

    console.log(`[ORION] Arconte despachado: "${query}" (PriorizePTBR: ${prioritizePTBR})`);
    arconteAdmin.processDemand(query); // Adicionar suporte em uma versão futura para passar filtros ao Arconte

    res.json({ message: 'Arconte foi despachado para a rede profunda.' });
});

// ==========================================
// ROTAS DE INTERATIVIDADE
// ==========================================

app.post('/api/v1/videos/:id/comments', async (req, res) => {
    try {
        const { id } = req.params;
        const { content, userId } = req.body;
        const comment = await prisma.comment.create({ data: { content, videoId: id, userId } });
        res.json(comment);
    } catch (e) {
        res.status(500).json({ error: 'Failed' });
    }
});

app.post('/api/v1/videos/:id/like', async (req, res) => {
    try {
        const { id } = req.params;
        const { userId, isLike } = req.body;
        const like = await prisma.like.upsert({
            where: { videoId_userId: { videoId: id, userId } },
            update: { isLike },
            create: { videoId: id, userId, isLike }
        });
        res.json(like);
    } catch (e) {
        res.status(500).json({ error: 'Failed' });
    }
});

app.get('/api/v1/videos/:id/stats', async (req, res) => {
    try {
        const { id } = req.params;
        const [likesCount, dislikesCount, comments] = await Promise.all([
            prisma.like.count({ where: { videoId: id, isLike: true } }),
            prisma.like.count({ where: { videoId: id, isLike: false } }),
            prisma.comment.findMany({ where: { videoId: id }, include: { user: true }, orderBy: { createdAt: 'desc' } })
        ]);
        res.json({ likesCount, dislikesCount, comments });
    } catch (e) {
        res.status(500).json({ error: 'Failed' });
    }
});

app.delete('/api/v1/videos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const video = await prisma.video.findUnique({ where: { id } });
        if (!video) return res.status(404).json({ error: 'Video not found' });
        const baseDir = path.join(__dirname, '../uploads');
        if (video.storageKey) {
            const videoPath = path.join(baseDir, video.storageKey);
            if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
        }
        if (video.thumbnailPath) {
            const thumbPath = path.join(baseDir, video.thumbnailPath);
            if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
        }
        const hlsDir = path.join(baseDir, 'hls', id);
        if (fs.existsSync(hlsDir)) fs.rmSync(hlsDir, { recursive: true, force: true });
        await prisma.video.delete({ where: { id } });
        res.json({ message: 'Success' });
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

// 🎬 Rota de Streaming de Vídeo com Range Requests
app.get('/api/v1/videos/:id/stream', async (req, res) => {
    try {
        const { id } = req.params;
        const video = await prisma.video.findUnique({ where: { id } });

        if (!video || !video.storageKey) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const storageKey = video.storageKey;
        const candidatePaths = [
            storageKey && path.isAbsolute(storageKey) ? storageKey : '',
            storageKey ? path.join(__dirname, '../uploads', storageKey) : '',
            storageKey ? path.join(__dirname, '..', storageKey) : '',
        ].filter(Boolean);

        const videoPath = candidatePaths.find((candidate) => fs.existsSync(candidate));

        if (!videoPath || !fs.existsSync(videoPath)) {
            return res.status(404).json({ error: 'Video file not found' });
        }

        const stat = fs.statSync(videoPath);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            const file = fs.createReadStream(videoPath, { start, end });
            const head = {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': 'video/mp4',
            };
            res.writeHead(206, head);
            file.pipe(res);
        } else {
            const head = {
                'Content-Length': fileSize,
                'Content-Type': 'video/mp4',
            };
            res.writeHead(200, head);
            fs.createReadStream(videoPath).pipe(res);
        }
    } catch (error) {
        console.error('Stream error:', error);
        res.status(500).json({ error: 'Stream failed' });
    }
});

// Worker Interno
async function processVideo(videoId: string, inputPath: string) {
    const outputDir = path.join(__dirname, `../uploads/hls/${videoId}`);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, 'index.m3u8');

    ffmpeg(inputPath)
        .outputOptions(['-hls_time', '10', '-hls_list_size', '0'])
        .output(outputPath)
        .on('end', async () => {
            await prisma.video.update({
                where: { id: videoId },
                data: { status: 'READY', hlsPath: `hls/${videoId}/index.m3u8` }
            });
        })
        .on('error', async () => {
            await prisma.video.update({ where: { id: videoId }, data: { status: 'FAILED' } });
        })
        .run();
}

// ==========================================
// SISTEMA DE RECOMENDAÇÕES (TAG-BASED)
// ==========================================
app.get('/api/v1/recommendations', async (req, res) => {
    try {
        const userId = req.query.userId as string;
        const audienceProfile = String(req.query.profile || 'house');
        const discovery = await buildDiscoveryFeed(userId, audienceProfile);
        const recommendationRow = discovery.rows.find((row: any) => row.id === 'family-portuguese') || discovery.rows[0];
        res.json(recommendationRow?.items || []);
    } catch (error) {
        res.status(500).json({ error: 'Falha ao buscar recomendações' });
    }
});

app.get('/api/v1/discovery/feed', async (req, res) => {
    try {
        const userId = req.query.userId as string | undefined;
        const audienceProfile = String(req.query.profile || 'house');
        const feed = await buildDiscoveryFeed(userId, audienceProfile);
        res.json(feed);
    } catch (error: any) {
        console.error('❌ [Discovery] Falha ao montar feed:', error);
        res.status(500).json({ error: error?.message || 'Falha ao montar discovery feed' });
    }
});

// ==========================================
// DASHBOARD ANALYTICS (ADMIN)
// ==========================================
app.get('/api/v1/admin/analytics', async (req, res) => {
    try {
        const [totalVideos, totalUsers, totalViews, categoryStats] = await Promise.all([
            prisma.video.count(),
            prisma.user.count(),
            prisma.video.aggregate({ _sum: { views: true } }),
            prisma.video.groupBy({
                by: ['category'],
                _count: { _all: true }
            })
        ]);

        res.json({
            stats: {
                videos: totalVideos,
                users: totalUsers,
                views: totalViews._sum.views || 0,
                activeNodes: Math.floor(Math.random() * 50) + 10 // Simulação de nodes P2P
            },
            categories: categoryStats,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: 'Falha ao buscar analytics' });
    }
});

// ==========================================
// SYSTEM TELEMETRY (INDUSTRIAL GRADE)
// ==========================================
app.get('/api/v1/system/telemetry', (req, res) => {
    res.json(SystemTelemetry.getSnapshot());
});




server.listen(PORT, () => {
    console.log(`🚀 STREAMFORGE BACKEND ONLINE NA PORTA ${PORT}`);
    console.log(`📺 IPTV Module: /api/iptv/*`);
    console.log(`🧠 Intelligence Engine: /api/intelligence/*`);
    console.log(`📥 Downloader V2: /api/v1/downloads/*`);
    console.log(`📊 Telemetry Engine: /api/v1/system/telemetry`);

    // Inicia o worker de inteligência
    startWorker().catch(console.error);

    // Inicia o processador de fila de downloads
    startQueueProcessor();
});

// 🛡️ GRACEFUL SHUTDOWN Handler
const gracefulShutdown = async () => {
    console.log('🛑 [Shutdown] Sinal recebido. Parando serviços...');

    // Parar Downloader (Stateful)
    await shutdownDownloader();

    // Fechar servidor HTTP
    server.close(() => {
        console.log('✅ [Shutdown] Servidor HTTP fechado.');

        // Fechar conexão com banco
        prisma.$disconnect().then(() => {
            console.log('✅ [Shutdown] Conexão com DB fechada.');
            process.exit(0);
        });
    });

    // Force exit after 10s if hung
    setTimeout(() => {
        console.error('⚠️ [Shutdown] Forçando saída após timeout...');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
