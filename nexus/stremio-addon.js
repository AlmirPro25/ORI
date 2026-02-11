/**
 * NEXUS STREMIO ADDON
 * Integração completa do Nexus Deep Search com Stremio
 * Fornece streams de 10+ fontes diretamente no Stremio
 */

const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const ExtendedSources = require('./extended-sources');
const NexusAdvancedSearch = require('./advanced-search');

// Inicializar motores de busca
const extendedSources = new ExtendedSources();
const advancedSearch = new NexusAdvancedSearch();

// Manifesto do addon
const manifest = {
    id: 'org.nexus.deepsearch',
    version: '2.0.0',
    name: 'Nexus Deep Search',
    description: 'Motor de busca P2P com 10+ fontes (YTS, EZTV, Nyaa, 1337x, TPB e mais)',

    // Recursos que o addon fornece
    resources: [
        'catalog',  // Catálogos de conteúdo
        'stream'    // Streams de vídeo
    ],

    // Tipos de conteúdo suportados
    types: ['movie', 'series', 'anime'],

    // Prefixos de ID suportados (IMDB, TMDB, etc)
    idPrefixes: ['tt', 'kitsu'],

    // Catálogos disponíveis
    catalogs: [
        {
            type: 'movie',
            id: 'nexus-movies',
            name: 'Nexus Movies',
            extra: [
                { name: 'search', isRequired: false },
                { name: 'genre', isRequired: false }
            ]
        },
        {
            type: 'series',
            id: 'nexus-series',
            name: 'Nexus Series',
            extra: [
                { name: 'search', isRequired: false },
                { name: 'genre', isRequired: false }
            ]
        },
        {
            type: 'anime',
            id: 'nexus-anime',
            name: 'Nexus Anime',
            extra: [
                { name: 'search', isRequired: false }
            ]
        }
    ],

    // Configuração do addon
    behaviorHints: {
        adult: false,
        p2p: true,
        configurable: true,
        configurationRequired: false
    }
};

// Criar builder do addon
const builder = new addonBuilder(manifest);

/**
 * Handler de Streams
 * Busca streams para um conteúdo específico
 */
builder.defineStreamHandler(async (args) => {
    console.log(`[STREMIO] 🎬 Buscando streams para: ${args.type} ${args.id}`);

    try {
        const streams = [];

        // Extrair informações do ID
        const { type, id } = args;

        // Para IMDB IDs (tt1234567), buscar pelo título
        // Nota: Em produção, você faria uma busca no IMDB/TMDB para obter o título
        let searchQuery = id;

        // Se temos um nome no args (vem do catálogo)
        if (args.name) {
            searchQuery = args.name;
        }

        // Determinar categoria baseado no tipo
        let category = 'All';
        if (type === 'movie') category = 'Movies';
        if (type === 'series') category = 'TV';
        if (type === 'anime') category = 'Anime';

        // Buscar em todas as fontes
        console.log(`[STREMIO] 🔍 Buscando: "${searchQuery}" | Categoria: ${category}`);

        // 1. Buscar em fontes estendidas
        const extendedResults = await extendedSources.searchAll(searchQuery, category, 5);

        // 2. Buscar em API multi-provider
        const apiResults = await advancedSearch.search(searchQuery, category, 5);

        // Combinar resultados
        const allResults = [...extendedResults, ...apiResults];

        // Remover duplicatas
        const seen = new Set();
        const unique = allResults.filter(r => {
            if (!r.magnetLink) return false;
            const match = r.magnetLink.match(/btih:([a-zA-Z0-9]+)/i);
            if (!match) return true;
            const hash = match[1].toLowerCase();
            if (seen.has(hash)) return false;
            seen.add(hash);
            return true;
        });

        // Converter para formato Stremio
        for (const result of unique) {
            const stream = {
                name: `Nexus - ${result.provider}`,
                title: result.title,
                infoHash: extractInfoHash(result.magnetLink),
                sources: [result.magnetLink],

                // Metadados adicionais
                behaviorHints: {
                    bingeGroup: `nexus-${result.provider.toLowerCase()}`
                }
            };

            // Adicionar informações de qualidade se disponível
            if (result.seeds) {
                stream.name += ` 👥 ${result.seeds}`;
            }

            if (result.size) {
                stream.name += ` 📦 ${result.size}`;
            }

            streams.push(stream);
        }

        // Ordenar por seeds
        streams.sort((a, b) => {
            const seedsA = parseInt(a.name.match(/👥 (\d+)/)?.[1] || '0');
            const seedsB = parseInt(b.name.match(/👥 (\d+)/)?.[1] || '0');
            return seedsB - seedsA;
        });

        console.log(`[STREMIO] ✅ Retornando ${streams.length} streams`);

        return { streams };

    } catch (error) {
        console.error(`[STREMIO] ❌ Erro: ${error.message}`);
        return { streams: [] };
    }
});

/**
 * Handler de Catálogo
 * Fornece listas de conteúdo
 */
builder.defineCatalogHandler(async (args) => {
    console.log(`[STREMIO] 📚 Catálogo requisitado: ${args.type} ${args.id}`);

    try {
        const metas = [];

        // Se há uma busca, executar busca
        if (args.extra && args.extra.search) {
            const searchQuery = args.extra.search;
            console.log(`[STREMIO] 🔍 Busca no catálogo: "${searchQuery}"`);

            let category = 'All';
            if (args.type === 'movie') category = 'Movies';
            if (args.type === 'series') category = 'TV';
            if (args.type === 'anime') category = 'Anime';

            // Buscar
            const results = await extendedSources.searchAll(searchQuery, category, 10);

            // Converter para formato de meta
            for (const result of results) {
                metas.push({
                    id: `nexus:${extractInfoHash(result.magnetLink)}`,
                    type: args.type,
                    name: result.title,
                    poster: getPosterUrl(result, args.type),
                    description: `Provider: ${result.provider} | Seeds: ${result.seeds} | Size: ${result.size}`,
                    releaseInfo: result.year || new Date().getFullYear().toString()
                });
            }
        } else {
            // Catálogo padrão (popular/recente)
            // Aqui você pode implementar lógica para mostrar conteúdo popular
            console.log(`[STREMIO] 📋 Catálogo padrão (não implementado ainda)`);
        }

        return { metas };

    } catch (error) {
        console.error(`[STREMIO] ❌ Erro no catálogo: ${error.message}`);
        return { metas: [] };
    }
});

/**
 * Extrair InfoHash de um magnet link
 */
function extractInfoHash(magnetLink) {
    const match = magnetLink.match(/btih:([a-zA-Z0-9]+)/i);
    return match ? match[1].toLowerCase() : null;
}

/**
 * Obter URL de poster (placeholder por enquanto)
 */
function getPosterUrl(result, type) {
    // Em produção, você faria uma busca no TMDB/IMDB para obter o poster real
    const placeholders = {
        movie: 'https://via.placeholder.com/300x450/1a1a2e/16213e?text=Movie',
        series: 'https://via.placeholder.com/300x450/0f3460/16213e?text=Series',
        anime: 'https://via.placeholder.com/300x450/e94560/16213e?text=Anime'
    };
    return placeholders[type] || placeholders.movie;
}

// Exportar interface e servir
const addonInterface = builder.getInterface();

module.exports = {
    addonInterface,
    serveAddon: (port = 7000) => {
        serveHTTP(addonInterface, {
            port,
            static: '/public'
        });

        console.log('\n' + '═'.repeat(60));
        console.log('🎬 NEXUS STREMIO ADDON');
        console.log('═'.repeat(60));
        console.log(`\n📡 Addon rodando em: http://localhost:${port}`);
        console.log(`\n🔗 URL de instalação:`);
        console.log(`   http://localhost:${port}/manifest.json`);
        console.log(`\n📝 Para instalar no Stremio:`);
        console.log(`   1. Abra o Stremio`);
        console.log(`   2. Vá em Addons > Community Addons`);
        console.log(`   3. Cole a URL acima`);
        console.log(`\n✨ Fontes disponíveis: 10+`);
        console.log(`   - YTS (Filmes HD)`);
        console.log(`   - EZTV (Séries)`);
        console.log(`   - Nyaa.si (Anime)`);
        console.log(`   - BitSearch, 1337x, TPB e mais`);
        console.log('\n' + '═'.repeat(60) + '\n');
    }
};
