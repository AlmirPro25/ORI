const routePrefetchers: Array<[RegExp, () => Promise<unknown>]> = [
    [/^\/search$/, () => import('@/pages/Search')],
    [/^\/movies$/, () => import('@/pages/Movies')],
    [/^\/series$/, () => import('@/pages/Series')],
    [/^\/series\/[^/]+$/, () => import('@/pages/SeriesDetails')],
    [/^\/series\/episode\/[^/]+$/, () => import('@/components/EpisodePlayer')],
    [/^\/videos\/[^/]+$/, async () => {
        await Promise.all([
            import('@/pages/VideoDetails'),
            import('@/components/PlayerComponent'),
        ]);
    }],
    [/^\/torrents$/, () => import('@/pages/TorrentSearch')],
    [/^\/tv$/, () => import('@/pages/LiveTV')],
    [/^\/favorites$/, () => import('@/pages/MyList')],
    [/^\/profile$/, () => import('@/pages/Profile')],
    [/^\/stats$/, () => import('@/components/SystemStats')],
    [/^\/addons$/, () => import('@/pages/AddonsPage')],
    [/^\/orion$/, () => import('@/pages/OrionNetwork')],
    [/^\/admin$/, () => import('@/pages/Admin')],
    [/^\/admin\/dashboard$/, () => import('@/pages/AdminDashboard')],
    [/^\/torrent-player$/, () => import('@/pages/TorrentPlayerPage')],
    [/^\/video\/[^/]+$/, () => import('@/pages/TorrentPlayerPage')],
];

const prefetched = new Set<string>();
const idleScheduled = new Set<string>();

type PrefetchPriority = 'immediate' | 'idle';

const canUseAggressivePrefetch = () => {
    if (typeof navigator === 'undefined') return true;

    const connection = (navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;

    if (!connection) return true;
    if (connection.saveData) return false;
    if (connection.effectiveType && /(^|-)2g$/.test(connection.effectiveType)) return false;
    return true;
};

const schedulePrefetch = (key: string, runner: () => Promise<unknown>, priority: PrefetchPriority = 'immediate') => {
    if (prefetched.has(key)) return;

    if (priority === 'idle' && canUseAggressivePrefetch()) {
        if (idleScheduled.has(key)) return;
        idleScheduled.add(key);

        const run = () => {
            idleScheduled.delete(key);
            if (prefetched.has(key)) return;
            prefetched.add(key);
            void runner().catch(() => {
                prefetched.delete(key);
            });
        };

        const requestIdle = (globalThis as typeof globalThis & {
            requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
        }).requestIdleCallback;

        if (requestIdle) {
            requestIdle(run, { timeout: 1200 });
            return;
        }

        window.setTimeout(run, 250);
        return;
    }

    prefetched.add(key);
    void runner().catch(() => {
        prefetched.delete(key);
    });
};

export const prefetchRoute = (path: string, priority: PrefetchPriority = 'immediate') => {
    if (!path) return;

    const entry = routePrefetchers.find(([pattern]) => pattern.test(path));
    if (!entry) return;

    schedulePrefetch(path, entry[1], priority);
};

export const prefetchVideoExperience = (input: {
    id: string;
    status?: string | null;
    hasStream?: boolean;
    hasMagnet?: boolean;
}, priority: PrefetchPriority = 'immediate') => {
    const path = `/videos/${input.id}`;
    prefetchRoute(path, priority);

    const tasks: Array<Promise<unknown>> = [];

    if (input.hasStream || input.status === 'READY' || input.status === 'REMOTE') {
        tasks.push(import('@/components/PlayerComponent'));
    }

    if (input.hasMagnet || input.status === 'NEXUS' || input.status === 'PROCESSING') {
        tasks.push(import('@/components/TorrentPlayer'));
        tasks.push(import('@/components/SynergyMonitor'));
    }

    if (input.status === 'CATALOG' || input.status === 'NEXUS') {
        tasks.push(import('@/components/AddonStreamDialog'));
    }

    if (tasks.length > 0) {
        schedulePrefetch(`video-experience:${input.id}`, () => Promise.all(tasks), priority);
    }
};

export const prefetchSeriesExperience = (seriesId: string, priority: PrefetchPriority = 'immediate') => {
    prefetchRoute(`/series/${seriesId}`, priority);
};

export const prefetchEpisodeExperience = (episodeId: string, status?: string | null, priority: PrefetchPriority = 'immediate') => {
    if (status !== 'READY') return;

    const path = `/series/episode/${episodeId}`;
    prefetchRoute(path, priority);
    schedulePrefetch(`episode-experience:${episodeId}`, () => Promise.all([
        import('@/components/EpisodePlayer'),
        import('@/components/PlayerComponent'),
    ]), priority);
};
