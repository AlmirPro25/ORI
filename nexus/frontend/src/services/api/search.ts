import { api } from '@/lib/axios';
import { ApiResponse, SearchPayload, ApiResponseSchema } from '@/types/schema';

export const SearchService = {
    execute: async (payload: SearchPayload): Promise<ApiResponse> => {
        if (!payload.query || payload.query.trim().length < 3) {
            throw new Error("Busca muito curta.");
        }
        const { data } = await api.post('/search', payload);
        const parsed = ApiResponseSchema.safeParse(data);
        if (!parsed.success) throw new Error("Dados corrompidos.");
        return parsed.data;
    }
};
