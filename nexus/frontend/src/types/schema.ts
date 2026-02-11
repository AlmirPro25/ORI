import { z } from 'zod';

export type SearchQuery = {
    id: string;
    term: string;
    category: string;
    createdAt: string;
};

export const SearchResultSchema = z.object({
    id: z.string().uuid().optional(),
    queryId: z.string().uuid().optional(),
    title: z.string().min(1),
    magnetLink: z.string().min(1).startsWith("magnet:?"),
    size: z.string().min(1),
    seeds: z.number().int().min(0),
    leechers: z.number().int().min(0),
    sourceSite: z.string().min(1),
    cachedAt: z.string().optional(),
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

export const ApiResponseSchema = z.object({
    source: z.union([z.literal('cache'), z.literal('live_network')]),
    results: z.array(SearchResultSchema),
    error: z.string().optional(),
});

export type ApiResponse = z.infer<typeof ApiResponseSchema>;

export type SearchPayload = {
    query: string;
    category?: string;
};
