import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DEFAULT_TTL = 30 * 24 * 60 * 60 * 1000; // 30 dias em ms

export interface CacheEntry {
    titlePt: string;
    titleEn: string;
    originalTitle: string;
    year: string;
    mediaType: 'movie' | 'tv';
    tmdbId: number;
    posterPath?: string;
    backdropPath?: string;
    overview?: string;
    voteAverage?: number;
}

export class SemanticCacheService {
    /**
     * 🧠 Busca uma tradução/enriquecimento no cache
     */
    static async get(term: string): Promise<CacheEntry | null> {
        const cleanTerm = term.toLowerCase().trim();

        try {
            const entry = await prisma.semanticCache.findUnique({
                where: { term: cleanTerm }
            });

            if (!entry) return null;

            // Verificar expiração
            if (new Date() > entry.expiresAt) {
                console.log(`♻️ [SemanticCache] Expirado: "${cleanTerm}"`);
                return null;
            }

            console.log(`🎯 [SemanticCache] Hit: "${cleanTerm}"`);

            return {
                titlePt: entry.titlePt || '',
                titleEn: entry.titleEn || '',
                originalTitle: entry.originalTitle || '',
                year: entry.year || '',
                mediaType: (entry.mediaType as 'movie' | 'tv') || 'movie',
                tmdbId: entry.tmdbId || 0,
                posterPath: entry.posterPath || undefined,
                backdropPath: entry.backdropPath || undefined,
                overview: entry.overview || undefined,
                voteAverage: entry.voteAverage || undefined
            };
        } catch (error) {
            console.error('❌ [SemanticCache] Erro ao ler:', error);
            return null;
        }
    }

    /**
     * 💾 Salva uma tradução/enriquecimento no cache
     */
    static async set(term: string, data: CacheEntry): Promise<void> {
        const cleanTerm = term.toLowerCase().trim();
        const expiresAt = new Date(Date.now() + DEFAULT_TTL);

        try {
            await prisma.semanticCache.upsert({
                where: { term: cleanTerm },
                update: {
                    tmdbId: data.tmdbId,
                    mediaType: data.mediaType,
                    titlePt: data.titlePt,
                    titleEn: data.titleEn,
                    originalTitle: data.originalTitle,
                    year: data.year,
                    posterPath: data.posterPath,
                    backdropPath: data.backdropPath,
                    overview: data.overview,
                    voteAverage: data.voteAverage,
                    expiresAt,
                },
                create: {
                    term: cleanTerm,
                    tmdbId: data.tmdbId,
                    mediaType: data.mediaType,
                    titlePt: data.titlePt,
                    titleEn: data.titleEn,
                    originalTitle: data.originalTitle,
                    year: data.year,
                    posterPath: data.posterPath,
                    backdropPath: data.backdropPath,
                    overview: data.overview,
                    voteAverage: data.voteAverage,
                    expiresAt,
                }
            });
            console.log(`💾 [SemanticCache] Salvo: "${cleanTerm}" -> ${data.titleEn} (${expiresAt.toLocaleDateString()})`);
        } catch (error) {
            console.error('❌ [SemanticCache] Erro ao salvar:', error);
        }
    }

    /**
     * 🧹 Limpa entradas expiradas
     */
    static async cleanup(): Promise<void> {
        try {
            const result = await prisma.semanticCache.deleteMany({
                where: { expiresAt: { lt: new Date() } }
            });
            if (result.count > 0) {
                console.log(`🧹 [SemanticCache] Limpeza: ${result.count} entradas expiradas removidas.`);
            }
        } catch (error) {
            console.error('❌ [SemanticCache] Erro na limpeza:', error);
        }
    }
}
