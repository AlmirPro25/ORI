
import axios from '@/lib/axios';

export interface Addon {
    id: string;
    manifestUrl: string;
    name: string;
    description?: string;
    icon?: string;
    version: string;
    enabled: boolean;
    userId?: string;
}

class AddonService {
    async getAddons() {
        const response = await axios.get<Addon[]>('/addons');
        return response.data;
    }

    async installAddon(url: string) {
        const response = await axios.post('/addons/install', { url });
        return response.data;
    }

    async removeAddon(id: string) {
        await axios.delete(`/addons/${id}`);
    }

    async getStreams(type: string, id: string, title?: string) {
        const response = await axios.get(`/addons/streams/${type}/${id}`, {
            params: title ? { title } : undefined,
        });
        return response.data;
    }
}

export const addonService = new AddonService();
