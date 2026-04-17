import { useCallback, useEffect, useMemo, useState } from 'react';
import apiClient from '@/lib/axios';
import { Video } from '@/types/schema';
import { useAuthStore } from '@/stores/auth.store';

type FavoritesState = {
    videos: Video[];
    favoriteIds: Set<string>;
    loading: boolean;
    error: string | null;
};

type FavoritesEntry = {
    state: FavoritesState;
    promise: Promise<Video[]> | null;
    listeners: Set<(state: FavoritesState) => void>;
    subscribers: number;
};

const favoritesStore = new Map<string, FavoritesEntry>();

const createEmptyState = (): FavoritesState => ({
    videos: [],
    favoriteIds: new Set(),
    loading: true,
    error: null,
});

const getEntry = (userId?: string) => {
    const key = userId || 'anonymous';
    let entry = favoritesStore.get(key);
    if (!entry) {
        entry = {
            state: createEmptyState(),
            promise: null,
            listeners: new Set(),
            subscribers: 0,
        };
        favoritesStore.set(key, entry);
    }
    return { key, entry };
};

const emit = (entry: FavoritesEntry) => {
    for (const listener of entry.listeners) {
        listener(entry.state);
    }
};

const setEntryState = (entry: FavoritesEntry, next: Partial<FavoritesState>) => {
    entry.state = {
        ...entry.state,
        ...next,
        favoriteIds: next.favoriteIds ?? entry.state.favoriteIds,
    };
    emit(entry);
};

const fetchFavoritesInternal = async (userId?: string, silent = false) => {
    const { entry } = getEntry(userId);

    if (!userId) {
        setEntryState(entry, {
            videos: [],
            favoriteIds: new Set(),
            loading: false,
            error: null,
        });
        return [];
    }

    if (entry.promise) return entry.promise;

    if (!silent) {
        setEntryState(entry, { loading: true });
    }

    entry.promise = apiClient.get<Video[]>(`/users/${userId}/favorites`)
        .then((response) => {
            const videos = Array.isArray(response.data) ? response.data : [];
            setEntryState(entry, {
                videos,
                favoriteIds: new Set(videos.map((video) => video.id)),
                loading: false,
                error: null,
            });
            return videos;
        })
        .catch((err: any) => {
            console.error(err);
            setEntryState(entry, {
                loading: false,
                error: err?.message || 'Falha ao carregar favoritos.',
            });
            throw err;
        })
        .finally(() => {
            entry.promise = null;
        });

    return entry.promise;
};

export const useFavorites = () => {
    const { user } = useAuthStore();
    const userId = user?.id;
    const { entry } = useMemo(() => getEntry(userId), [userId]);
    const [state, setState] = useState<FavoritesState>(entry.state);

    const refresh = useCallback(async (silent = false) => {
        try {
            await fetchFavoritesInternal(userId, silent);
        } catch {
            // shared state already updated
        }
    }, [userId]);

    const toggleFavorite = useCallback(async (videoId: string) => {
        if (!userId) {
            throw new Error('AUTH_REQUIRED');
        }

        const { entry: currentEntry } = getEntry(userId);
        const response = await apiClient.post<{ favorited: boolean }>(`/users/${userId}/favorites/${videoId}`);
        const favorited = Boolean(response.data?.favorited);
        const nextIds = new Set(currentEntry.state.favoriteIds);

        if (favorited) {
            nextIds.add(videoId);
        } else {
            nextIds.delete(videoId);
        }

        const nextVideos = favorited
            ? currentEntry.state.videos
            : currentEntry.state.videos.filter((video) => video.id !== videoId);

        setEntryState(currentEntry, {
            favoriteIds: nextIds,
            videos: nextVideos,
        });

        return favorited;
    }, [userId]);

    useEffect(() => {
        entry.listeners.add(setState);
        entry.subscribers += 1;

        if (userId && entry.state.loading && !entry.promise && entry.state.videos.length === 0) {
            void fetchFavoritesInternal(userId, false);
        }

        if (!userId) {
            void fetchFavoritesInternal(undefined, true);
        }

        return () => {
            entry.listeners.delete(setState);
            entry.subscribers = Math.max(0, entry.subscribers - 1);
        };
    }, [entry, userId]);

    return {
        favorites: state.videos,
        favoriteIds: state.favoriteIds,
        loading: state.loading,
        error: state.error,
        refresh,
        toggleFavorite,
        isFavorited: (videoId: string) => state.favoriteIds.has(videoId),
    };
};
