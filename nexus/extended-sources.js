/**
 * NEXUS EXTENDED SOURCES V2
 * ========================
 * Implementação REAL de 8+ fontes de torrent
 * Cada fonte tem scraping/API funcional com fallback
 * 
 * FONTES ATIVAS:
 * 1. YTS (API oficial - Filmes em alta qualidade)
 * 2. EZTV (Scraping - Séries/TV) 
 * 3. Nyaa.si (Scraping - Anime)
 * 4. BitSearch (Scraping - Geral)
 * 5. LimeTorrents (Scraping - Geral, enorme catálogo)
 * 6. TorrentDownloads (Scraping - Geral)
 * 7. SolidTorrents (API - Geral, alta qualidade)
 * 8. GloTorrents (Scraping - Geral, bom para PT-BR)
 */

const axios = require('axios');
const cheerio = require('cheerio');
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

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

class ExtendedSources {
    constructor() {
        this.timeout = 15000;
        this.sources = this.initializeSources();
        logger.info(`🌐 [ExtendedSources V2] Inicializado com ${Object.keys(this.sources).length} fontes`);
    }

    getRandomUA() {
        return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    }

    getHeaders() {
        return {
            'User-Agent': this.getRandomUA(),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive'
        };
    }

    initializeSources() {
        return {
            yts: { name: 'YTS', category: 'Movies', quality: 'high', active: true },
            eztv: { name: 'EZTV', category: 'TV', quality: 'high', active: true },
            nyaasi: { name: 'Nyaa.si', category: 'Anime', quality: 'high', active: true },
            bitsearch: { name: 'BitSearch', category: 'All', quality: 'medium', active: true },
            limetorrents: { name: 'LimeTorrents', category: 'All', quality: 'medium', active: true },
            torrentdownloads: { name: 'TorrentDownloads', category: 'All', quality: 'medium', active: true },
            solidtorrents: { name: 'SolidTorrents', category: 'All', quality: 'high', active: true },
            glotorrents: { name: 'GloTorrents', category: 'All', quality: 'medium', active: true }
        };
    }

    // === YTS (Múltiplos mirrors) ===
    async searchYTS(query, limit = 10) {
        try {
            logger.info(`🎬 [YTS] Buscando: "${query}"`);
            const mirrors = [
                'https://yts.mx/api/v2/list_movies.json',
                'https://yts.rs/api/v2/list_movies.json',
                'https://yts.do/api/v2/list_movies.json',
                'https://yts.am/api/v2/list_movies.json'
            ];
            let response = null;
            for (const mirror of mirrors) {
                try {
                    response = await axios.get(mirror, {
                        params: { query_term: query, limit, sort_by: 'seeds', order_by: 'desc' },
                        timeout: 8000
                    });
                    if (response.data?.data?.movies) break;
                } catch { continue; }
            }
            if (!response?.data?.data?.movies) return [];

            const results = [];
            for (const movie of response.data.data.movies) {
                if (!movie.torrents) continue;
                for (const torrent of movie.torrents) {
                    results.push({
                        title: `${movie.title} (${movie.year}) [${torrent.quality}]`,
                        magnetLink: this.createMagnetLink(torrent.hash, `${movie.title} ${movie.year}`),
                        size: torrent.size,
                        seeds: torrent.seeds || 0,
                        peers: torrent.peers || 0,
                        provider: 'YTS',
                        sourceSite: 'YTS',
                        quality: torrent.quality,
                        year: movie.year
                    });
                }
            }
            logger.info(`✅ [YTS] ${results.length} resultados`);
            return results;
        } catch (error) {
            logger.warn(`⚠️ [YTS] Falhou: ${error.message}`);
            return [];
        }
    }

    // === EZTV (Scraping) ===
    async searchEZTV(query, limit = 15) {
        try {
            logger.info(`📺 [EZTV] Buscando: "${query}"`);
            const searchUrl = `https://eztv.re/search/${encodeURIComponent(query)}`;
            const response = await axios.get(searchUrl, {
                timeout: this.timeout,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const results = [];
            $('tr.forum_header_border').slice(0, limit).each((i, elem) => {
                const $row = $(elem);
                const title = $row.find('td:nth-child(2) a').text().trim();
                const magnetLink = $row.find('a[href^="magnet:"]').attr('href');
                const size = $row.find('td:nth-child(4)').text().trim();
                const seeds = parseInt($row.find('td:nth-child(6)').text()) || 0;
                if (title && magnetLink) {
                    results.push({ title, magnetLink, size, seeds, peers: 0, provider: 'EZTV', sourceSite: 'EZTV' });
                }
            });
            logger.info(`✅ [EZTV] ${results.length} resultados`);
            return results;
        } catch (error) {
            logger.warn(`⚠️ [EZTV] Falhou: ${error.message}`);
            return [];
        }
    }

    // === Nyaa.si (Scraping - Anime) ===
    async searchNyaa(query, limit = 10) {
        try {
            logger.info(`🎌 [Nyaa] Buscando: "${query}"`);
            const response = await axios.get('https://nyaa.si', {
                params: { f: 0, c: '0_0', q: query, s: 'seeders', o: 'desc' },
                timeout: this.timeout,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const results = [];
            $('tbody tr').slice(0, limit).each((i, elem) => {
                const $row = $(elem);
                const title = $row.find('td:nth-child(2) a:not(.comments)').last().text().trim();
                const magnetLink = $row.find('a[href^="magnet:"]').attr('href');
                const size = $row.find('td:nth-child(4)').text().trim();
                const seeds = parseInt($row.find('td:nth-child(6)').text()) || 0;
                const peers = parseInt($row.find('td:nth-child(7)').text()) || 0;
                if (title && magnetLink) {
                    results.push({ title, magnetLink, size, seeds, peers, provider: 'Nyaa.si', sourceSite: 'Nyaa.si' });
                }
            });
            logger.info(`✅ [Nyaa] ${results.length} resultados`);
            return results;
        } catch (error) {
            logger.warn(`⚠️ [Nyaa] Falhou: ${error.message}`);
            return [];
        }
    }

    // === BitSearch (Scraping com mirrors) ===
    async searchBitSearch(query, limit = 15) {
        try {
            logger.info(`🔍 [BitSearch] Buscando: "${query}"`);
            const urls = ['https://bitsearch.to/search', 'https://bitsearch.info/search'];
            let response = null;
            for (const url of urls) {
                try {
                    response = await axios.get(url, {
                        params: { q: query, sort: 'seeders', order: 'desc' },
                        timeout: this.timeout,
                        headers: this.getHeaders()
                    });
                    if (response.data) break;
                } catch { continue; }
            }
            if (!response?.data) return [];

            const $ = cheerio.load(response.data);
            const results = [];
            const selectors = ['.search-result', '.card.search-result', 'li.search-result'];
            let items = $([]);
            for (const sel of selectors) {
                items = $(sel);
                if (items.length > 0) break;
            }
            items.slice(0, limit).each((i, elem) => {
                const $item = $(elem);
                const title = $item.find('h5 a, .title a, a.result').first().text().trim();
                const magnetLink = $item.find('a[href^="magnet:"]').attr('href');
                const size = $item.find('.stats .size, .info .size').first().text().trim();
                const seedsText = $item.find('.stats .seeders, .seeders').first().text().trim();
                const seeds = parseInt(seedsText.replace(/[^0-9]/g, '')) || 0;
                if (title && magnetLink) {
                    results.push({ title, magnetLink, size, seeds, peers: 0, provider: 'BitSearch', sourceSite: 'BitSearch' });
                }
            });
            logger.info(`✅ [BitSearch] ${results.length} resultados`);
            return results;
        } catch (error) {
            logger.warn(`⚠️ [BitSearch] Falhou: ${error.message}`);
            return [];
        }
    }

    // === LimeTorrents (Scraping - Enorme catálogo) ===
    async searchLimeTorrents(query, limit = 15) {
        try {
            logger.info(`🍋 [LimeTorrents] Buscando: "${query}"`);
            const urls = [
                `https://www.limetorrents.lol/search/all/${encodeURIComponent(query)}/seeds/1/`,
                `https://www.limetorrents.pro/search/all/${encodeURIComponent(query)}/seeds/1/`,
                `https://www.limetorrents.info/search/all/${encodeURIComponent(query)}/seeds/1/`
            ];
            let response = null;
            for (const url of urls) {
                try {
                    response = await axios.get(url, { timeout: this.timeout, headers: this.getHeaders() });
                    if (response.data) break;
                } catch { continue; }
            }
            if (!response?.data) return [];

            const $ = cheerio.load(response.data);
            const results = [];
            $('table.table2 tr').slice(1, limit + 1).each((i, elem) => {
                const $row = $(elem);
                const linkEl = $row.find('td.tdleft div.tt-name a').last();
                const title = linkEl.text().trim();
                const detailHref = linkEl.attr('href') || '';
                const size = $row.find('td.tdnormal:nth-child(3)').text().trim();
                const seeds = parseInt($row.find('td.tdseed').text().replace(/[^0-9]/g, '')) || 0;
                const peers = parseInt($row.find('td.tdleech').text().replace(/[^0-9]/g, '')) || 0;
                const hashMatch = detailHref.match(/([A-Fa-f0-9]{40})/);
                if (title && hashMatch) {
                    results.push({
                        title, magnetLink: this.createMagnetLink(hashMatch[1], title),
                        size, seeds, peers, provider: 'LimeTorrents', sourceSite: 'LimeTorrents'
                    });
                }
            });
            logger.info(`✅ [LimeTorrents] ${results.length} resultados`);
            return results;
        } catch (error) {
            logger.warn(`⚠️ [LimeTorrents] Falhou: ${error.message}`);
            return [];
        }
    }

    // === TorrentDownloads (Scraping) ===
    async searchTorrentDownloads(query, limit = 15) {
        try {
            logger.info(`📥 [TorrentDownloads] Buscando: "${query}"`);
            const response = await axios.get('https://www.torrentdownloads.pro/search', {
                params: { search: query },
                timeout: this.timeout,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const results = [];
            $('div.grey_bar3, div.grey_bar1').slice(0, limit).each((i, elem) => {
                const $row = $(elem);
                const linkEl = $row.find('a').first();
                const linkText = $row.find('a p').text().trim() || linkEl.text().trim();
                const link = linkEl.attr('href') || '';
                const spans = $row.find('span');
                const seeds = parseInt($(spans[2]).text()) || 0;
                const peers = parseInt($(spans[3]).text()) || 0;
                const size = $(spans[1]).text().trim();
                const hashMatch = link.match(/\/([a-fA-F0-9]{40})\//);
                if (linkText && hashMatch) {
                    results.push({
                        title: linkText, magnetLink: this.createMagnetLink(hashMatch[1], linkText),
                        size, seeds, peers, provider: 'TorrentDownloads', sourceSite: 'TorrentDownloads'
                    });
                }
            });
            logger.info(`✅ [TorrentDownloads] ${results.length} resultados`);
            return results;
        } catch (error) {
            logger.warn(`⚠️ [TorrentDownloads] Falhou: ${error.message}`);
            return [];
        }
    }

    // === SolidTorrents (API JSON) ===
    async searchSolidTorrents(query, limit = 15) {
        try {
            logger.info(`💎 [SolidTorrents] Buscando: "${query}"`);
            const response = await axios.get('https://solidtorrents.to/api/v1/search', {
                params: { q: query, sort: 'seeders', category: 'all', fuv: 'yes' },
                timeout: this.timeout,
                headers: this.getHeaders()
            });
            if (!response.data?.results) return [];
            const results = response.data.results.slice(0, limit).map(item => ({
                title: item.title,
                magnetLink: item.magnet || this.createMagnetLink(item.infohash, item.title),
                size: this.formatBytes(item.size || 0),
                seeds: item.swarm?.seeders || 0,
                peers: item.swarm?.leechers || 0,
                provider: 'SolidTorrents',
                sourceSite: 'SolidTorrents'
            })).filter(r => r.magnetLink);
            logger.info(`✅ [SolidTorrents] ${results.length} resultados`);
            return results;
        } catch (error) {
            logger.warn(`⚠️ [SolidTorrents] Falhou: ${error.message}`);
            return [];
        }
    }

    // === GloTorrents (Scraping) ===
    async searchGloTorrents(query, limit = 15) {
        try {
            logger.info(`🌍 [GloTorrents] Buscando: "${query}"`);
            const response = await axios.get('https://glodls.to/search_results.php', {
                params: { search: query, cat: 0, incldead: 0, inclexternal: 0, lang: 0, sort: 'seeders', order: 'desc' },
                timeout: this.timeout,
                headers: this.getHeaders()
            });
            const $ = cheerio.load(response.data);
            const results = [];
            $('table tr').slice(1, limit + 1).each((i, elem) => {
                const $row = $(elem);
                const title = $row.find('td:nth-child(2) a b').text().trim() || $row.find('td:nth-child(2) a').first().text().trim();
                const magnetLink = $row.find('a[href^="magnet:"]').attr('href');
                const size = $row.find('td:nth-child(5)').text().trim();
                const seeds = parseInt($row.find('td:nth-child(7)').text()) || 0;
                const peers = parseInt($row.find('td:nth-child(8)').text()) || 0;
                if (title && magnetLink) {
                    results.push({ title, magnetLink, size, seeds, peers, provider: 'GloTorrents', sourceSite: 'GloTorrents' });
                }
            });
            logger.info(`✅ [GloTorrents] ${results.length} resultados`);
            return results;
        } catch (error) {
            logger.warn(`⚠️ [GloTorrents] Falhou: ${error.message}`);
            return [];
        }
    }

    // === BUSCA EM TODAS AS FONTES (Paralelo com Promise.allSettled) ===
    async searchAll(query, category = 'All', limit = 8) {
        logger.info(`⚡ [ExtendedSources] Busca completa: "${query}" | Cat: ${category} | Limit: ${limit}/fonte`);

        const searches = [
            this.searchBitSearch(query, limit),
            this.searchSolidTorrents(query, limit),
            this.searchLimeTorrents(query, limit),
            this.searchGloTorrents(query, limit),
            this.searchTorrentDownloads(query, limit)
        ];

        if (category === 'Movies' || category === 'All') {
            searches.push(this.searchYTS(query, limit));
        }
        if (category === 'TV' || category === 'All') {
            searches.push(this.searchEZTV(query, limit));
        }
        if (category === 'Anime' || category === 'All') {
            searches.push(this.searchNyaa(query, limit));
        }

        try {
            const results = await Promise.allSettled(searches);
            const combined = results
                .filter(r => r.status === 'fulfilled')
                .flatMap(r => r.value || []);

            const unique = this.removeDuplicates(combined);
            const sorted = unique.sort((a, b) => (b.seeds || 0) - (a.seeds || 0));

            const sourceStats = {};
            sorted.forEach(r => {
                sourceStats[r.provider] = (sourceStats[r.provider] || 0) + 1;
            });

            logger.info(`✅ [ExtendedSources] TOTAL: ${sorted.length} resultados únicos de ${Object.keys(sourceStats).length} fontes`);
            logger.info(`📊 [ExtendedSources] Breakdown: ${JSON.stringify(sourceStats)}`);
            return sorted;
        } catch (error) {
            logger.error(`❌ [ExtendedSources] Erro crítico: ${error.message}`);
            return [];
        }
    }

    // === Utilitários ===
    removeDuplicates(results) {
        const seen = new Set();
        return results.filter(r => {
            if (!r.magnetLink) return false;
            const match = r.magnetLink.match(/btih:([a-zA-Z0-9]+)/i);
            if (!match) return true;
            const hash = match[1].toLowerCase();
            if (seen.has(hash)) return false;
            seen.add(hash);
            return true;
        });
    }

    createMagnetLink(hash, name) {
        const encodedName = encodeURIComponent(name);
        const trackers = [
            'udp://open.demonii.com:1337/announce',
            'udp://tracker.openbittorrent.com:80',
            'udp://tracker.coppersurfer.tk:6969',
            'udp://glotorrents.pw:6969/announce',
            'udp://tracker.opentrackr.org:1337/announce',
            'udp://torrent.gresille.org:80/announce',
            'udp://p4p.arenabg.com:1337',
            'udp://tracker.leechers-paradise.org:6969',
            'udp://9.rarbg.to:2710/announce',
            'udp://exodus.desync.com:6969/announce',
            'udp://tracker.tiny-vps.com:6969/announce',
            'udp://open.stealth.si:80/announce'
        ].map(t => `&tr=${encodeURIComponent(t)}`).join('');
        return `magnet:?xt=urn:btih:${hash}&dn=${encodedName}${trackers}`;
    }

    formatBytes(bytes) {
        if (!bytes || bytes === 0) return 'N/A';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    listSources() {
        const active = Object.values(this.sources).filter(s => s.active);
        return {
            total: Object.keys(this.sources).length,
            active: active.length,
            sources: active.map(s => ({ name: s.name, category: s.category, quality: s.quality }))
        };
    }

    toggleSource(sourceName, enabled) {
        if (this.sources[sourceName]) {
            this.sources[sourceName].active = enabled;
            return true;
        }
        return false;
    }
}

module.exports = ExtendedSources;
