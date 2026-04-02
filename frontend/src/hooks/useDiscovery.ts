import { useCallback, useEffect, useState } from 'react';
import DiscoveryService from '@/services/api/discovery.service';
import { DiscoveryFeed } from '@/types/discovery';
import { useAuthStore } from '@/stores/auth.store';
import { useHouseholdProfileStore } from '@/stores/householdProfile.store';

export const useDiscoveryFeed = () => {
    const { user } = useAuthStore();
    const { profile } = useHouseholdProfileStore();
    const [feed, setFeed] = useState<DiscoveryFeed | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchFeed = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const data = await DiscoveryService.getFeed(user?.id, profile);
            setFeed(data);
            setError(null);
        } catch (err: any) {
            console.error(err);
            if (!silent) setError(err?.message || 'Falha ao carregar discovery feed.');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [user?.id, profile]);

    useEffect(() => {
        fetchFeed(false);
        const interval = setInterval(() => fetchFeed(true), 15000);
        return () => clearInterval(interval);
    }, [fetchFeed]);

    return { feed, loading, error, refresh: fetchFeed };
};
