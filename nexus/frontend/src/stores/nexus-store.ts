import { create } from 'zustand';
import { SearchResult } from '@/types/schema';
import { SearchService } from '@/services/api/search';

interface NexusState {
    query: string;
    results: SearchResult[];
    isLoading: boolean;
    error: string | null;
    sourceType: 'idle' | 'cache' | 'live_network' | null;
    executeSearch: (term: string) => Promise<void>;
    clearResults: () => void;
}

export const useNexusStore = create<NexusState>((set) => ({
    query: '',
    results: [],
    isLoading: false,
    error: null,
    sourceType: 'idle',

    executeSearch: async (term: string) => {
        const clean = term.trim();
        if (!clean) return;

        set({ isLoading: true, error: null, query: clean });
        try {
            const res = await SearchService.execute({ query: clean });
            set({ results: res.results, sourceType: res.source, isLoading: false });
        } catch (err: any) {
            set({ error: err.message, isLoading: false, results: [], sourceType: 'idle' });
        }
    },

    clearResults: () => set({ results: [], query: '', error: null, sourceType: 'idle' })
}));
