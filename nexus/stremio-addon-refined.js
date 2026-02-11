/**
 * NEXUS STREMIO ADDON - VERSÃO REFINADA
 * Integração completa com cache, metadados e otimizações
 */

const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const ExtendedSources = require('./extended-sources');
const NexusAdvancedSearch = require('./advanced-search');
const NodeCache = require('node-cache');
const axios = require('axios');

// Cache de resultados (TTL: 1 hora)
const streamCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });
const metaCache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 }); // 24h para metadados

// Inicializar motores de busca
let extendedSources, advancedSearch;

try {
    extendedSources = new ExtendedSources();
    advancedSearch = new NexusAdvancedSearch();
    console.log('✅ Motores de busca inicializados');
} catch (e) {
    console.error('❌ Erro ao inicializar motores:', e.message);
}

// Configuração TMDB (opcional - adicione sua API key)
const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Manifesto refinado do addon
const manifest = {
    id: 'org.nexus.deepsearch.refined',
    version: '2.1.0',
    name: 'Nexus Deep Search Pro',
    description: 'Motor de busca P2P premium com 10+ fontes, cache inteligente e metadados enriquecidos',

    logo: 'https://via.placeholder.com/256x256/1a1a2e/00d9ff?text=NEXUS',
    background: 'https://via.placeholder.com/1920x1080/0f3460/16213e?text=Nexus+Deep+Search',

    resources: ['catalog', 'stream', 'meta'],
    types: ['movie', 'series', 'anime'],
    idPrefixes: ['tt', 'kitsu'],

    catalogs: [
        {
            type: 'movie',
            id: 'nexus-movies-popular',
            name: 'Nexus Popular Movies',
            extra: [
                { name: 'search', isRequired: false },
                { name: 'skip', isRequired: false }
            ]
        },
        {
            type: 'series',
            id: 'nexus-series-popular',
            name: 'Nexus Popular Series',
            extra: [
                { name: 'search', isRequired: false },
                { name: 'skip', isRequired: false }
            ]
        },
        {
            type: 'anime',
            id: 'nexus-anime-popular',
            name: 'Nexus Popular Anime',
            extra: [
                { name: 'search', isRequired: false },
                { name: 'skip', isRequired: false }
            ]
        }
    ],

    behaviorHints: {
        adult: false,
        p2p: true,
        configurable: true,
        configurationRequired: false
    }
};

const builder = new addonBuilder(manifest);

/**
 * Handler de Streams REFINADO
 */
builder.defineStreamHandler(async (args) => {
    const { type, id } = args;
    const cacheKey = `stream:${type}:${id}`;

    console.log(`[STREMIO] 🎬 Stream request: ${type} ${id}`);

    // Verificar cache
    const cached = streamCache.get(cacheKey);
    if (cached) {
        console.log(`[STREMIO] ⚡ Cache hit: ${cacheKey}`);
        return cached;
    }

    try {
        // Obter metadados para busca mais precisa
        const metadata = await getMetadata(type, id);
        const searchQuery = metadata?.name || id;

        console.log(`[STREMIO] 🔍 Buscando: "${searchQuery}"`);

        // Determinar categoria
        const category = getCategoryFromType(type);

        // Buscar em paralelo em todas as fontes
        const [extendedResults, apiResults] = await Promise.all([
            extendedSources ? extendedSources.searchAll(searchQuery, category, 10).catch(() => []) : Promise.resolve([]),
            advancedSearch ? advancedSearch.search(searchQuery, category, 10).catch(() => []) : Promise.resolve([])
        ]);

        // Combinar e processar resultados
        const allResults = [...extendedResults, ...apiResults];
        const uniqueResults = removeDuplicates(allResults);

        // Converter para formato Stremio com metadados enriquecidos
        const streams = uniqueResults.map(result => createStreamObject(result, metadata));

        // Ordenar por qualidade (seeds, tamanho, resolução)
        const sortedStreams = sortStreamsByQuality(streams);

        // Limitar a 50 melhores streams
        const finalStreams = sortedStreams.slice(0, 50);

        console.log(`[STREMIO] ✅ Retornando ${finalStreams.length} streams`);

        const response = { streams: finalStreams };

        // Cachear resultado
        streamCache.set(cacheKey, response);

        return response;

    } catch (error) {
        console.error(`[STREMIO] ❌ Erro: ${error.message}`);
        return { streams: [] };
    }
});

/**
 * Handler de Metadados REFINADO
 */
builder.defineMetaHandler(async (args) => {
    const { type, id } = args;
    const cacheKey = `meta:${type}:${id}`;

    console.log(`[STREMIO] 📋 Meta request: ${type} ${id}`);

    // Verificar cache
    const cached = metaCache.get(cacheKey);
    if (cached) {
        console.log(`[STREMIO] ⚡ Meta cache hit: ${cacheKey}`);
        return cached;
    }

    try {
        const metadata = await getMetadata(type, id);

        if (metadata) {
            const response = { meta: metadata };
            metaCache.set(cacheKey, response);
            return response;
        }

        return { meta: null };

    } catch (error) {
        console.error(`[STREMIO] ❌ Erro ao buscar meta: ${error.message}`);
        return { meta: null };
    }
});

/**
 * Handler de Catálogo REFINADO
 */
builder.defineCatalogHandler(async (args) => {
    const { type, id, extra } = args;

    console.log(`[STREMIO] 📚 Catalog request: ${type} ${id}`);

    try {
        const metas = [];

        // Se há busca, executar busca
        if (extra && extra.search) {
            const searchQuery = extra.search;
            const category = getCategoryFromType(type);

            console.log(`[STREMIO] 🔍 Catalog search: "${searchQuery}"`);

            const results = extendedSources
                ? await extendedSources.searchAll(searchQuery, category, 20)
                : [];

            // Converter para metas
            for (const result of results) {
                const meta = await createMetaFromResult(result, type);
                if (meta) metas.push(meta);
            }
        } else {
            // Catálogo popular (via TMDB se disponível)
            if (TMDB_API_KEY) {
                const popularMetas = await getPopularFromTMDB(type, extra?.skip || 0);
                metas.push(...popularMetas);
            }
        }

        return { metas: metas.slice(0, 100) };

    } catch (error) {
        console.error(`[STREMIO] ❌ Erro no catálogo: ${error.message}`);
        return { metas: [] };
    }
});

/**
 * Obter metadados de IMDB/TMDB
 */
async function getMetadata(type, id) {
    try {
        // Se é IMDB ID (tt1234567)
        if (id.startsWith('tt') && TMDB_API_KEY) {
            const endpoint = type === 'movie' ? 'movie' : 'tv';
            const url = `${TMDB_BASE_URL}/find/${id}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;

            const response = await axios.get(url, { timeout: 5000 });
            const results = response.data.movie_results || response.data.tv_results || [];

            if (results.length > 0) {
                const item = results[0];
                return {
                    id: id,
                    type: type,
                    name: item.title || item.name,
                    poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
                    background: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : null,
                    description: item.overview,
                    releaseInfo: item.release_date || item.first_air_date,
                    imdbRating: item.vote_average,
                    genres: item.genre_ids?.map(g => getGenreName(g)) || []
                };
            }
        }

        // Fallback: retornar metadados básicos
        return {
            id: id,
            type: type,
            name: id,
            poster: getPlaceholderPoster(type),
            description: 'Conteúdo disponível via Nexus Deep Search'
        };

    } catch (error) {
        console.warn(`[STREMIO] ⚠️  Erro ao buscar metadados: ${error.message}`);
        return null;
    }
}

/**
 * Criar objeto de stream com metadados enriquecidos
 */
function createStreamObject(result, metadata) {
    const infoHash = extractInfoHash(result.magnetLink);
    const quality = detectQuality(result.title);
    const codec = detectCodec(result.title);
    const audio = detectAudio(result.title);

    // Nome formatado com emojis e informações
    let name = `🎬 Nexus - ${result.provider}`;

    if (quality) name += ` | ${quality}`;
    if (codec) name += ` | ${codec}`;
    if (result.seeds) name += ` | 👥 ${result.seeds}`;
    if (result.size) name += ` | 📦 ${result.size}`;

    const stream = {
        name: name,
        title: result.title,
        infoHash: infoHash,

        // Metadados adicionais
        behaviorHints: {
            bingeGroup: `nexus-${result.provider.toLowerCase()}`,
            notWebReady: false
        }
    };

    // Adicionar informações de qualidade
    if (quality) {
        stream.behaviorHints.videoSize = getVideoSize(quality);
        stream.behaviorHints.videoCodec = codec || 'h264';
    }

    return stream;
}

/**
 * Criar meta a partir de resultado de busca
 */
async function createMetaFromResult(result, type) {
    const infoHash = extractInfoHash(result.magnetLink);

    return {
        id: `nexus:${infoHash}`,
        type: type,
        name: result.title,
        poster: getPlaceholderPoster(type),
        description: `Provider: ${result.provider} | Seeds: ${result.seeds} | Size: ${result.size}`,
        releaseInfo: result.year || new Date().getFullYear().toString(),
        genres: [result.provider]
    };
}

/**
 * Obter conteúdo popular do TMDB
 */
async function getPopularFromTMDB(type, skip = 0) {
    if (!TMDB_API_KEY) return [];

    try {
        const endpoint = type === 'movie' ? 'movie/popular' : 'tv/popular';
        const page = Math.floor(skip / 20) + 1;

        const url = `${TMDB_BASE_URL}/${endpoint}?api_key=${TMDB_API_KEY}&page=${page}`;
        const response = await axios.get(url, { timeout: 5000 });

        return response.data.results.map(item => ({
            id: `tt${item.id}`, // Placeholder, idealmente buscar IMDB ID real
            type: type,
            name: item.title || item.name,
            poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
            background: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : null,
            description: item.overview,
            releaseInfo: item.release_date || item.first_air_date,
            imdbRating: item.vote_average
        }));

    } catch (error) {
        console.warn(`[STREMIO] ⚠️  Erro ao buscar popular: ${error.message}`);
        return [];
    }
}

/**
 * Utilitários
 */

function getCategoryFromType(type) {
    const map = {
        'movie': 'Movies',
        'series': 'TV',
        'anime': 'Anime'
    };
    return map[type] || 'All';
}

function extractInfoHash(magnetLink) {
    const match = magnetLink?.match(/btih:([a-zA-Z0-9]+)/i);
    return match ? match[1].toLowerCase() : null;
}

function removeDuplicates(results) {
    const seen = new Set();
    return results.filter(r => {
        if (!r.magnetLink) return false;
        const hash = extractInfoHash(r.magnetLink);
        if (!hash || seen.has(hash)) return false;
        seen.add(hash);
        return true;
    });
}

function detectQuality(title) {
    const qualities = ['2160p', '4K', '1080p', '720p', '480p', '360p'];
    for (const q of qualities) {
        if (title.includes(q)) return q;
    }
    return null;
}

function detectCodec(title) {
    if (title.match(/x265|HEVC|h265/i)) return 'HEVC';
    if (title.match(/x264|h264/i)) return 'H264';
    if (title.match(/AV1/i)) return 'AV1';
    return null;
}

function detectAudio(title) {
    if (title.match(/AAC/i)) return 'AAC';
    if (title.match(/AC3|DD/i)) return 'AC3';
    if (title.match(/DTS/i)) return 'DTS';
    if (title.match(/FLAC/i)) return 'FLAC';
    return null;
}

function getVideoSize(quality) {
    const sizes = {
        '2160p': 3840,
        '4K': 3840,
        '1080p': 1920,
        '720p': 1280,
        '480p': 854,
        '360p': 640
    };
    return sizes[quality] || 1920;
}

function sortStreamsByQuality(streams) {
    return streams.sort((a, b) => {
        // Extrair seeds
        const seedsA = parseInt(a.name.match(/👥 (\d+)/)?.[1] || '0');
        const seedsB = parseInt(b.name.match(/👥 (\d+)/)?.[1] || '0');

        // Extrair qualidade
        const qualityOrder = { '2160p': 5, '4K': 5, '1080p': 4, '720p': 3, '480p': 2, '360p': 1 };
        const qualityA = qualityOrder[a.name.match(/(2160p|4K|1080p|720p|480p|360p)/)?.[1]] || 0;
        const qualityB = qualityOrder[b.name.match(/(2160p|4K|1080p|720p|480p|360p)/)?.[1]] || 0;

        // Ordenar: qualidade primeiro, depois seeds
        if (qualityA !== qualityB) return qualityB - qualityA;
        return seedsB - seedsA;
    });
}

function getPlaceholderPoster(type) {
    const placeholders = {
        movie: 'https://via.placeholder.com/300x450/1a1a2e/00d9ff?text=Movie',
        series: 'https://via.placeholder.com/300x450/0f3460/00d9ff?text=Series',
        anime: 'https://via.placeholder.com/300x450/e94560/00d9ff?text=Anime'
    };
    return placeholders[type] || placeholders.movie;
}

function getGenreName(id) {
    const genres = {
        28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
        80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
        14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
        9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 10770: 'TV',
        53: 'Thriller', 10752: 'War', 37: 'Western'
    };
    return genres[id] || 'Unknown';
}

// Exportar interface
const addonInterface = builder.getInterface();

module.exports = {
    addonInterface,
    serveAddon: (port = 7000) => {
        serveHTTP(addonInterface, {
            port,
            static: '/public'
        });

        console.log('\n' + '═'.repeat(70));
        console.log('🎬 NEXUS STREMIO ADDON PRO - VERSÃO REFINADA');
        console.log('═'.repeat(70));
        console.log(`\n📡 Addon rodando em: http://localhost:${port}`);
        console.log(`🔗 URL de instalação: http://localhost:${port}/manifest.json`);
        console.log(`\n✨ Recursos Avançados:`);
        console.log(`   ✅ Cache inteligente (1h streams, 24h metadados)`);
        console.log(`   ✅ Metadados enriquecidos (TMDB/IMDB)`);
        console.log(`   ✅ Detecção de qualidade (4K, 1080p, 720p, etc)`);
        console.log(`   ✅ Detecção de codec (HEVC, H264, AV1)`);
        console.log(`   ✅ Ordenação inteligente (qualidade + seeds)`);
        console.log(`   ✅ 10+ fontes de torrents`);
        console.log(`   ✅ Limite de 50 melhores streams`);
        console.log(`\n💡 Dica: Configure TMDB_API_KEY para metadados completos`);
        console.log(`   export TMDB_API_KEY=sua_chave_aqui`);
        console.log('\n' + '═'.repeat(70) + '\n');
    }
};
