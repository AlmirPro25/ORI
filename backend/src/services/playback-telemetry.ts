import { ConsumptionAnalytics } from './consumption-analytics';

export interface ActivePlaybackSession {
    socketId: string;
    userId: string;
    videoId: string;
    episodeId?: string | null;
    source: 'LOCAL' | 'REMOTE' | 'UNKNOWN';
    startedAt: number;
    lastSeenAt: number;
    heartbeats: number;
    bufferEvents: number;
    currentTime: number;
    playbackState: 'starting' | 'playing' | 'buffering' | 'paused' | 'stopped';
}

interface TtffSample {
    ttff: number;
    source: 'LOCAL' | 'REMOTE' | 'UNKNOWN';
    recordedAt: number;
}

const ACTIVE_SESSION_TTL_MS = 45 * 1000;
const MAX_TTFF_SAMPLES = 200;

class PlaybackTelemetryService {
    private activeSessions = new Map<string, ActivePlaybackSession>();
    private ttffSamples: TtffSample[] = [];

    private pruneExpiredSessions(now: number = Date.now()) {
        for (const [socketId, session] of Array.from(this.activeSessions.entries())) {
            if ((now - session.lastSeenAt) > ACTIVE_SESSION_TTL_MS) {
                this.activeSessions.delete(socketId);
            }
        }
    }

    private normalizeSource(source?: string | null): ActivePlaybackSession['source'] {
        const normalized = String(source || '').trim().toUpperCase();
        if (normalized === 'LOCAL' || normalized === 'CACHE') return 'LOCAL';
        if (normalized === 'REMOTE' || normalized === 'P2P') return 'REMOTE';
        return 'UNKNOWN';
    }

    public trackSessionStart(params: {
        socketId: string;
        userId: string;
        videoId?: string | null;
        episodeId?: string | null;
        source?: string | null;
    }) {
        const now = Date.now();
        this.pruneExpiredSessions(now);

        const current = this.activeSessions.get(params.socketId);
        const resolvedVideoId = String(params.videoId || params.episodeId || current?.videoId || '').trim();
        if (!resolvedVideoId) return;

        this.activeSessions.set(params.socketId, {
            socketId: params.socketId,
            userId: String(params.userId || current?.userId || 'anon'),
            videoId: resolvedVideoId,
            episodeId: params.episodeId || current?.episodeId || null,
            source: this.normalizeSource(params.source || current?.source),
            startedAt: current?.startedAt || now,
            lastSeenAt: now,
            heartbeats: current?.heartbeats || 0,
            bufferEvents: current?.bufferEvents || 0,
            currentTime: current?.currentTime || 0,
            playbackState: 'starting',
        });
    }

    public trackHeartbeat(params: {
        socketId: string;
        userId?: string | null;
        videoId?: string | null;
        episodeId?: string | null;
        source?: string | null;
        currentTime?: number | null;
        buffering?: boolean;
        playbackState?: ActivePlaybackSession['playbackState'];
        bufferEvents?: number | null;
    }) {
        const now = Date.now();
        this.pruneExpiredSessions(now);

        const existing = this.activeSessions.get(params.socketId);
        if (!existing) {
            this.trackSessionStart({
                socketId: params.socketId,
                userId: String(params.userId || 'anon'),
                videoId: params.videoId,
                episodeId: params.episodeId,
                source: params.source,
            });
        }

        const current = this.activeSessions.get(params.socketId);
        if (!current) return;

        current.lastSeenAt = now;
        current.heartbeats += 1;
        current.userId = String(params.userId || current.userId || 'anon');
        current.videoId = String(params.videoId || params.episodeId || current.videoId);
        current.episodeId = params.episodeId ?? current.episodeId ?? null;
        current.source = this.normalizeSource(params.source || current.source);
        current.currentTime = Number(params.currentTime ?? current.currentTime ?? 0);
        current.bufferEvents = Math.max(current.bufferEvents, Number(params.bufferEvents ?? current.bufferEvents ?? 0));
        current.playbackState = params.playbackState || (params.buffering ? 'buffering' : 'playing');
    }

    public trackSessionStop(socketId: string) {
        this.activeSessions.delete(socketId);
    }

    public trackTTFF(ttff: number, source?: string | null) {
        if (!Number.isFinite(ttff) || ttff < 0) return;

        this.ttffSamples.push({
            ttff,
            source: this.normalizeSource(source),
            recordedAt: Date.now(),
        });

        if (this.ttffSamples.length > MAX_TTFF_SAMPLES) {
            this.ttffSamples = this.ttffSamples.slice(-MAX_TTFF_SAMPLES);
        }
    }

    public getStats() {
        this.pruneExpiredSessions();
        const sessions = Array.from(this.activeSessions.values());
        const uniqueUsers = new Set(sessions.map((session) => session.userId)).size;
        const localSessions = sessions.filter((session) => session.source === 'LOCAL').length;
        const remoteSessions = sessions.filter((session) => session.source === 'REMOTE').length;
        const bufferingSessions = sessions.filter((session) => session.playbackState === 'buffering').length;

        const samples = this.ttffSamples.map((sample) => sample.ttff).sort((a, b) => a - b);
        const avgTTFF = samples.length > 0
            ? Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length)
            : 0;
        const p95TTFF = samples.length > 0
            ? samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))]
            : 0;

        const topContent = sessions.reduce<Record<string, number>>((acc, session) => {
            const key = session.episodeId || session.videoId;
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});

        const hottestSession = Object.entries(topContent)
            .sort((a, b) => b[1] - a[1])[0];

        return {
            avgTTFF,
            p95TTFF,
            samples: this.ttffSamples.length,
            cacheHitRate: ConsumptionAnalytics.getCacheHitRate(),
            activePlaybackSessions: sessions.length,
            activeUniqueUsers: uniqueUsers,
            localPlaybackSessions: localSessions,
            remotePlaybackSessions: remoteSessions,
            bufferingSessions,
            hottestPlaybackTarget: hottestSession
                ? { id: hottestSession[0], viewers: hottestSession[1] }
                : null,
        };
    }
}

export const PlaybackTelemetry = new PlaybackTelemetryService();
