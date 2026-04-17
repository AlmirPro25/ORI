import apiClient from '@/lib/axios';
import { DiscoveryFeed } from '@/types/discovery';
import { HouseholdProfile } from '@/stores/householdProfile.store';

class DiscoveryService {
    static async getFeed(userId?: string, profile?: HouseholdProfile): Promise<DiscoveryFeed> {
        const response = await apiClient.get<DiscoveryFeed>('/discovery/feed', {
            params: {
                ...(userId ? { userId } : {}),
                ...(profile ? { profile } : {}),
            },
        });
        return response.data;
    }
}

export default DiscoveryService;
