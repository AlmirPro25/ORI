/**
 * 🧠 SEARCH ORCHESTRATOR V2 — INTELIGÊNCIA SEMÂNTICA DE BUSCA
 * 
 * REGRA DE OURO:
 *   Torrent é inglês. Usuário é humano (PT-BR). TMDB é o tradutor.
 * 
 * FLUXO:
 *   Usuário (PT-BR) → TMDB (pt-BR) → Título original/EN → Busca torrent → Resultado traduzido
 * 
 * CAMADAS:
 *   1. TMDB como tradutor (busca em PT-BR, extrai EN/Original)
 *   2. Scoring inteligente (boost para PT-BR no conteúdo)
 *   3. Tradução reversa (retorna título PT + original pro usuário)
 *   4. Modo semântico automático (detecta idioma da query)
 */

import { runSearch } from '../nexus-bridge';
import { SemanticCacheService, CacheEntry } from './semantic-cache-service';
import { resilientGet } from '../utils/resilient-http';
import { classifyMediaShape, computeResultRelevance, isJunkResult } from './search-ranking';
import { SearchRankingTelemetry } from './search-ranking-telemetry';

// Configuração TMDB
const TMDB_API_KEY = process.env.TMDB_API_KEY || 'e6f987515d023363364df2298c564343';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// ==========================================
// INTERFACES
// ==========================================

interface SearchStrategy {
    term: string;
    type: 'LITERAL' | 'ORIGINAL_TITLE' | 'ENGLISH_TITLE' | 'CLEANED' | 'QUALITY_VARIANT';
    year?: string;
    priority: number; // Maior = busca primeiro
}

interface TMDBEnrichment {
    titlePt: string;         // Título em PT-BR (pra mostrar pro usuário)
    titleEn: string;         // Título em Inglês (pra buscar torrent)
    originalTitle: string;   // Título original (idioma real do conteúdo)
    year: string;
    mediaType: 'movie' | 'tv';
    tmdbId: number;
    posterPath?: string;
    backdropPath?: string;
    overview?: string;
    voteAverage?: number;
}

export interface SearchResult {
    title: string;
    magnet: string;
    seeds: number;
    peers: number;
    size: string;
    source: string;
    verified: boolean;
    // V2: Metadados de tradução
    tmdbTitlePt?: string;      // "A Origem"
    originalTitle?: string;    // "Inception"
    year?: string;
    mediaType?: string;
    posterPath?: string;
    // V2: Scoring PT-BR
    ptbrScore: number;
    hasPTBRAudio: boolean;
    hasPTBRSubs: boolean;
    relevanceScore: number;
    titleSimilarity: number;
    mediaShape?: 'media' | 'pack' | 'junk' | 'unknown';
    _strategy?: string;
}

// ==========================================
// 🎯 ORQUESTRA A BUSCA INTELIGENTE V2
// ==========================================

export async function orchestrateSearch(query: string): Promise<{
    results: SearchResult[];
    enrichment: TMDBEnrichment | null;
    searchTermsUsed: string[];
    mode: 'semantic' | 'literal';
}> {
    console.log(`🧠 [SearchOrchestrator V2] Analisando intenção: "${query}"`);

    // 1. Sanitização Inicial
    const { cleanQuery, year } = sanitizeQuery(query);

    // 2. Detectar idioma da query (Camada 4)
    const queryLanguage = detectQueryLanguage(query);
    const isSemantic = queryLanguage !== 'en'; // Se não é inglês, ativa modo semântico

    console.log(`🌐 [SearchOrchestrator V2] Idioma detectado: ${queryLanguage} | Modo: ${isSemantic ? 'SEMÂNTICO' : 'LITERAL'}`);

    // 3. TMDB como tradutor (Camada 1) + Cache Semântico (Upgrade 1)
    let enrichment: TMDBEnrichment | null = null;
    const strategies: SearchStrategy[] = [];

    try {
        // Tentar Cache primeiro
        const cached = await SemanticCacheService.get(cleanQuery);
        if (cached) {
            console.log(`🧠 [SearchOrchestrator V2] Cache Hit Semântico: "${cleanQuery}"`);
            enrichment = cached;
        } else {
            // Se não tiver em cache, busca no TMDB
            enrichment = await fetchTMDBEnrichment(cleanQuery, year);

            // Salvar no cache para as próximas vezes
            if (enrichment) {
                await SemanticCacheService.set(cleanQuery, enrichment as CacheEntry);
            }
        }
    } catch (error) {
        console.warn('⚠️ [SearchOrchestrator V2] Falha no enriquecimento semântico, seguindo com estratégia literal.');
    }

    if (enrichment) {
        console.log(`🎬 [SearchOrchestrator V2] TMDB Identificou:`);
        console.log(`   PT-BR: "${enrichment.titlePt}"`);
        console.log(`   EN:    "${enrichment.titleEn}"`);
        console.log(`   ORIG:  "${enrichment.originalTitle}"`);
        console.log(`   ANO:   ${enrichment.year}`);

        // ⚠️ REGRA DE OURO: NUNCA buscar torrent em PT-BR
        // Estratégia 1: Título em Inglês + Ano (MELHOR para torrents)
        if (enrichment.titleEn) {
            strategies.push({
                term: enrichment.year
                    ? `${enrichment.titleEn} ${enrichment.year}`
                    : enrichment.titleEn,
                type: 'ENGLISH_TITLE',
                year: enrichment.year,
                priority: 100
            });

            // Sem ano também (às vezes o ano atrapalha)
            if (enrichment.year) {
                strategies.push({
                    term: enrichment.titleEn,
                    type: 'ENGLISH_TITLE',
                    year: enrichment.year,
                    priority: 90
                });
            }
        }

        // Estratégia 2: Título Original (se diferente do EN — ex: filmes asiáticos)
        if (enrichment.originalTitle &&
            enrichment.originalTitle !== enrichment.titleEn &&
            enrichment.originalTitle !== enrichment.titlePt) {
            strategies.push({
                term: enrichment.originalTitle,
                type: 'ORIGINAL_TITLE',
                year: enrichment.year,
                priority: 80
            });
        }

        // Estratégia 3: Título EN com qualidade (para pegar resultados específicos)
        if (enrichment.titleEn) {
            strategies.push({
                term: `${enrichment.titleEn} 1080p`,
                type: 'QUALITY_VARIANT',
                year: enrichment.year,
                priority: 60
            });
        }
    } else {
        // Fallback: Sem TMDB, usar query limpa diretamente
        console.log(`⚠️ [SearchOrchestrator V2] Sem TMDB, usando query literal: "${cleanQuery}"`);
    }

    // Sempre adicionar query original como fallback (com baixa prioridade)
    strategies.push({
        term: year ? `${cleanQuery} ${year}` : cleanQuery,
        type: 'LITERAL',
        year,
        priority: 40
    });

    // Se a query original é diferente da limpa, adicionar também
    if (query.trim().toLowerCase() !== cleanQuery.toLowerCase()) {
        strategies.push({
            term: query.trim(),
            type: 'LITERAL',
            priority: 20
        });
    }

    // Deduplicar estratégias (mesmo termo)
    const uniqueStrategies = deduplicateStrategies(strategies);

    // Ordenar por prioridade (maior primeiro)
    uniqueStrategies.sort((a, b) => b.priority - a.priority);

    // 4. Execução Tática (Top 4 estratégias, paralelo)
    const topStrategies = uniqueStrategies.slice(0, 4);
    const searchTermsUsed = topStrategies.map(s => s.term);

    console.log(`🚀 [SearchOrchestrator V2] Executando ${topStrategies.length} estratégias:`);
    topStrategies.forEach((s, i) => {
        console.log(`   ${i + 1}. [${s.type}] "${s.term}" (P:${s.priority})`);
    });

    const promiseResults = topStrategies.map(async (strat) => {
        try {
            const results = await runSearch(strat.term);
            return results.map((r: any) => ({ ...r, _strategy: strat.type }));
        } catch (e) {
            console.error(`❌ [SearchStrategy] Falha em "${strat.term}":`, e);
            return [];
        }
    });

    const rawResults = (await Promise.all(promiseResults)).flat();

    // 5. Deduplicação, Scoring PT-BR (Camada 2) e Tradução Reversa (Camada 3)
    const scoredResults = await scoreAndEnrich(rawResults, enrichment, cleanQuery);

    console.log(`✅ [SearchOrchestrator V2] ${scoredResults.length} resultados únicos (de ${rawResults.length} brutos)`);

    const ptbrCount = scoredResults.filter(r => r.hasPTBRAudio || r.hasPTBRSubs).length;
    if (ptbrCount > 0) {
        console.log(`🇧🇷 [SearchOrchestrator V2] ${ptbrCount} resultados com conteúdo PT-BR detectado!`);
    }

    return {
        results: scoredResults,
        enrichment,
        searchTermsUsed,
        mode: isSemantic ? 'semantic' : 'literal'
    };
}

// ==========================================
// 🌐 DETECÇÃO DE IDIOMA DA QUERY (Camada 4)
// ==========================================

function detectQueryLanguage(query: string): 'pt' | 'en' | 'other' {
    const lower = query.toLowerCase().trim();

    // Palavras/padrões comuns em PT-BR
    const ptbrIndicators = [
        // Artigos e preposições PT
        /\b(o |a |os |as |um |uma |de |do |da |dos |das |no |na |nos |nas |em |ao |à |com |por |para )\b/,
        // Palavras comuns em títulos traduzidos
        /\b(velozes|furiosos|vingadores|guerra|estrelas|senhor|anéis|origem|homem|aranha|ferro|poderoso|chefão|padrinho)\b/,
        // Acentuação típica do PT
        /[áàâãéèêíìîóòôõúùûç]/,
        // Palavras comuns em buscas PT-BR
        /\b(filme|serie|temporada|episodio|dublado|legendado|completo|assistir)\b/,
    ];

    for (const pattern of ptbrIndicators) {
        if (pattern.test(lower)) {
            return 'pt';
        }
    }

    // Se tem caracteres CJK, cirílico, etc
    if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u0400-\u04FF\uAC00-\uD7AF]/.test(query)) {
        return 'other';
    }

    // Default: assume inglês
    return 'en';
}

// ==========================================
// 🧹 LIMPA A QUERY
// ==========================================

function sanitizeQuery(query: string): { cleanQuery: string, year?: string } {
    // Extrair ano (4 dígitos entre 1900-2030)
    const yearMatch = query.match(/\b(19|20)\d{2}\b/);
    let year = yearMatch ? yearMatch[0] : undefined;

    // Se ano for futuro distante (> ano atual + 1), ignorar
    const currentYear = new Date().getFullYear();
    if (year && parseInt(year) > currentYear + 1) {
        year = undefined;
    }

    // Remover ano da string para limpar
    let clean = query.replace(/\b(19|20)\d{2}\b/, '').trim();

    // Remover qualidades comuns
    clean = clean.replace(/\b(1080p|720p|4k|2160p|hd|cam|ts|bluray|webrip|hdcam|brrip)\b/gi, '');

    // Remover "dublado", "legendado" etc (ajuda na busca, não no torrent)
    clean = clean.replace(/\b(dublado|legendado|dual|audio|pt-br|ptbr|pt|br|completo)\b/gi, '');

    // Remover caracteres especiais (mantém acentos para TMDB)
    clean = clean.replace(/[^\w\s\u00C0-\u00FF\u3040-\u9FFF\uAC00-\uD7AF]/g, ' ');

    // Remover espaços extras
    clean = clean.replace(/\s+/g, ' ').trim();

    return { cleanQuery: clean, year };
}

// ==========================================
// 🧠 BUSCA METADADOS NO TMDB (COM TRADUÇÃO)
// ==========================================

async function fetchTMDBEnrichment(query: string, year?: string): Promise<TMDBEnrichment | null> {
    try {
        // Passo 1: Buscar em PT-BR (pro match do que o usuário digitou)
        const url = `${TMDB_BASE_URL}/search/multi`;
        const params: any = {
            api_key: TMDB_API_KEY,
            query: query,
            include_adult: true,
            language: 'pt-BR'
        };
        if (year) params.year = year;

        const resPt = await resilientGet(url, {
            params,
            timeoutMs: 5000,
            serviceName: 'tmdb',
        });

        if (!resPt.data.results || resPt.data.results.length === 0) {
            return null;
        }

        // Prioriza Movie ou TV
        const bestMatch = resPt.data.results.find((i: any) =>
            i.media_type === 'movie' || i.media_type === 'tv'
        ) || resPt.data.results[0];

        const isTV = bestMatch.media_type === 'tv';
        const titlePt = isTV ? (bestMatch.name || bestMatch.title) : bestMatch.title;
        const originalTitle = isTV
            ? (bestMatch.original_name || bestMatch.original_title)
            : (bestMatch.original_title || bestMatch.title);
        const releaseYear = (bestMatch.release_date || bestMatch.first_air_date || '').split('-')[0];

        // Passo 2: Buscar o título em INGLÊS (para torrents)
        // Fazemos uma segunda chamada com language=en-US para pegar o título em inglês
        let titleEn = originalTitle; // Fallback para o original

        try {
            const typeForApi = isTV ? 'tv' : 'movie';
            const detailRes = await resilientGet(`${TMDB_BASE_URL}/${typeForApi}/${bestMatch.id}`, {
                params: { api_key: TMDB_API_KEY, language: 'en-US' },
                timeoutMs: 5000,
                serviceName: 'tmdb',
            });

            titleEn = isTV
                ? (detailRes.data.name || detailRes.data.original_name || originalTitle)
                : (detailRes.data.title || detailRes.data.original_title || originalTitle);
        } catch {
            // Se falhar, usa o original_title como fallback  
            console.warn('⚠️ [TMDB] Falha ao buscar título EN, usando original_title como fallback');
        }

        return {
            titlePt,
            titleEn,
            originalTitle,
            year: releaseYear,
            mediaType: isTV ? 'tv' : 'movie',
            tmdbId: bestMatch.id,
            posterPath: bestMatch.poster_path
                ? `https://image.tmdb.org/t/p/w500${bestMatch.poster_path}`
                : undefined,
            backdropPath: bestMatch.backdrop_path
                ? `https://image.tmdb.org/t/p/w1280${bestMatch.backdrop_path}`
                : undefined,
            overview: bestMatch.overview,
            voteAverage: bestMatch.vote_average
        };
    } catch (error) {
        console.error('❌ [TMDB Enrichment] Erro:', error);
        return null;
    }
}

// ==========================================
// 🏆 SCORING + ENRIQUECIMENTO (Camadas 2 & 3)
// ==========================================

async function scoreAndEnrich(results: any[], enrichment: TMDBEnrichment | null, cleanQuery: string): Promise<SearchResult[]> {
    const seen = new Set<string>();
    const unique: SearchResult[] = [];

    const getHash = (magnet: string) => {
        const match = magnet.match(/xt=urn:btih:([a-zA-Z0-9]+)/);
        return match ? match[1].toLowerCase() : magnet;
    };

    for (const item of results) {
        if (!item.magnet && !item.magnetLink) continue;
        const magnet = item.magnet || item.magnetLink;
        const title = String(item.title || '');
        const mediaShape = classifyMediaShape(title);
        if (isJunkResult(title) || mediaShape === 'junk') {
            SearchRankingTelemetry.recordDiscard({
                query: cleanQuery,
                title,
                reason: 'junk-content',
                seeds: item.seeds || 0,
                peers: item.peers || 0,
                source: item.source || item.sourceSite || item.provider || 'Unknown',
            });
            continue;
        }

        const hash = getHash(magnet);
        if (seen.has(hash)) {
            SearchRankingTelemetry.recordDiscard({
                query: cleanQuery,
                title,
                reason: 'duplicate-hash',
                seeds: item.seeds || 0,
                peers: item.peers || 0,
                source: item.source || item.sourceSite || item.provider || 'Unknown',
            });
            continue;
        }
        seen.add(hash);
        const sourceName = item.source || item.sourceSite || item.provider || 'Unknown';
        const adaptivePolicy = await SearchRankingTelemetry.getAdaptivePolicyForSource(sourceName);

        const titleLower = title.toLowerCase();
        const hasPTBRAudio = /\b(dublado|dual[._-]?audio|pt[._-]?br|portuguese|brazil)\b/i.test(titleLower);
        const hasPTBRSubs = /\b(legendado|leg[._-]?pt|sub[._-]?pt|portuguese[._-]?sub)\b/i.test(titleLower);

        if ((item.seeds || 0) < adaptivePolicy.minSeeds && !hasPTBRAudio && !hasPTBRSubs) {
            SearchRankingTelemetry.recordDiscard({
                query: cleanQuery,
                title,
                reason: 'low-seeders',
                seeds: item.seeds || 0,
                peers: item.peers || 0,
                source: sourceName,
            });
            continue;
        }

        const relevance = computeResultRelevance({
            query: enrichment?.titleEn || enrichment?.originalTitle || cleanQuery,
            resultTitle: title,
            seeds: item.seeds || 0,
            peers: item.peers || 0,
            hasPTBRAudio,
            hasPTBRSubs,
        });

        if (relevance.titleSimilarity < adaptivePolicy.minTitleSimilarity && relevance.tokenMatch < 2) {
            SearchRankingTelemetry.recordDiscard({
                query: cleanQuery,
                title,
                reason: 'low-title-match',
                relevanceScore: relevance.score,
                titleSimilarity: Number(relevance.titleSimilarity.toFixed(3)),
                seeds: item.seeds || 0,
                peers: item.peers || 0,
                source: sourceName,
            });
            continue;
        }

        let ptbrScore = 0;
        if (hasPTBRAudio) ptbrScore += 150;
        if (hasPTBRSubs) ptbrScore += 80;

        const seedScore = Math.min((item.seeds || 0) * 2, 200);
        const packBoost = mediaShape === 'pack' ? 18 : 0;
        const totalScore = ptbrScore + seedScore + relevance.score + packBoost;

        const result: SearchResult = {
            title,
            magnet,
            seeds: item.seeds || 0,
            peers: item.peers || 0,
            size: item.size || 'N/A',
            source: sourceName,
            verified: item.verified || false,
            tmdbTitlePt: enrichment?.titlePt,
            originalTitle: enrichment?.originalTitle,
            year: enrichment?.year || item.year,
            mediaType: enrichment?.mediaType,
            posterPath: enrichment?.posterPath,
            ptbrScore,
            hasPTBRAudio,
            hasPTBRSubs,
            relevanceScore: totalScore,
            titleSimilarity: Number(relevance.titleSimilarity.toFixed(3)),
            mediaShape,
            _strategy: item._strategy
        };

        SearchRankingTelemetry.recordKeep({
            query: cleanQuery,
            title,
            reason: mediaShape === 'pack' ? 'kept-pack' : hasPTBRAudio ? 'kept-ptbr-audio' : hasPTBRSubs ? 'kept-ptbr-subs' : 'kept-relevant',
            relevanceScore: totalScore,
            titleSimilarity: Number(relevance.titleSimilarity.toFixed(3)),
            seeds: item.seeds || 0,
            peers: item.peers || 0,
            source: sourceName,
        });

        unique.push(result);
    }

    return unique.sort((a, b) => {
        const relevanceDiff = b.relevanceScore - a.relevanceScore;
        if (relevanceDiff !== 0) return relevanceDiff;

        const ptDiff = b.ptbrScore - a.ptbrScore;
        if (ptDiff !== 0) return ptDiff;

        return b.seeds - a.seeds;
    });
}

// ==========================================
// 🔧 HELPERS
// ==========================================

function deduplicateStrategies(strategies: SearchStrategy[]): SearchStrategy[] {
    const seen = new Set<string>();
    return strategies.filter(s => {
        const key = s.term.toLowerCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// ==========================================
// EXPORT LEGACY (Compatibilidade)
// ==========================================

/**
 * @deprecated Use orchestrateSearch() diretamente para ter acesso ao enrichment
 * Esta função mantém compatibilidade com chamadas antigas
 */
export async function orchestrateSearchLegacy(query: string): Promise<SearchResult[]> {
    const { results } = await orchestrateSearch(query);
    return results;
}
