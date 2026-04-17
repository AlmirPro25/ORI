import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { MediaInfoExtractor } from '../media-info-extractor';
import { LanguageVerificationTelemetry } from './language-verification-telemetry';
import { SourceIntelligence } from './source-intelligence';
import { VideoSelectionTelemetry } from './video-selection-telemetry';

const prisma = new PrismaClient();

function normalize(value?: string | null) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function splitTags(tags?: string | null) {
    return String(tags || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function inferObservedSource(tags?: string | null) {
    const candidates = splitTags(tags);
    const ignored = new Set([
        'resolvedsource',
        'autobot',
        'pt-br',
        'pt-br-sub',
        'und',
        'catalog',
    ]);

    return candidates.find((tag) => {
        const normalized = normalize(tag);
        return normalized
            && !ignored.has(normalized)
            && !normalized.startsWith('quality:')
            && !normalized.startsWith('lang:')
            && !normalized.startsWith('genre:');
    }) || null;
}

function resolveVideoPath(storageKey?: string | null) {
    const candidatePaths = [
        storageKey && path.isAbsolute(storageKey) ? storageKey : '',
        storageKey ? path.join(process.cwd(), 'uploads', storageKey) : '',
        storageKey ? path.join(process.cwd(), storageKey) : '',
        storageKey ? path.join(__dirname, '../../uploads', storageKey) : '',
    ].filter(Boolean);

    return candidatePaths.find((candidate) => fs.existsSync(candidate)) || null;
}

async function waitForStableFile(filePath: string, attempts: number = 8, delayMs: number = 500) {
    let lastSize = -1;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (!fs.existsSync(filePath)) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            continue;
        }

        const stats = await fs.promises.stat(filePath).catch(() => null);
        if (!stats?.isFile()) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            continue;
        }

        if (stats.size > 0 && stats.size === lastSize) {
            return true;
        }

        lastSize = stats.size;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    return fs.existsSync(filePath);
}

export class MediaVerificationService {
    static async verifyVideo(videoId: string) {
        const video = await (prisma as any).video.findUnique({
            where: { id: videoId },
            select: {
                id: true,
                title: true,
                originalTitle: true,
                tmdbId: true,
                imdbId: true,
                quality: true,
                tags: true,
                storageKey: true,
                hasPortugueseAudio: true,
                hasPortugueseSubs: true,
                episode: {
                    select: {
                        seasonNumber: true,
                        episodeNumber: true,
                    },
                },
            } as any,
        });

        if (!video?.storageKey || String(video.storageKey).startsWith('magnet:')) {
            return { verified: false, reason: 'video file not available' };
        }

        const videoPath = resolveVideoPath(video.storageKey);
        if (!videoPath) {
            return { verified: false, reason: 'video path not found' };
        }

        const stable = await waitForStableFile(videoPath);
        if (!stable) {
            return { verified: false, reason: 'video file not stable yet' };
        }

        const mediaInfo = await MediaInfoExtractor.extractMediaInfo(videoPath);
        const hasPortugueseAudio = mediaInfo.detectionSummary.portugueseAudioConfidence >= 0.6;
        const hasPortugueseSubtitle = mediaInfo.detectionSummary.portugueseSubtitleConfidence >= 0.55;

        await (prisma as any).video.update({
            where: { id: videoId },
            data: {
                audioTracks: JSON.stringify(mediaInfo.audioTracks),
                subtitleTracks: JSON.stringify(mediaInfo.subtitleTracks),
                hasPortuguese: hasPortugueseAudio || hasPortugueseSubtitle,
                hasPortugueseAudio,
                hasPortugueseSubs: hasPortugueseSubtitle,
                hasDubbed: hasPortugueseAudio,
            },
        });

        await SourceIntelligence.recordMediaVerification({
            title: video.title,
            originalTitle: video.originalTitle || null,
            tmdbId: video.tmdbId || null,
            imdbId: video.imdbId || null,
            preferredQuality: video.quality || null,
            preferredLanguage: hasPortugueseAudio ? 'pt-BR' : hasPortugueseSubtitle ? 'pt-BR-sub' : 'und',
            seasonNumber: video.episode?.seasonNumber || null,
            episodeNumber: video.episode?.episodeNumber || null,
        }, {
            observedSource: inferObservedSource(video.tags),
            hasPortugueseAudio,
            hasPortugueseSubtitle,
            claimedLanguage: video.hasPortugueseAudio ? 'pt-BR' : video.hasPortugueseSubs ? 'pt-BR-sub' : 'und',
        });

        await LanguageVerificationTelemetry.record({
            videoId,
            title: video.title,
            source: inferObservedSource(video.tags) || 'unknown',
            primaryAudioLanguage: mediaInfo.detectionSummary.primaryAudioLanguage,
            primarySubtitleLanguage: mediaInfo.detectionSummary.primarySubtitleLanguage,
            portugueseAudioConfidence: mediaInfo.detectionSummary.portugueseAudioConfidence,
            portugueseSubtitleConfidence: mediaInfo.detectionSummary.portugueseSubtitleConfidence,
            dubbedConfidence: mediaInfo.detectionSummary.dubbedConfidence,
            subtitleConfidence: mediaInfo.detectionSummary.subtitleConfidence,
        });

        await VideoSelectionTelemetry.markVerification(videoId, {
            hasPortugueseAudio,
            hasPortugueseSubtitle,
        });

        return {
            verified: true,
            videoId,
            videoPath,
            hasPortugueseAudio,
            hasPortugueseSubtitle,
            audioTracks: mediaInfo.audioTracks,
            subtitleTracks: mediaInfo.subtitleTracks,
            detectionSummary: mediaInfo.detectionSummary,
        };
    }
}
