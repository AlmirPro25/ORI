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
import crypto from 'crypto';
import { z } from 'zod';

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
import { eventBus, SystemEvents } from './event-bus';
import { structuredLogger } from './utils/structured-logger';
import { createRateLimit } from './utils/rate-limit';

const socketWatchStartSchema = z.object({
    userId: z.string().min(1),
    episodeId: z.string().min(1),
    videoId: z.string().min(1).optional(),
    source: z.string().min(1).optional(),
    isFederated: z.boolean().optional(),
});

const socketHeartbeatSchema = z.object({
    userId: z.string().min(1).optional(),
    episodeId: z.string().min(1).optional(),
    videoId: z.string().min(1).optional(),
    source: z.string().min(1).optional(),
    currentTime: z.number().finite().optional(),
    buffering: z.boolean().optional(),
    playbackState: z.enum(['starting', 'playing', 'buffering', 'paused', 'stopped']).optional(),
    bufferEvents: z.number().int().nonnegative().optional(),
});

const autoIngestSchema = z.object({
    title: z.string().min(1).max(300),
    description: z.string().max(4000).optional(),
    category: z.string().max(120).optional(),
    externalSource: z.string().max(4000).optional(),
    thumbnailUrl: z.string().url().max(4000).optional(),
    backdropUrl: z.string().url().max(4000).optional(),
    tags: z.union([z.array(z.string().max(80)), z.string().max(1500)]).optional(),
    status: z.string().max(40).optional(),
    tmdbId: z.union([z.string(), z.number()]).optional(),
    imdbId: z.union([z.string(), z.number()]).optional(),
    quality: z.string().max(40).optional(),
    language: z.string().max(40).optional(),
    sourceSite: z.string().max(120).optional(),
    predictive: z.boolean().optional(),
    originalTitle: z.string().max(300).optional(),
});

const playVideoSchema = z.object({
    magnetURI: z.string().startsWith('magnet:').optional(),
    infoHash: z.string().regex(/^[a-fA-F0-9]{32,40}$/).optional(),
    sourceSite: z.string().max(120).optional(),
    quality: z.string().max(40).optional(),
    language: z.string().max(40).optional(),
});

const importVideoSchema = z.object({
    tmdbId: z.union([z.string(), z.number()]),
    imdbId: z.union([z.string(), z.number()]).optional(),
    title: z.string().min(1).max(300),
    overview: z.string().max(4000).optional(),
    poster_path: z.string().max(4000).optional(),
    backdrop_path: z.string().max(4000).optional(),
    release_date: z.string().max(40).optional(),
    media_type: z.string().max(20).optional(),
    userId: z.string().max(120).optional(),
    tags: z.string().max(1500).optional(),
});

const commentSchema = z.object({
    content: z.string().min(1).max(2000),
    userId: z.string().min(1).max(120),
});

const likeSchema = z.object({
    userId: z.string().min(1).max(120),
    isLike: z.boolean(),
});

function validatePayload<T>(schema: z.ZodSchema<T>, payload: unknown) {
    const result = schema.safeParse(payload);
    if (!result.success) {
        return {
            ok: false as const,
            error: result.error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; '),
        };
    }

    return {
        ok: true as const,
        data: result.data,
    };
}


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

export const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

import { DownloadGovernor } from './services/download-governor';
import { ConsumptionAnalytics } from './services/consumption-analytics';
import { NexusFederation } from './services/nexus-federation';
import { PlaybackTelemetry } from './services/playback-telemetry';
import { SourceIntelligence } from './services/source-intelligence';
import { SearchRankingTelemetry } from './services/search-ranking-telemetry';
import { PtBrQueryPlanner } from './services/ptbr-query-planner';

// 📡 SOCKET.IO: UNIFIED CONNECTION HANDLER
// Registra TODOS os eventos de socket num único handler (evita listeners duplicados)
io.on('connection', (socket) => {
    let activeUserId: string | null = null;
    console.log('⚡ Socket conectado:', socket.id);

    // ── Watch Tracking (Governor) ──
    socket.on('watch:start', async (data: { userId: string, episodeId: string, videoId?: string, source?: string, isFederated?: boolean }) => {
        activeUserId = data.userId;
        DownloadGovernor.registerViewer(data.userId, data.episodeId);
        PlaybackTelemetry.trackSessionStart({
            socketId: socket.id,
            userId: data.userId,
            videoId: data.videoId || data.episodeId,
            episodeId: data.episodeId,
            source: data.source || (data.isFederated ? 'REMOTE' : 'LOCAL'),
        });

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

    socket.on('watch:heartbeat', (data: {
        userId?: string;
        episodeId?: string;
        videoId?: string;
        source?: string;
        currentTime?: number;
        buffering?: boolean;
        playbackState?: 'starting' | 'playing' | 'buffering' | 'paused' | 'stopped';
        bufferEvents?: number;
    }) => {
        PlaybackTelemetry.trackHeartbeat({
            socketId: socket.id,
            userId: data.userId,
            videoId: data.videoId || data.episodeId,
            episodeId: data.episodeId,
            source: data.source,
            currentTime: data.currentTime,
            buffering: data.buffering,
            playbackState: data.playbackState,
            bufferEvents: data.bufferEvents,
        });
    });

    socket.on('watch:stop', () => {
        if (activeUserId) {
            DownloadGovernor.unregisterViewer(activeUserId);
            activeUserId = null;
        }
        PlaybackTelemetry.trackSessionStop(socket.id);
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
        PlaybackTelemetry.trackSessionStop(socket.id);
        console.log('🔥 Socket desconectado:', socket.id);
    });
});

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

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

function getPlaybackLanguageMode(input: {
    hasPortugueseAudio?: boolean | null;
    hasPortugueseSubs?: boolean | null;
    hasDubbed?: boolean | null;
    language?: string | null;
}) {
    const language = String(input.language || '').toLowerCase();
    if (input.hasDubbed || input.hasPortugueseAudio || language === 'pt-br') {
        return 'audio-pt-br';
    }
    if (input.hasPortugueseSubs || language === 'pt-br-sub') {
        return 'subtitle-pt-br';
    }
    return 'original';
}

function getPlaybackLanguageLadder(prefersPortuguese: boolean) {
    return prefersPortuguese
        ? ([
            { language: 'pt-BR', mode: 'audio-pt-br' },
            { language: 'pt-BR-sub', mode: 'subtitle-pt-br' },
            { language: 'und', mode: 'original' },
        ] as const)
        : ([
            { language: 'und', mode: 'original' },
            { language: 'pt-BR-sub', mode: 'subtitle-pt-br' },
            { language: 'pt-BR', mode: 'audio-pt-br' },
        ] as const);
}

async function resolveMovieMaterializationSource(video: any) {
    const normalize = (value?: string | null) => String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    const titleHint = `${video.title || ''} ${video.originalTitle || ''} ${video.description || ''} ${video.tags || ''}`.trim();
    const prefersPortuguese = /(dublado|dual audio|legendado|pt-br|portugues|familia|filme|acao|drama|comedia|terror|aventura)/i.test(titleHint);
    const ptBrPlan = PtBrQueryPlanner.build({
        title: video.title,
        originalTitle: video.originalTitle,
        preferPortugueseAudio: prefersPortuguese,
    });
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
    }, adaptivePolicy?: { minSeeds: number; minTitleSimilarity: number; keepRate?: number }) => {
        const sourceName = normalize(candidate.sourceSite);
        const title = String(candidate.title || '');
        const quality = String(candidate.quality || '').toLowerCase();
        const language = String(candidate.language || '').toLowerCase();
        const portugueseTitle = /(dublado|dual audio|pt-br|portuguese|portugues|latino|multi audio)/i.test(title);
        const subtitledTitle = /(legendado|sub)/i.test(title);
        const addonBoost = sourceName.includes('brazuca') ? 40
            : sourceName.includes('indexabr') ? 30
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
        const adaptiveBoost = adaptivePolicy
            ? Math.max(0, 10 - (adaptivePolicy.minSeeds - 2) * 4) + Math.max(0, Number(adaptivePolicy.keepRate || 0) * 0.1)
            : 0;

        return addonBoost + qualityBoost + portugueseBoost + Math.min(40, Number(candidate.seeds || 0)) + adaptiveBoost;
    };
    const existingMagnet = video.hlsPath?.startsWith('magnet:')
        ? video.hlsPath
        : video.storageKey?.startsWith('magnet:')
            ? video.storageKey
            : null;

    if (existingMagnet) {
        const language = video.hasDubbed ? 'pt-BR' : video.hasPortuguese ? 'pt-BR-sub' : 'und';
        return {
            magnetURI: existingMagnet,
            sourceSite: 'catalog',
            quality: video.quality || null,
            language,
            playbackLanguageMode: getPlaybackLanguageMode({ language }),
            fallbackApplied: getPlaybackLanguageMode({ language }) !== 'audio-pt-br',
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
                titleAliases: ptBrPlan.aliases,
                searchVariants: ptBrPlan.searchVariants,
                preferPortugueseAudio: prefersPortuguese,
                acceptPortugueseSubtitles: true,
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
            }, { timeout: 20000 }) as any;

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
    const dedupedCandidates = candidates
        .filter((candidate) => {
            const key = extractMagnetInfoHash(candidate.magnetURI) || candidate.magnetURI;
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });

    const policyEntries = await Promise.all(
        Array.from(new Set(dedupedCandidates.map((candidate) => String(candidate.sourceSite || 'Unknown'))))
            .map(async (sourceSite) => [sourceSite, await SearchRankingTelemetry.getAdaptivePolicyForSource(sourceSite)] as const)
    );
    const policyMap = new Map(policyEntries);
    const cooldownEntries = await Promise.all(
        Array.from(new Set(dedupedCandidates.map((candidate) => String(candidate.sourceSite || 'Unknown'))))
            .map(async (sourceSite) => [sourceSite, await SearchRankingTelemetry.isSourceCoolingDown(sourceSite)] as const)
    );
    const cooldownMap = new Map(cooldownEntries);

    const rankedByHeuristic = dedupedCandidates
        .filter((candidate) => {
            const policy = policyMap.get(String(candidate.sourceSite || 'Unknown'));
            const cooldown = cooldownMap.get(String(candidate.sourceSite || 'Unknown'));
            const language = String(candidate.language || '').toLowerCase();
            const title = String(candidate.title || '');
            const hasPortugueseSignal = language === 'pt-br' || language === 'pt-br-sub' || /dublado|dual audio|pt-br|legendado/i.test(title);
            if (cooldown?.coolingDown && !hasPortugueseSignal) {
                return false;
            }
            return Number(candidate.seeds || 0) >= Number(policy?.minSeeds || 3) || hasPortugueseSignal;
        })
        .slice()
        .sort((a, b) => {
            const aPolicy = policyMap.get(String(a.sourceSite || 'Unknown'));
            const bPolicy = policyMap.get(String(b.sourceSite || 'Unknown'));
            return scoreCandidate(b, bPolicy) - scoreCandidate(a, aPolicy);
        });

    const ladder = getPlaybackLanguageLadder(prefersPortuguese);
    for (const step of ladder) {
        const bestForStep = await SourceIntelligence.chooseBestCandidate({
            title: video.title,
            originalTitle: video.originalTitle,
            tmdbId: video.tmdbId,
            imdbId: video.imdbId,
            preferredQuality: video.quality || '1080p',
            preferredLanguage: step.language,
        }, rankedByHeuristic);

        if (bestForStep) {
            return {
                ...bestForStep,
                playbackLanguageMode: step.mode,
                fallbackApplied: step.mode !== 'audio-pt-br',
            };
        }
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

function parseArconteHeuristic(raw?: string | null) {
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function parseVideoSelectionTelemetry(raw?: string | null) {
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function buildPtBrCoverageFromPatterns(item: any, adaptivePatterns: any[] = []) {
    const normalized = normalizeText([
        item?.title,
        item?.subtitle,
        item?.category,
        item?.quality,
        ...(Array.isArray(item?.tags) ? item.tags : splitTags(item?.tags)),
    ].join(' '));

    const matchedPatterns = adaptivePatterns.filter((pattern: any) => {
        if (Number(pattern?.samples || 0) < 3) return false;
        const key = String(pattern?.pattern || '');
        return (
            (key === 'episode-code:sxxexx' && /s\d{2}e\d{2}/i.test(normalized)) ||
            (key === 'episode-code:1x01' && /\d{1,2}x\d{2}/i.test(normalized)) ||
            (key === 'shape:season-pack' && /complete season|season pack|temporada completa|collection/i.test(normalized)) ||
            (key === 'quality:2160p' && /2160|4k/i.test(normalized)) ||
            (key === 'quality:1080p' && /1080/i.test(normalized)) ||
            (key === 'quality:720p' && /720/i.test(normalized)) ||
            (key === 'language:ptbr-signal' && /dual|dublado|pt-br|portugues|legendado/i.test(normalized)) ||
            (key === 'container:mkv' && /\bmkv\b/i.test(normalized)) ||
            (key === 'container:mp4' && /\bmp4\b/i.test(normalized))
        );
    });

    if (!matchedPatterns.length) {
        const fallbackReasons = item?.isDubbed
            ? ['Sinal editorial de audio PT-BR']
            : item?.isPortuguese
                ? ['Sinal editorial de legenda/PT-BR']
                : [];
        return {
            ptbrConfidence: item?.isDubbed ? 0.82 : item?.isPortuguese ? 0.58 : 0,
            ptbrCoverageLabel: item?.isDubbed ? 'strong' : item?.isPortuguese ? 'subtitle' : 'unknown',
            ptbrConfidenceSource: item?.isDubbed || item?.isPortuguese ? 'editorial' : 'none',
            coverageSamples: 0,
            ptbrScoreReasons: fallbackReasons,
        };
    }

    const confidenceRaw = matchedPatterns.reduce((sum: number, pattern: any) => {
        return sum
            + Number(pattern?.scoreBias || 0)
            + (Number(pattern?.audioPtBrRate || 0) * 0.08)
            + (Number(pattern?.subtitlePtBrRate || 0) * 0.04);
    }, 0);
    const ptbrConfidence = Math.max(0, Math.min(1, confidenceRaw / 20));
    const ptbrCoverageLabel = ptbrConfidence >= 0.66
        ? 'strong'
        : ptbrConfidence >= 0.38
            ? 'subtitle'
            : ptbrConfidence > 0
                ? 'weak'
                : 'unknown';
    const coverageSamples = matchedPatterns.reduce((sum: number, pattern: any) => {
        return sum + Number(pattern?.samples || 0);
    }, 0);
    const ptbrScoreReasons = matchedPatterns
        .slice()
        .sort((a: any, b: any) => (
            (Number(b?.scoreBias || 0) + Number(b?.audioPtBrRate || 0) * 0.08 + Number(b?.subtitlePtBrRate || 0) * 0.04)
            - (Number(a?.scoreBias || 0) + Number(a?.audioPtBrRate || 0) * 0.08 + Number(a?.subtitlePtBrRate || 0) * 0.04)
        ))
        .slice(0, 3)
        .map((pattern: any) => {
            const key = String(pattern?.pattern || '');
            if (key === 'language:ptbr-signal') return `Nome com sinal PT-BR (${Number(pattern?.samples || 0)} amostras)`;
            if (key === 'shape:season-pack') return `Historico forte de season pack (${Number(pattern?.samples || 0)} amostras)`;
            if (key === 'episode-code:sxxexx' || key === 'episode-code:1x01') return `Padrao de episodio validado (${Number(pattern?.samples || 0)} amostras)`;
            if (key.startsWith('quality:')) return `Qualidade ${key.replace('quality:', '')} ajudou no score PT-BR`;
            if (key.startsWith('container:')) return `Container ${key.replace('container:', '').toUpperCase()} ajudou no score PT-BR`;
            return `Padrao ${key} ajudou no score PT-BR`;
        });

    return {
        ptbrConfidence: Number(ptbrConfidence.toFixed(3)),
        ptbrCoverageLabel,
        ptbrConfidenceSource: 'telemetry',
        coverageSamples,
        ptbrScoreReasons,
    };
}

async function enrichDiscoveryItemsWithArconteSignals(items: any[]) {
    const titleKeys = Array.from(new Set(
        items
            .map((item) => `arconte:heuristic:title:${item.kind === 'series' ? 'series' : 'movie'}:${normalizeText(item.title)}`)
            .filter(Boolean)
    ));

    if (!titleKeys.length) return items;

    const rows = await prisma.systemStats.findMany({
        where: { key: { in: titleKeys } },
    }).catch(() => []);

    const signalMap = new Map<string, any>();
    for (const row of rows) {
        signalMap.set(row.key, parseArconteHeuristic(row.valueString));
    }

    return items.map((item) => {
        const key = `arconte:heuristic:title:${item.kind === 'series' ? 'series' : 'movie'}:${normalizeText(item.title)}`;
        const signal = signalMap.get(key);
        if (!signal) return item;

        const wins = Number(signal?.wins || 0);
        const ptBrWins = Number(signal?.ptBrWins || 0);
        const avgAvailability = wins > 0 ? Number(signal?.totalAvailability || 0) / wins : 0;
        const trustLevel = ptBrWins >= 2 || avgAvailability >= 65
            ? 'high'
            : wins >= 2 || avgAvailability >= 30
                ? 'medium'
                : 'low';
        const trustLabel = trustLevel === 'high'
            ? 'Arconte confia'
            : trustLevel === 'medium'
                ? 'Bom historico'
                : 'Aprendendo';

        return {
            ...item,
            arconteTrust: trustLevel,
            arconteTrustLabel: trustLabel,
        };
    });
}

async function enrichDiscoveryItemsWithPtBrSignals(items: any[]) {
    if (!items.length) return items;

    const row = await (prisma as any).systemStats.findUnique({
        where: { key: 'video-selection:telemetry:v1' },
    }).catch(() => null);
    const parsed = parseVideoSelectionTelemetry(row?.valueString);
    const adaptivePatterns = Array.isArray(parsed?.samples)
        ? (() => {
            const patternMap = new Map<string, any[]>();
            for (const sample of parsed.samples) {
                const filename = String(sample?.selectedFile || '').toLowerCase();
                const keys = new Set<string>();
                if (/s\d{2}e\d{2}/i.test(filename)) keys.add('episode-code:sxxexx');
                if (/\d{1,2}x\d{2}/i.test(filename)) keys.add('episode-code:1x01');
                if (/complete season|season pack|temporada completa|collection/i.test(filename)) keys.add('shape:season-pack');
                if (/2160|4k/i.test(filename)) keys.add('quality:2160p');
                if (/1080/i.test(filename)) keys.add('quality:1080p');
                if (/720/i.test(filename)) keys.add('quality:720p');
                if (/dual|dublado|pt-br/i.test(filename)) keys.add('language:ptbr-signal');
                if (/\.mkv$/i.test(filename)) keys.add('container:mkv');
                if (/\.mp4$/i.test(filename)) keys.add('container:mp4');
                for (const key of keys) {
                    const current = patternMap.get(key) || [];
                    current.push(sample);
                    patternMap.set(key, current);
                }
            }

            return Array.from(patternMap.entries()).map(([pattern, samples]) => {
                const completionRate = samples.filter((sample: any) => sample?.outcome === 'completed').length / Math.max(1, samples.length);
                const audioPtBrRate = samples.filter((sample: any) => sample?.verifiedPortugueseAudio).length / Math.max(1, samples.length);
                const subtitlePtBrRate = samples.filter((sample: any) => sample?.verifiedPortugueseSubtitle).length / Math.max(1, samples.length);
                const failedRate = samples.filter((sample: any) => sample?.outcome === 'failed').length / Math.max(1, samples.length);
                const fallbackRate = samples.filter((sample: any) => sample?.outcome === 'fallback').length / Math.max(1, samples.length);
                const scoreBias = (completionRate * 18) + (audioPtBrRate * 10) + (subtitlePtBrRate * 6) - (failedRate * 18) - (fallbackRate * 12);
                return {
                    pattern,
                    samples: samples.length,
                    scoreBias: Number(scoreBias.toFixed(2)),
                    audioPtBrRate: Number((audioPtBrRate * 100).toFixed(1)),
                    subtitlePtBrRate: Number((subtitlePtBrRate * 100).toFixed(1)),
                };
            });
        })()
        : [];

    return items.map((item) => ({
        ...item,
        ...buildPtBrCoverageFromPatterns(item, adaptivePatterns),
    }));
}

function detectCatalogReadinessAffinity(input: {
    title?: string | null;
    tags?: string[] | string | null;
    status?: string | null;
    quality?: string | null;
    sourceSite?: string | null;
    hasDubbed?: boolean;
    hasPortuguese?: boolean;
    hasPortugueseAudio?: boolean;
    hasPortugueseSubs?: boolean;
}) {
    const tagList = splitTags(input.tags).map(normalizeText);
    const sourceSite = normalizeText(input.sourceSite);
    const title = normalizeText(input.title);
    const quality = normalizeText(input.quality);
    const portuguese = detectPortugueseAffinity(input);
    const fromAddonRadar = tagList.includes('addon radar') || tagList.includes('resolvedsource');
    const fromTrustedSource = /brazuca|indexabr|thepiratebay|top streaming|nexus/.test(sourceSite)
        || tagList.some((tag) => /brazuca|indexabr|thepiratebay|top streaming|nexus/.test(tag));
    const strongQuality = /2160|4k/.test(quality) ? 20 : /1080/.test(quality) ? 14 : /720/.test(quality) ? 8 : 0;
    const catalogReady = input.status === 'READY' || (input.status === 'CATALOG' && (portuguese.portuguese || fromAddonRadar || fromTrustedSource));
    const clickReadyScore =
        (fromAddonRadar ? 18 : 0)
        + (fromTrustedSource ? 12 : 0)
        + (catalogReady ? 16 : 0)
        + (portuguese.dubbed ? 18 : portuguese.subtitled ? 8 : 0)
        + strongQuality
        + (/dublado|pt br|pt-br|dual audio|legendado/.test(title) ? 10 : 0);

    return {
        fromAddonRadar,
        fromTrustedSource,
        catalogReady,
        clickReadyScore,
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

const TITLE_FAMILY_STOPWORDS = new Set([
    'the', 'and', 'with', 'from', 'para', 'com', 'uma', 'um', 'dos', 'das', 'de', 'do', 'da', 'del', 'los', 'las',
    'movie', 'movies', 'film', 'filme', 'filmes', 'serie', 'series', 'season', 'temporada', 'episode', 'episodio',
    'part', 'parte', 'volume', 'vol', 'edition', 'edicao', 'original', 'complete', 'completo', 'completeza',
]);

function getTitleFamilyTokens(title?: string) {
    return normalizeText(title)
        .replace(/\b(19|20)\d{2}\b/g, ' ')
        .split(/[^a-z0-9]+/g)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3 && !TITLE_FAMILY_STOPWORDS.has(token) && !/^\d+$/.test(token));
}

function addWeightedValues(target: Record<string, number>, values: Array<string | null | undefined>, weight: number) {
    for (const value of values) {
        const key = normalizeText(value);
        if (!key) continue;
        target[key] = (target[key] || 0) + weight;
    }
}

function parseStoredTasteProfile(raw?: string | null) {
    if (!raw) {
        return {
            categories: {} as Record<string, number>,
            tags: {} as Record<string, number>,
            titleFamilies: {} as Record<string, number>,
        };
    }

    try {
        const parsed = JSON.parse(raw);
        if (
            parsed &&
            typeof parsed === 'object' &&
            ('categories' in parsed || 'tags' in parsed || 'titleFamilies' in parsed)
        ) {
            return {
                categories: parsed.categories || {},
                tags: parsed.tags || {},
                titleFamilies: parsed.titleFamilies || {},
            };
        }

        return {
            categories: parsed || {},
            tags: {},
            titleFamilies: {},
        };
    } catch {
        return {
            categories: {} as Record<string, number>,
            tags: {} as Record<string, number>,
            titleFamilies: {} as Record<string, number>,
        };
    }
}

function mergeStoredWeights(target: Record<string, number>, source: Record<string, number>, multiplier = 1) {
    Object.entries(source || {}).forEach(([key, value]) => {
        const normalizedKey = normalizeText(key);
        const numericValue = Number(value || 0);
        if (!normalizedKey || numericValue <= 0) return;
        target[normalizedKey] = (target[normalizedKey] || 0) + (numericValue * multiplier);
    });
}

async function refreshUserTasteProfile(userId: string) {
    const [history, favorites, watchSessions, videos] = await Promise.all([
        prisma.playbackHistory.findMany({
            where: { userId },
            include: { video: true },
            orderBy: { updatedAt: 'desc' },
            take: 40,
        }).catch(() => []),
        prisma.favorite.findMany({
            where: { userId },
            include: { video: true },
            orderBy: { createdAt: 'desc' },
            take: 40,
        }).catch(() => []),
        (prisma as any).watchSession.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 120,
        }).catch(() => []),
        prisma.video.findMany({
            select: {
                id: true,
                title: true,
                tags: true,
                category: true,
                quality: true,
                hasPortugueseAudio: true,
                hasPortugueseSubs: true,
                hasDubbed: true,
            },
            take: 400,
        }).catch(() => []),
    ]);

    const videosById = new Map(videos.map((video: any) => [video.id, video]));
    const categories: Record<string, number> = {};
    const tags: Record<string, number> = {};
    const titleFamilies: Record<string, number> = {};
    const languageSignals: Record<string, number> = {};

    history.forEach((entry: any) => {
        addWeightedValues(categories, [entry.video?.category], 1.5);
        addWeightedValues(tags, splitTags(entry.video?.tags), 1.25);
        addWeightedValues(titleFamilies, getTitleFamilyTokens(entry.video?.title), 1.5);
        addWeightedValues(languageSignals, [
            entry.video?.hasPortugueseAudio ? 'audio-pt-br' : null,
            entry.video?.hasPortugueseSubs ? 'subtitle-pt-br' : null,
            entry.video?.hasDubbed ? 'dubbed' : null,
        ], 1.5);
    });

    favorites.forEach((entry: any) => {
        addWeightedValues(categories, [entry.video?.category], 3);
        addWeightedValues(tags, splitTags(entry.video?.tags), 2.5);
        addWeightedValues(titleFamilies, getTitleFamilyTokens(entry.video?.title), 3.5);
        addWeightedValues(languageSignals, [
            entry.video?.hasPortugueseAudio ? 'audio-pt-br' : null,
            entry.video?.hasPortugueseSubs ? 'subtitle-pt-br' : null,
            entry.video?.hasDubbed ? 'dubbed' : null,
        ], 2.5);
    });

    watchSessions.forEach((entry: any) => {
        const watchedVideo = videosById.get(entry.videoId);
        if (!watchedVideo) return;

        const sessionWeight = entry.completed
            ? 3
            : entry.abandoned
                ? 0.4
                : Number(entry.duration || 0) >= 1800
                    ? 2.1
                    : 1.2;

        addWeightedValues(categories, [watchedVideo.category], sessionWeight);
        addWeightedValues(tags, splitTags(watchedVideo.tags), Math.max(0.5, sessionWeight - 0.25));
        addWeightedValues(titleFamilies, getTitleFamilyTokens(watchedVideo.title), sessionWeight + 0.5);
        addWeightedValues(languageSignals, [
            watchedVideo.hasPortugueseAudio ? 'audio-pt-br' : null,
            watchedVideo.hasPortugueseSubs ? 'subtitle-pt-br' : null,
            watchedVideo.hasDubbed ? 'dubbed' : null,
        ], Math.max(0.5, sessionWeight));
    });

    const totalSessions = watchSessions.length || 1;
    const completedSessions = watchSessions.filter((entry: any) => !!entry.completed).length;
    const avgSessionTime = watchSessions.length
        ? watchSessions.reduce((sum: number, entry: any) => sum + Number(entry.duration || 0), 0) / watchSessions.length
        : 0;

    const topCategory = Object.entries(categories).sort((a, b) => b[1] - a[1])[0]?.[0];
    const topQuality = videos
        .map((video: any) => inferQuality(video.quality, video.title))
        .filter(Boolean)
        .reduce((acc: Record<string, number>, quality: string) => {
            acc[quality] = (acc[quality] || 0) + 1;
            return acc;
        }, {});
    const preferredQuality = Object.entries(topQuality).sort((a, b) => b[1] - a[1])[0]?.[0] || '1080p';
    const avgBandwidth = watchSessions.length
        ? watchSessions.reduce((sum: number, entry: any) => sum + Number(entry.avgBitrate || 0), 0) / watchSessions.length
        : 0;

    await (prisma as any).userProfile.upsert({
        where: { userId },
        create: {
            userId,
            preferredGenres: JSON.stringify({
                categories,
                tags,
                titleFamilies,
                languageSignals,
                topCategory,
                preferredQuality,
                updatedAt: new Date().toISOString(),
            }),
            avgSessionTime,
            completionRate: completedSessions / totalSessions,
            preferredQuality,
            avgBandwidth,
            lastActive: new Date(),
        },
        update: {
            preferredGenres: JSON.stringify({
                categories,
                tags,
                titleFamilies,
                languageSignals,
                topCategory,
                preferredQuality,
                updatedAt: new Date().toISOString(),
            }),
            avgSessionTime,
            completionRate: completedSessions / totalSessions,
            preferredQuality,
            avgBandwidth,
            lastActive: new Date(),
        },
    }).catch(() => null);
}

function getVideoDiscoveryScore(video: any, context: {
    preferredCategories?: string[];
    preferredTags?: string[];
    preferredCategoryWeights?: Record<string, number>;
    preferredTagWeights?: Record<string, number>;
    preferredTitleFamilyWeights?: Record<string, number>;
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
    const sourceAffinity = detectCatalogReadinessAffinity(video);
    const category = inferCategory(video.category, video.tags, video.title);
    const normalizedTags = splitTags(video.tags).map(normalizeText);
    const preferredCategoryBoost = (context.preferredCategories || []).some((item) => normalizeText(item) === normalizeText(category)) ? 20 : 0;
    const preferredTagBoost = normalizedTags.some((tag) => (context.preferredTags || []).includes(tag)) ? 12 : 0;
    const metadataBonus = video.thumbnailPath ? 10 : 0;
    const weightedCategoryBoost = getWeightedBoost(context.preferredCategoryWeights, [category], 28, 8);
    const weightedTagBoost = getWeightedBoost(context.preferredTagWeights, normalizedTags, 24, 4);
    const weightedTitleFamilyBoost = getWeightedBoost(context.preferredTitleFamilyWeights, getTitleFamilyTokens(video.title), 26, 6);
    const favoriteBoost = (context.favoriteVideoIds || []).includes(video.id) ? 18 : 0;
    const repeatPenalty = (context.recentVideoIds || []).includes(video.id) ? 22 : 0;
    const completionBoost = (context.completedVideoIds || []).includes(video.id) ? 16 : 0;
    const abandonPenalty = (context.abandonedVideoIds || []).includes(video.id) ? 28 : 0;
    const readinessBonus = (video.status === 'READY' && portuguese.portuguese ? 14 : 0) + sourceAffinity.clickReadyScore;
    const profileBoost =
        context.audienceProfile === 'kids' ? (kids.score * 2 + family.score + (adult.adult ? -40 : 0)) :
            context.audienceProfile === 'family' ? (family.score * 2 + portuguese.score + (adult.adult ? -20 : 0)) :
                context.audienceProfile === 'adult' ? (adult.score * 2 + (kids.kids ? -24 : 0)) :
                    0;

    return statusWeight + freshness + popularity + portuguese.score + family.score + kids.score + preferredCategoryBoost + preferredTagBoost + weightedCategoryBoost + weightedTagBoost + weightedTitleFamilyBoost + favoriteBoost + completionBoost + readinessBonus + metadataBonus + profileBoost - repeatPenalty - abandonPenalty;
}

function getSeriesDiscoveryScore(series: any, context: {
    preferredCategories?: string[];
    preferredTags?: string[];
    preferredCategoryWeights?: Record<string, number>;
    preferredTagWeights?: Record<string, number>;
    preferredTitleFamilyWeights?: Record<string, number>;
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
    const sourceAffinity = detectCatalogReadinessAffinity({
        title: series.title,
        tags: series.genres,
        status: series.status,
        quality: `${series.totalEpisodes || 0} episodios`,
        sourceSite: Array.isArray(series.genres) ? series.genres.join(',') : series.genres,
    });
    const preferredCategoryBoost = (context.preferredCategories || []).some((item) => normalizeText(item) === 'series') ? 20 : 0;
    const normalizedGenres = splitTags(series.genres).map(normalizeText);
    const preferredTagBoost = normalizedGenres.some((tag) => (context.preferredTags || []).includes(tag)) ? 12 : 0;
    const metadataBonus = series.poster || series.backdrop ? 15 : 0;
    const weightedCategoryBoost = getWeightedBoost(context.preferredCategoryWeights, ['Series'], 28, 8);
    const weightedTagBoost = getWeightedBoost(context.preferredTagWeights, normalizedGenres, 24, 4);
    const weightedTitleFamilyBoost = getWeightedBoost(context.preferredTitleFamilyWeights, getTitleFamilyTokens(series.title), 24, 6);
    const profileBoost =
        context.audienceProfile === 'kids' ? (kids.score * 2 + family.score + (adult.adult ? -40 : 0)) :
            context.audienceProfile === 'family' ? (family.score * 2 + portuguese.score + (adult.adult ? -20 : 0)) :
                context.audienceProfile === 'adult' ? (adult.score * 2 + (kids.kids ? -24 : 0)) :
                    0;

    return freshness + progress + completeness + portuguese.score + family.score + kids.score + preferredCategoryBoost + preferredTagBoost + weightedCategoryBoost + weightedTagBoost + weightedTitleFamilyBoost + metadataBonus + profileBoost + sourceAffinity.clickReadyScore;
}

function toDiscoveryVideoItem(video: any, score: number) {
    const portuguese = detectPortugueseAffinity(video);
    const kids = detectKidsAffinity(video);
    const family = detectFamilyAffinity(video);
    const adult = detectAdultAffinity(video);
    const sourceAffinity = detectCatalogReadinessAffinity(video);
    return {
        kind: 'video',
        id: video.id,
        title: video.title,
        subtitle: video.description || 'Filme pronto para entrar na sua próxima sessão em família.',
        image: video.thumbnailPath,
        backdrop: video.thumbnailPath,
        href: `/videos/${video.id}`,
        badge: portuguese.dubbed
            ? 'Dublado'
            : sourceAffinity.fromAddonRadar && video.status === 'CATALOG'
                ? 'Radar PT-BR'
                : portuguese.subtitled
                    ? 'Legendado PT-BR'
                    : (video.status || 'Nexus'),
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
        isCatalogBoosted: sourceAffinity.fromAddonRadar || sourceAffinity.fromTrustedSource,
        clickReadyScore: sourceAffinity.clickReadyScore,
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
    const sourceAffinity = detectCatalogReadinessAffinity({
        title: series.title,
        tags: series.genres,
        status: series.status,
        quality: `${series.totalEpisodes || 0} episodios`,
        sourceSite: Array.isArray(series.genres) ? series.genres.join(',') : series.genres,
    });
    return {
        kind: 'series',
        id: series.id,
        title: series.title,
        subtitle: series.overview || 'Série organizada por temporada e pronta para maratona.',
        image: series.poster || series.backdrop,
        backdrop: series.backdrop || series.poster,
        href: `/series/${series.id}`,
        badge: portuguese.dubbed
            ? 'Série em português'
            : sourceAffinity.fromAddonRadar
                ? 'Radar PT-BR'
                : `${series.totalSeasons || 0} temporadas`,
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
        isCatalogBoosted: sourceAffinity.fromAddonRadar || sourceAffinity.fromTrustedSource,
        clickReadyScore: sourceAffinity.clickReadyScore,
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
    prefersPortuguese?: boolean;
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
    prefersPortuguese?: boolean;
} = {}) {
    const videos = dedupeByTitle(items.filter(item => item.kind === 'video'));
    const series = dedupeByTitle(items.filter(item => item.kind === 'series'));
    const portugueseFirst = diversifyItems(items.filter(item => item.isPortuguese), 18);
    const dubbedFirst = diversifyItems(items.filter(item => item.isDubbed), 18);
    const catalogRadar = diversifyItems(
        items
            .filter((item) => item.kind === 'video' && item.status === 'CATALOG' && (item.isPortuguese || item.isCatalogBoosted || Number(item.clickReadyScore || 0) >= 24))
            .sort((a, b) => (Number(b.clickReadyScore || 0) + b.score) - (Number(a.clickReadyScore || 0) + a.score)),
        18
    );
    const kidsFirst = diversifyItems(items.filter((item) => detectKidsAffinity(item).kids).sort((a, b) => b.score - a.score), 18);
    const familyFirst = diversifyItems(items.filter((item) => detectFamilyAffinity(item).family).sort((a, b) => b.score - a.score), 18);
    const adultNight = diversifyItems(items.filter((item) => detectAdultAffinity(item).adult).sort((a, b) => b.score - a.score), 18);
    const recent = diversifyItems([...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), 18);
    const trending = diversifyItems([...items].sort((a, b) => b.score - a.score), 18);
    const continueWatching = dedupeByTitle(context.continueWatching || []).slice(0, 18);
    const becauseYouLike = diversifyItems(context.preferredItems || [], 18);
    const houseAffinity = diversifyItems(
        [...(context.preferredItems || [])].sort((a, b) => ((Number(b.clickReadyScore || 0) + b.score) - (Number(a.clickReadyScore || 0) + a.score))),
        18
    );
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
            id: 'catalog-radar',
            title: 'Catálogo com maior chance de rodar',
            subtitle: 'Itens já enriquecidos pelo Arconte com radar de addons, PT-BR e melhor chance de play.',
            items: catalogRadar,
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
            id: 'house-affinity',
            title: 'Do jeito da sua casa',
            subtitle: 'Títulos que parecem com o que vocês realmente abrem, favoritam e terminam.',
            items: houseAffinity,
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

    const videosById = new Map(videosRaw.map((video: any) => [video.id, video]));
    if (
        userId &&
        (history.length > 0 || favorites.length > 0 || watchSessions.length > 0) &&
        (
            !userProfile ||
            !userProfile.updatedAt ||
            (Date.now() - new Date(userProfile.updatedAt).getTime()) > (1000 * 60 * 60 * 6)
        )
    ) {
        refreshUserTasteProfile(userId).catch(() => null);
    }
    const storedTasteProfile = parseStoredTasteProfile(userProfile?.preferredGenres);
    const storedTasteRaw = (() => {
        try {
            return userProfile?.preferredGenres ? JSON.parse(userProfile.preferredGenres) : {};
        } catch {
            return {};
        }
    })();
    const preferredCategories: string[] = history.map((entry: any) => entry.video?.category).filter(Boolean);
    const preferredTags: string[] = history
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
    const preferredTitleFamilyWeights: Record<string, number> = {};
    mergeStoredWeights(preferredCategoryWeights, storedTasteProfile.categories, 0.85);
    mergeStoredWeights(preferredTagWeights, storedTasteProfile.tags, 0.8);
    mergeStoredWeights(preferredTitleFamilyWeights, storedTasteProfile.titleFamilies, 0.9);
    history.forEach((entry: any) => {
        addWeightedValues(preferredTitleFamilyWeights, getTitleFamilyTokens(entry.video?.title), 1.5);
        addWeightedValues(preferredTagWeights, splitTags(entry.video?.tags), 1.25);
        addWeightedValues(preferredCategoryWeights, [entry.video?.category], 1.15);
    });
    favorites.forEach((entry: any) => {
        addWeightedValues(preferredTitleFamilyWeights, getTitleFamilyTokens(entry.video?.title), 3.5);
        addWeightedValues(preferredTagWeights, splitTags(entry.video?.tags), 2.5);
        addWeightedValues(preferredCategoryWeights, [entry.video?.category], 2.75);
    });
    watchSessions
        .filter((entry: any) => !!entry.completed || Number(entry.progress || 0) >= 0.75)
        .forEach((entry: any) => {
            const watchedVideo = videosById.get(entry.videoId);
            addWeightedValues(preferredTitleFamilyWeights, getTitleFamilyTokens(watchedVideo?.title), 2.75);
            addWeightedValues(preferredTagWeights, splitTags(watchedVideo?.tags), 2.25);
            addWeightedValues(preferredCategoryWeights, [watchedVideo?.category], 2.25);
        });
    const persistentCategories = Object.keys(storedTasteProfile.categories || {})
        .filter((key) => Number(storedTasteProfile.categories[key] || 0) >= 1.5);
    const persistentTags = Object.keys(storedTasteProfile.tags || {})
        .filter((key) => Number(storedTasteProfile.tags[key] || 0) >= 1.5);
    preferredCategories.push(...persistentCategories);
    preferredTags.push(...persistentTags);
    const favoriteVideoIds: string[] = favorites.map((entry: any) => entry.videoId).filter(Boolean);
    const recentVideoIds: string[] = history.map((entry: any) => entry.videoId).filter(Boolean);
    const completedVideoIds: string[] = Array.from(new Set(
        watchSessions
            .filter((entry: any) => !!entry.completed)
            .map((entry: any) => entry.videoId)
            .filter(Boolean)
    ));
    const abandonedVideoIds: string[] = Array.from(new Set(
        watchSessions
            .filter((entry: any) => !!entry.abandoned)
            .map((entry: any) => entry.videoId)
            .filter(Boolean)
    ));
    const familySignal = preferredTags.filter((tag) => /familia|family|infantil|kids|animacao|anime|aventura|comedia/.test(tag)).length
        + Object.entries(storedTasteProfile.tags || {}).filter(([tag]) => /familia|family|infantil|kids|animacao|anime|aventura|comedia/.test(tag)).length;
    const adultSignal = preferredTags.filter((tag) => /terror|horror|thriller|crime|suspense|guerra|adult/.test(tag)).length
        + Object.entries(storedTasteProfile.tags || {}).filter(([tag]) => /terror|horror|thriller|crime|suspense|guerra|adult/.test(tag)).length;
    const dayMoment = getDayMoment();
    const persistentPortugueseSignal = Number(storedTasteRaw?.languageSignals?.['audio-pt-br'] || 0)
        + Number(storedTasteRaw?.languageSignals?.dubbed || 0)
        + Number(storedTasteRaw?.languageSignals?.['subtitle-pt-br'] || 0);

    const scoredVideos = videosRaw
        .map((video: any) => toDiscoveryVideoItem(video, getVideoDiscoveryScore(video, {
            preferredCategories,
            preferredTags,
            preferredCategoryWeights,
            preferredTagWeights,
            preferredTitleFamilyWeights,
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
            preferredTitleFamilyWeights,
            audienceProfile,
        })))
        .filter((item: any) => !!item.image)
        .sort((a: any, b: any) => b.score - a.score);

    const arconteVideos = await enrichDiscoveryItemsWithArconteSignals(scoredVideos);
    const arconteSeries = await enrichDiscoveryItemsWithArconteSignals(scoredSeries);
    const enrichedVideos = await enrichDiscoveryItemsWithPtBrSignals(arconteVideos);
    const enrichedSeries = await enrichDiscoveryItemsWithPtBrSignals(arconteSeries);

    const visibilityFilteredVideos = audienceProfile === 'kids'
        ? enrichedVideos.filter((item: any) => !item.isAdult)
        : enrichedVideos;
    const visibilityFilteredSeries = audienceProfile === 'kids'
        ? enrichedSeries.filter((item: any) => !item.isAdult)
        : enrichedSeries;

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
        const titleTokens = getTitleFamilyTokens(item.title);
        return !abandonedVideoIds.includes(item.id) && (
            preferredCategories.some((category) => normalizeText(category) === normalizedCategory)
            || itemTags.some((tag: string) => preferredTags.includes(tag))
            || titleTokens.some((token) => Number(preferredTitleFamilyWeights[token] || 0) >= 2)
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
        prefersPortuguese: persistentPortugueseSignal > 2 || preferredTags.some((tag) => /(dublado|pt-br|portugues|legendado)/.test(tag)),
    });
    const featured = chooseFeaturedItem(allItems, {
        dayMoment,
        familyHeavy: familySignal >= adultSignal,
        adultHeavy: adultSignal > familySignal,
        audienceProfile,
        prefersPortuguese: persistentPortugueseSignal > 2 || preferredTags.some((tag) => /(dublado|pt-br|portugues|legendado)/.test(tag)),
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

app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY || 1);

const allowedOrigins = String(process.env.CORS_ORIGINS || '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }

        callback(new Error('Origin not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
}));

app.use((req, res, next) => {
    const requestId = String(req.headers['x-request-id'] || crypto.randomUUID());
    const startedAt = Date.now();

    res.locals.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader('referrer-policy', 'no-referrer');

    res.on('finish', () => {
        const durationMs = Date.now() - startedAt;
        if (res.statusCode >= 500 || durationMs >= 2500) {
            console.warn(`[HTTP] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${durationMs}ms) [${requestId}]`);
            structuredLogger.warn('HTTP request exceeded threshold', {
                method: req.method,
                path: req.originalUrl,
                statusCode: res.statusCode,
                durationMs,
                requestId,
            });
        }
    });

    next();
});

app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '1mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.FORM_BODY_LIMIT || '1mb' }));

const searchRateLimit = createRateLimit({
    keyPrefix: 'search',
    limit: Number(process.env.SEARCH_RATE_LIMIT || 45),
    windowMs: Number(process.env.SEARCH_RATE_WINDOW_MS || 60_000),
});

const mutationRateLimit = createRateLimit({
    keyPrefix: 'mutation',
    limit: Number(process.env.MUTATION_RATE_LIMIT || 20),
    windowMs: Number(process.env.MUTATION_RATE_WINDOW_MS || 60_000),
});

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
app.use('/api/v1/downloads', mutationRateLimit, downloaderRoutes);
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
app.use('/api/v1/search', searchRateLimit, searchRoutes);

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
            refreshUserTasteProfile(userId).catch(() => null);
            return res.json({ favorited: false });
        } else {
            await prisma.favorite.create({
                data: { videoId, userId }
            });
            refreshUserTasteProfile(userId).catch(() => null);
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
        refreshUserTasteProfile(userId).catch(() => null);
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
        const parsedBody = validatePayload(autoIngestSchema, req.body);
        if (!parsedBody.ok) {
            return res.status(400).json({ error: parsedBody.error });
        }

        const { title, description, category, externalSource, thumbnailUrl, tags, status: requestedStatus, tmdbId, imdbId, quality, language, sourceSite, backdropUrl, predictive, originalTitle } = parsedBody.data;
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
            isPredictive: predictive || false,
            tmdbId: tmdbId ? String(tmdbId) : null,
            imdbId: imdbId ? String(imdbId) : null,
            quality: normalizedQuality,
            originalTitle: originalTitle || null,
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
            if (predictive && finalStatus !== 'CATALOG') {
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
        const parsedBody = validatePayload(playVideoSchema, req.body || {});
        if (!parsedBody.ok) {
            return res.status(400).json({ error: parsedBody.error });
        }

        const { id } = req.params;
        const video = await prisma.video.findUnique({ where: { id } });

        if (!video) {
            return res.status(404).json({ error: 'Vídeo não encontrado' });
        }

        if (video.status === 'READY') {
            const playbackLanguageMode = getPlaybackLanguageMode(video);
            return res.json({
                status: 'READY',
                video,
                playbackLanguageMode,
                fallbackApplied: playbackLanguageMode !== 'audio-pt-br',
            });
        }

        const requestedMagnet = parsedBody.data.magnetURI || null;
        const requestedInfoHash = parsedBody.data.infoHash || null;
        const directMagnet = requestedMagnet || buildBasicMagnet(requestedInfoHash);
        const requestedSourceSite = parsedBody.data.sourceSite || null;
        const requestedQuality = parsedBody.data.quality || null;
        const requestedLanguage = parsedBody.data.language || null;

        const resolvedSource = directMagnet
            ? {
                magnetURI: directMagnet,
                sourceSite: requestedSourceSite || 'addon-direct',
                quality: requestedQuality || video.quality || null,
                language: requestedLanguage || (video.hasPortugueseAudio ? 'pt-BR' : video.hasPortugueseSubs ? 'pt-BR-sub' : 'und'),
                playbackLanguageMode: getPlaybackLanguageMode({
                    language: requestedLanguage || (video.hasPortugueseAudio ? 'pt-BR' : video.hasPortugueseSubs ? 'pt-BR-sub' : 'und'),
                }),
                fallbackApplied: getPlaybackLanguageMode({
                    language: requestedLanguage || (video.hasPortugueseAudio ? 'pt-BR' : video.hasPortugueseSubs ? 'pt-BR-sub' : 'und'),
                }) !== 'audio-pt-br',
            }
            : await resolveMovieMaterializationSource(video);
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
        await SourceIntelligence.rememberWarmSuccess({
            title: video.title,
            originalTitle: (video as any).originalTitle || null,
            tmdbId: (video as any).tmdbId || null,
            imdbId: (video as any).imdbId || null,
            preferredQuality: resolvedSource?.quality || video.quality || '1080p',
            preferredLanguage: resolvedSource?.language || (video.hasPortugueseAudio ? 'pt-BR' : 'und'),
        }, {
            magnetURI,
            sourceSite: resolvedSource?.sourceSite || 'resolved',
            quality: resolvedSource?.quality || video.quality || null,
            language: resolvedSource?.language || null,
            seeds: null,
            title: video.title,
        });
        const playbackLanguageMode = resolvedSource?.playbackLanguageMode || getPlaybackLanguageMode({ language: resolvedSource?.language || 'und' });

        res.status(202).json({
            status: 'PROCESSING',
            playbackLanguageMode,
            fallbackApplied: playbackLanguageMode !== 'audio-pt-br',
            sourceSite: resolvedSource?.sourceSite || null,
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
        const parsedBody = validatePayload(importVideoSchema, req.body);
        if (!parsedBody.ok) {
            return res.status(400).json({ error: parsedBody.error });
        }

        const { tmdbId, imdbId, title, overview, poster_path, backdrop_path, release_date, media_type, userId, tags } = parsedBody.data;

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

app.post('/api/v1/ai/deep-search', mutationRateLimit, async (req, res) => {
    const { query, prioritizePTBR = true, ptbrOnly = false } = req.body;
    if (!query) return res.status(400).json({ error: 'Termo de busca vazio.' });

    structuredLogger.info('AI deep search dispatched', {
        query,
        prioritizePTBR,
        ptbrOnly,
    });
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
        const parsedBody = validatePayload(commentSchema, req.body);
        if (!parsedBody.ok) {
            return res.status(400).json({ error: parsedBody.error });
        }
        const { content, userId } = parsedBody.data;
        const comment = await prisma.comment.create({ data: { content, videoId: id, userId } });
        res.json(comment);
    } catch (e) {
        res.status(500).json({ error: 'Failed' });
    }
});

app.post('/api/v1/videos/:id/like', async (req, res) => {
    try {
        const { id } = req.params;
        const parsedBody = validatePayload(likeSchema, req.body);
        if (!parsedBody.ok) {
            return res.status(400).json({ error: parsedBody.error });
        }
        const { userId, isLike } = parsedBody.data;
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




// 🚀 EVENT BRIDGE: INTERNAL -> SOCKETS (Organismo de Mídia Vivo)
eventBus.on(SystemEvents.MATERIALIZATION_COMPLETED, (data) => {
    io.emit('materialization_complete', {
        id: data.videoId,
        title: data.title,
        thumbnail: data.thumbnail,
        message: 'Materialização Concluída! Pronto para Play.'
    });
});

eventBus.on(SystemEvents.FAVORITE_ADDED, (data) => {
    io.emit('favorite_added', {
        videoId: data.videoId,
        title: data.title,
        thumbnail: data.thumbnail,
        status: data.status,
        source: data.source
    });
});

eventBus.on(SystemEvents.ARCONTE_INSIGHT, (data) => {
    io.emit('arconte_insight', {
        message: data.message,
        type: data.type || 'thought',
        metadata: data.metadata || null
    });
});

eventBus.on(SystemEvents.SYSTEM_ACTIVITY, (data) => {
    io.emit('system_activity', {
        activity: data.activity,
        detail: data.detail || null
    });
});

server.listen(PORT, HOST, () => {
    structuredLogger.info('StreamForge backend online', {
        host: HOST,
        port: PORT,
        iptvRoute: '/api/iptv/*',
        intelligenceRoute: '/api/intelligence/*',
        downloadsRoute: '/api/v1/downloads/*',
        telemetryRoute: '/api/v1/system/telemetry',
    });
    console.log(`🚀 STREAMFORGE BACKEND ONLINE EM ${HOST}:${PORT}`);
    console.log(`📺 IPTV Module: /api/iptv/*`);
    console.log(`🧠 Intelligence Engine: /api/intelligence/*`);
    console.log(`📥 Downloader V2: /api/v1/downloads/*`);
    console.log(`📊 Telemetry Engine: /api/v1/system/telemetry`);

    // Inicia o worker de inteligência
    startWorker().catch((error) => {
        structuredLogger.error('Failed to start intelligence worker', {
            error: error instanceof Error ? error.message : String(error),
        });
        console.error(error);
    });

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
