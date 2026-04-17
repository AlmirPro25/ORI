/**
 * NEXUS ADVANCED SEARCH ENGINE
 * Motor de busca avançado com múltiplos providers
 * Usa torrent-search-api para maior cobertura
 */

const TorrentSearchApi = require('torrent-search-api');
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.colorize(),
        winston.format.simple()
    ),
    transports: [new winston.transports.Console()]
});

class NexusAdvancedSearch {
    constructor() {
        // TorrentSearchApi já é uma instância, não precisa de new
        this.api = TorrentSearchApi;
        this.setupProviders();
    }

    setupProviders() {
        // Lista de providers disponíveis e confiáveis
        const providers = [
            '1337x',
            'ThePirateBay',
            'Yts',
            'TorrentGalaxy',
            'Torlock',
            'TorrentProject',
            'Eztv',
            'Rarbg'
        ];

        // Habilitar todos os providers disponíveis
        providers.forEach(provider => {
            try {
                this.api.enableProvider(provider);
                logger.info(`✅ Provider habilitado: ${provider}`);
            } catch (e) {
                logger.warn(`⚠️  Provider não disponível: ${provider}`);
            }
        });

        // Listar providers ativos
        const active = this.api.getActiveProviders();
        logger.info(`🌐 Total de providers ativos: ${active.length}`);
        logger.info(`📋 Providers: ${active.join(', ')}`);
    }

    /**
     * Busca avançada com múltiplos providers
     * @param {string} query - Termo de busca
     * @param {string} category - Categoria (Movies, TV, All)
     * @param {number} limit - Limite de resultados por provider
     * @returns {Promise<Array>} - Lista de torrents
     */
    async search(query, category = 'Movies', limit = 5) {
        logger.info(`🔍 Buscando: "${query}" | Categoria: ${category} | Limite: ${limit}/provider`);

        try {
            // Buscar em todos os providers ativos
            const results = await this.api.search(query, category, limit);

            logger.info(`ðŸ“¦ Encontrados ${results.length} resultados brutos`);

            // Processar e enriquecer resultados
            const processed = await this.processResults(results);

            // Ordenar por seeds (mais seeders primeiro)
            const sorted = processed.sort((a, b) => b.seeds - a.seeds);
            const providerCounts = {};
            sorted.forEach((item) => {
                const provider = item.provider || 'Unknown';
                providerCounts[provider] = (providerCounts[provider] || 0) + 1;
            });
            const diagnostics = this.api.getActiveProviders().map((provider) => {
                const providerName = typeof provider === 'string'
                    ? provider
                    : (provider?.name || provider?.publicName || provider?.constructor?.name || 'Unknown');
                return {
                provider: providerName,
                status: providerCounts[providerName] > 0 ? 'ok' : 'empty',
                count: providerCounts[providerName] || 0,
                error: providerCounts[providerName] > 0 ? null : 'Vazio neste provider.'
                };
            });

            logger.info(`âœ… Retornando ${sorted.length} resultados processados`);
            logger.info(`[AdvancedSearch] Providers: ${diagnostics.map(d => `${d.provider}:${d.status}${d.count ? `(${d.count})` : ''}`).join(' | ')}`);
            Object.defineProperty(sorted, '_diagnostics', {
                value: diagnostics,
                enumerable: false,
                configurable: true,
            });
            return sorted;

        } catch (error) {
            logger.error(`❌ Erro na busca: ${error.message}`);
            return [];
        }
    }

    /**
     * Processa e padroniza resultados
     */
    async processResults(results) {
        const processed = [];

        for (const result of results) {
            try {
                // Obter magnet link se não estiver presente
                let magnetLink = result.magnet;

                if (!magnetLink && result.desc) {
                    // Tentar obter magnet do provider
                    try {
                        const torrentDetails = await this.api.getTorrentDetails(result);
                        magnetLink = torrentDetails.magnet || torrentDetails.magnetLink;
                    } catch (e) {
                        logger.warn(`⚠️  Não foi possível obter magnet para: ${result.title}`);
                        continue;
                    }
                }

                if (!magnetLink) {
                    logger.warn(`⚠️  Sem magnet link: ${result.title}`);
                    continue;
                }

                // Padronizar formato
                const processed_result = {
                    title: result.title,
                    magnetLink: magnetLink,
                    size: result.size || 'N/A',
                    seeds: this.parseSeeds(result.seeds),
                    peers: this.parseSeeds(result.peers),
                    provider: result.provider || 'Unknown',
                    time: result.time || null,
                    desc: result.desc || null
                };

                processed.push(processed_result);

            } catch (e) {
                logger.warn(`⚠️  Erro ao processar resultado: ${e.message}`);
            }
        }

        return processed;
    }

    /**
     * Parse seeds/peers para número
     */
    parseSeeds(value) {
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
            const num = parseInt(value.replace(/,/g, ''));
            return isNaN(num) ? 0 : num;
        }
        return 0;
    }

    /**
     * Busca específica por provider
     */
    async searchProvider(query, providerName, category = 'Movies', limit = 10) {
        logger.info(`🎯 Busca específica em ${providerName}: "${query}"`);

        try {
            // Desabilitar todos exceto o escolhido
            const allProviders = this.api.getProviders();
            allProviders.forEach(p => this.api.disableProvider(p.name));
            this.api.enableProvider(providerName);

            const results = await this.search(query, category, limit);

            // Reabilitar todos
            this.setupProviders();

            return results;

        } catch (error) {
            logger.error(`❌ Erro na busca em ${providerName}: ${error.message}`);
            this.setupProviders(); // Restaurar providers
            return [];
        }
    }

    /**
     * Busca paralela em múltiplos providers
     */
    async parallelSearch(query, category = 'Movies', limit = 3) {
        logger.info(`⚡ Busca paralela: "${query}"`);

        const activeProviders = this.api.getActiveProviders();
        const searches = activeProviders.map(provider =>
            this.searchProvider(query, provider, category, limit)
        );

        try {
            const results = await Promise.all(searches);
            const combined = results.flat();

            // Remover duplicatas baseado no magnet link
            const unique = this.removeDuplicates(combined);

            // Ordenar por seeds
            const sorted = unique.sort((a, b) => b.seeds - a.seeds);

            logger.info(`✅ Busca paralela concluída: ${sorted.length} resultados únicos`);
            return sorted;

        } catch (error) {
            logger.error(`❌ Erro na busca paralela: ${error.message}`);
            return [];
        }
    }

    /**
     * Remove duplicatas baseado no magnet link
     */
    removeDuplicates(results) {
        const seen = new Set();
        return results.filter(r => {
            // Extrair hash do magnet link
            const match = r.magnetLink.match(/btih:([a-zA-Z0-9]+)/);
            if (!match) return true;

            const hash = match[1].toLowerCase();
            if (seen.has(hash)) return false;

            seen.add(hash);
            return true;
        });
    }

    /**
     * Listar providers disponíveis
     */
    listProviders() {
        const all = this.api.getProviders();
        const active = this.api.getActiveProviders();

        return {
            all: all.map(p => p.name),
            active: active,
            total: all.length,
            activeCount: active.length
        };
    }
}

module.exports = NexusAdvancedSearch;
