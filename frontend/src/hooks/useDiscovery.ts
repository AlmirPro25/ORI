import { useCallback, useEffect, useMemo, useState } from 'react';
import DiscoveryService from '@/services/api/discovery.service';
import { DiscoveryFeed } from '@/types/discovery';
import { useAuthStore } from '@/stores/auth.store';
import { HouseholdProfile, useHouseholdProfileStore } from '@/stores/householdProfile.store';

type DiscoveryState = {
    feed: DiscoveryFeed | null;
    loading: boolean;
    error: string | null;
};

type DiscoveryEntry = {
    state: DiscoveryState;
    promise: Promise<DiscoveryFeed> | null;
    interval: ReturnType<typeof setInterval> | null;
    subscribers: number;
    listeners: Set<(state: DiscoveryState) => void>;
};

const DISCOVERY_POLL_INTERVAL = 15000;
const discoveryStore = new Map<string, DiscoveryEntry>();

const getDiscoveryKey = (userId?: string, profile?: HouseholdProfile) =>
    JSON.stringify({
        userId: userId || null,
        profile: profile || null,
    });

const getOrCreateEntry = (key: string): DiscoveryEntry => {
    let entry = discoveryStore.get(key);
    if (!entry) {
        entry = {
            state: {
                feed: null,
                loading: true,
                error: null,
            },
            promise: null,
            interval: null,
            subscribers: 0,
            listeners: new Set(),
        };
        discoveryStore.set(key, entry);
    }
    return entry;
};

const emitEntry = (entry: DiscoveryEntry) => {
    for (const listener of entry.listeners) {
        listener(entry.state);
    }
};

const setEntryState = (entry: DiscoveryEntry, next: Partial<DiscoveryState>) => {
    entry.state = { ...entry.state, ...next };
    emitEntry(entry);
};

const fetchDiscoveryFeed = async (key: string, userId?: string, profile?: HouseholdProfile, silent = false) => {
    const entry = getOrCreateEntry(key);

    if (entry.promise) return entry.promise;

    if (!silent) {
        setEntryState(entry, { loading: true });
    }

    entry.promise = DiscoveryService.getFeed(userId, profile)
        .then((data) => {
            setEntryState(entry, {
                feed: data,
                loading: false,
                error: null,
            });
            return data;
        })
        .catch((err: any) => {
            console.error(err);
            setEntryState(entry, {
                loading: false,
                error: err?.message || 'Falha ao carregar discovery feed.',
            });
            throw err;
        })
        .finally(() => {
            entry.promise = null;
        });

    return entry.promise;
};

const ensureDiscoveryPolling = (key: string, userId?: string, profile?: HouseholdProfile) => {
    const entry = getOrCreateEntry(key);
    if (entry.interval) return;

    entry.interval = setInterval(() => {
        void fetchDiscoveryFeed(key, userId, profile, true);
    }, DISCOVERY_POLL_INTERVAL);
};

const teardownDiscoveryPolling = (key: string) => {
    const entry = discoveryStore.get(key);
    if (!entry || entry.subscribers > 0 || !entry.interval) return;

    clearInterval(entry.interval);
    entry.interval = null;
};

export const useDiscoveryFeed = () => {
    const { user } = useAuthStore();
    const { profile } = useHouseholdProfileStore();
    const key = useMemo(() => getDiscoveryKey(user?.id, profile), [user?.id, profile]);
    const [state, setState] = useState<DiscoveryState>(() => getOrCreateEntry(key).state);

    const refresh = useCallback(async (silent = false) => {
        try {
            await fetchDiscoveryFeed(key, user?.id, profile, silent);
        } catch {
            // O estado compartilhado já foi atualizado.
        }
    }, [key, user?.id, profile]);

    useEffect(() => {
        const entry = getOrCreateEntry(key);
        setState(entry.state);
        entry.listeners.add(setState);
        entry.subscribers += 1;

        if (!entry.state.feed && !entry.promise) {
            void fetchDiscoveryFeed(key, user?.id, profile, false);
        }

        ensureDiscoveryPolling(key, user?.id, profile);

        return () => {
            const current = getOrCreateEntry(key);
            current.listeners.delete(setState);
            current.subscribers = Math.max(0, current.subscribers - 1);
            teardownDiscoveryPolling(key);
        };
    }, [key, user?.id, profile]);

    return { feed: state.feed, loading: state.loading, error: state.error, refresh };
};
