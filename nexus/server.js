/**
 * ARCONTE DO NEXO PROFUNDO - CORE SERVER
 * --------------------------------------
 * Stack: Node.js, Express, Puppeteer, SQLite3, Winston, Helmet, RateLimit
 * Responsabilidade: OrquestraÃ§Ã£o de busca, evasÃ£o anti-bot, persistÃªncia e API.
 */

const express = require('express');
const puppeteer = require('puppeteer');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const NexusAdvancedSearch = require('./advanced-search');
const ExtendedSources = require('./extended-sources');
const PTBRPriority = require('./ptbr-priority');
const SemanticSearch = require('./semantic-search');

// --- CONFIGURAÃ‡ÃƒO DO SISTEMA ---
const PORT = process.env.PORT || 3005;
const DB_FILE = path.join(__dirname, 'nexus.db');
const CACHE_TTL_HOURS = 24;
const MAX_CONCURRENT_PAGES = 5;
const SEARCH_TIMEOUT = 45000;

const app = express();

// --- LOGGING ---
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        }),
        new winston.transports.File({ filename: path.join(__dirname, 'nexus-error.log'), level: 'error' }),
        new winston.transports.File({ filename: path.join(__dirname, 'nexus-combined.log') })
    ],
});

// --- MIDDLEWARES ---
app.use(helmet({
    contentSecurityPolicy: false, // NecessÃ¡rio para carregar scripts externos no index.html de dev
}));
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// --- CAMADA DE DADOS ---
const db = new sqlite3.Database(DB_FILE, (err) => {
    if (err) logger.error('FATAL: Falha ao conectar ao Banco de Dados:', err.message);
    else logger.info('STATUS: Nexo de Dados (SQLite) conectado.');
});

db.serialize(() => {
    db.run("PRAGMA foreign_keys = ON");

    db.run(`
        CREATE TABLE IF NOT EXISTS SearchQuery (
            id TEXT PRIMARY KEY,
            term TEXT NOT NULL,
            category TEXT DEFAULT 'all',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS SearchResult (
            id TEXT PRIMARY KEY,
            queryId TEXT NOT NULL,
            title TEXT NOT NULL,
            magnetLink TEXT NOT NULL,
            poster TEXT,
            size TEXT,
            seeds INTEGER,
            leechers INTEGER,
            sourceSite TEXT,
            cachedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(queryId) REFERENCES SearchQuery(id) ON DELETE CASCADE
        )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_term ON SearchQuery(term)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_queryId ON SearchResult(queryId)`);
});

// --- MOTOR DE BUSCA (PUPPETEER ENGINE) ---
// --- MOTOR DE BUSCA MULTI-FONTE (NEXUS ENGINE 2026) ---
function classifyProviderFailure(message = '') {
    const normalized = String(message || '').toLowerCase();
    if (!normalized || normalized.includes('vazio')) return 'empty';
    if (normalized.includes('err_name_not_resolved') || normalized.includes('dns')) return 'dns';
    if (normalized.includes('timeout')) return 'timeout';
    if (normalized.includes('429')) return 'rate_limit';
    if (normalized.includes('403') || normalized.includes('401')) return 'auth';
    if (normalized.includes('500') || normalized.includes('502') || normalized.includes('503') || normalized.includes('504')) return 'http';
    return 'error';
}

async function performDeepScraping(term) {
    logger.info(`[ENGINE] ðŸ“¡ Iniciando varredura multi-source (1337x, TPB, YTS) para: "${term}"`);
    let browser = null;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-zygote',
                '--window-size=1920,1080',
                '--disable-blink-features=AutomationControlled'
            ]
        });

        const createAgentPage = async () => {
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36');
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) req.abort();
                else req.continue();
            });
            return page;
        };

        // --- SUB-SCRAPER 1: 1337x (Geral) ---
        const scrape1337x = async () => {
            const page = await createAgentPage();
            try {
                const searchUrl = `https://1337x.to/sort-search/${encodeURIComponent(term)}/seeders/desc/1/`;
                await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

                const items = await page.evaluate(() => {
                    const rows = Array.from(document.querySelectorAll('table.table-list tr')).slice(0, 5);
                    return rows.map(row => {
                        const linkEl = row.querySelector('td.name a:nth-child(2)');
                        const seeds = parseInt(row.querySelector('td.seeds')?.innerText.replace(/,/g, '') || '0');
                        const size = row.querySelector('td.size')?.innerText.trim();
                        if (!linkEl) return null;
                        return { title: linkEl.innerText.trim(), url: linkEl.getAttribute('href'), seeds, size };
                    }).filter(Boolean);
                });
                await page.close();

                // Busca magnet links EM PARALELO para 1337x
                const results = await Promise.all(items.map(async (item) => {
                    const dPage = await createAgentPage();
                    try {
                        await dPage.goto(`https://1337x.to${item.url}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
                        const magnet = await dPage.evaluate(() => document.querySelector('a[href^="magnet:?"]')?.href);
                        const poster = await dPage.evaluate(() => document.querySelector('.torrent-image img')?.src);
                        await dPage.close();
                        if (magnet) return { ...item, magnetLink: magnet, poster, sourceSite: '1337x' };
                    } catch (e) {
                        await dPage.close();
                    }
                    return null;
                }));

                return results.filter(Boolean);
            } catch (e) {
                await page.close();
                logger.warn(`[1337x] Offline ou Bloqueado: ${e.message}`);
                throw e;
            }
        };

        // --- SUB-SCRAPER 2: The Pirate Bay (TPB - ResiliÃªncia) ---
        const scrapeTPB = async () => {
            const page = await createAgentPage();
            try {
                // TPB utiliza magnet direto na lista, muito mais rÃ¡pido
                const searchUrl = `https://thepiratebay.org/search.php?q=${encodeURIComponent(term)}&all=on&search=Pirate+Search&page=0&orderby=99`;
                await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

                const results = await page.evaluate(() => {
                    const rows = Array.from(document.querySelectorAll('#searchResult tbody tr')).slice(0, 6);
                    return rows.map(tr => {
                        const title = tr.querySelector('.detLink')?.innerText;
                        const magnet = tr.querySelector('a[href^="magnet:?"]')?.href;
                        const seeds = parseInt(tr.querySelector('td[align="right"]')?.innerText) || 0;
                        if (!magnet) return null;
                        return { title, magnetLink: magnet, seeds, size: 'N/A', sourceSite: 'ThePirateBay' };
                    }).filter(Boolean);
                });
                await page.close();
                return results;
            } catch (e) {
                await page.close();
                logger.warn(`[TPB] Falha: ${e.message}`);
                throw e;
            }
        };

        // --- SUB-SCRAPER 3: YTS (Especialista em Filmes / Qualidade) ---
        const scrapeYTS = async () => {
            const page = await createAgentPage();
            try {
                const ytsMirrors = [
                    `https://yts.rs/browse-movies/${encodeURIComponent(term)}/all/all/0/latest`,
                    `https://yts.do/browse-movies/${encodeURIComponent(term)}/all/all/0/latest`,
                    `https://yts.mx/browse-movies/${encodeURIComponent(term)}/all/all/0/latest`
                ];

                let loaded = false;
                for (const mirror of ytsMirrors) {
                    try {
                        await page.goto(mirror, { waitUntil: 'domcontentloaded', timeout: 10000 });
                        loaded = true;
                        break;
                    } catch { continue; }
                }
                if (!loaded) { await page.close(); return []; }
                const movies = await page.evaluate(() => {
                    return Array.from(document.querySelectorAll('.browse-movie-wrap')).slice(0, 4).map(m => ({
                        title: m.querySelector('.browse-movie-title')?.innerText,
                        url: m.querySelector('a')?.href,
                        poster: m.querySelector('img')?.src
                    }));
                });
                await page.close();

                // Busca magnet links EM PARALELO para YTS
                const results = await Promise.all(movies.map(async (movie) => {
                    const dPage = await createAgentPage();
                    try {
                        await dPage.goto(movie.url, { waitUntil: 'domcontentloaded', timeout: 10000 });
                        const magnet = await dPage.evaluate(() => {
                            const mLink = Array.from(document.querySelectorAll('a[href^="magnet:?"]')).find(a => a.innerText.includes('1080p')) || document.querySelector('a[href^="magnet:?"]');
                            return mLink ? mLink.href : null;
                        });
                        await dPage.close();
                        if (magnet) return { title: movie.title, magnetLink: magnet, seeds: 500, size: '1080p', poster: movie.poster, sourceSite: 'YTS' };
                    } catch (e) {
                        await dPage.close();
                    }
                    return null;
                }));

                return results.filter(Boolean);
            } catch (e) {
                await page.close();
                logger.warn(`[YTS] Falha: ${e.message}`);
                throw e;
            }
        };

        // --- SUB-SCRAPER 4: LimeTorrents (CatÃ¡logo enorme) ---
        const scrapeLimeTorrents = async () => {
            const page = await createAgentPage();
            try {
                const urls = [
                    `https://www.limetorrents.lol/search/all/${encodeURIComponent(term)}/seeds/1/`,
                    `https://www.limetorrents.pro/search/all/${encodeURIComponent(term)}/seeds/1/`
                ];

                let success = false;
                for (const url of urls) {
                    try {
                        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });
                        success = true;
                        break;
                    } catch { continue; }
                }
                if (!success) { await page.close(); return []; }

                const results = await page.evaluate(() => {
                    const rows = Array.from(document.querySelectorAll('table.table2 tr')).slice(1, 10);
                    return rows.map(row => {
                        const link = row.querySelector('td.tdleft div.tt-name a:last-child');
                        const title = link?.innerText?.trim();
                        const href = link?.getAttribute('href') || '';
                        const hashMatch = href.match(/([A-Fa-f0-9]{40})/);
                        const seeds = parseInt(row.querySelector('td.tdseed')?.innerText?.replace(/[^0-9]/g, '')) || 0;
                        const size = row.querySelector('td.tdnormal:nth-child(3)')?.innerText?.trim() || 'N/A';
                        if (!title || !hashMatch) return null;
                        return { title, hash: hashMatch[1], seeds, size };
                    }).filter(Boolean);
                });
                await page.close();

                return results.map(r => ({
                    title: r.title,
                    magnetLink: `magnet:?xt=urn:btih:${r.hash}&dn=${encodeURIComponent(r.title)}&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=udp%3A%2F%2Fopen.demonii.com%3A1337`,
                    seeds: r.seeds,
                    size: r.size,
                    sourceSite: 'LimeTorrents'
                }));
            } catch (e) {
                await page.close();
                logger.warn(`[LimeTorrents] Falha: ${e.message}`);
                throw e;
            }
        };

        // --- SUB-SCRAPER 5: TorrentGalaxy (Boa qualidade geral) ---
        const scrapeTorrentGalaxy = async () => {
            const page = await createAgentPage();
            try {
                await page.goto(`https://torrentgalaxy.to/torrents.php?search=${encodeURIComponent(term)}&sort=seeders&order=desc`, { waitUntil: 'domcontentloaded', timeout: 12000 });

                const results = await page.evaluate(() => {
                    const rows = Array.from(document.querySelectorAll('div.tgxtablerow')).slice(0, 8);
                    return rows.map(row => {
                        const linkEl = row.querySelector('div.tgxtablecell a.txlight');
                        const title = linkEl?.innerText?.trim();
                        const magnet = row.querySelector('a[href^="magnet:"]')?.href;
                        const seedsEl = row.querySelector('span[title="Seeders/Leechers"] font[color="green"]');
                        const seeds = parseInt(seedsEl?.innerText) || 0;
                        const sizeEl = row.querySelector('div.tgxtablecell:nth-child(8) span');
                        const size = sizeEl?.innerText?.trim() || 'N/A';
                        if (!title || !magnet) return null;
                        return { title, magnetLink: magnet, seeds, size, sourceSite: 'TorrentGalaxy' };
                    }).filter(Boolean);
                });
                await page.close();
                return results;
            } catch (e) {
                await page.close();
                logger.warn(`[TorrentGalaxy] Falha: ${e.message}`);
                throw e;
            }
        };

        // --- EXECUÃ‡ÃƒO PARALELA DE 5 FONTES ---
        logger.info(`[ENGINE] ðŸš€ Disparando 5 scrapers em paralelo para: "${term}"`);
        const scraperEntries = [
            { provider: '1337x', run: scrape1337x },
            { provider: 'ThePirateBay', run: scrapeTPB },
            { provider: 'YTS', run: scrapeYTS },
            { provider: 'LimeTorrents', run: scrapeLimeTorrents },
            { provider: 'TorrentGalaxy', run: scrapeTorrentGalaxy }
        ];
        const allResults = await Promise.allSettled(scraperEntries.map(entry => entry.run()));
        const diagnostics = allResults.map((result, index) => {
            const provider = scraperEntries[index].provider;
            if (result.status === 'fulfilled') {
                const count = Array.isArray(result.value) ? result.value.length : 0;
                return {
                    provider,
                    status: count > 0 ? 'ok' : 'empty',
                    count,
                    error: count > 0 ? null : 'Vazio nesta fonte.'
                };
            }

            return {
                provider,
                status: classifyProviderFailure(result.reason?.message || ''),
                count: 0,
                error: result.reason?.message || String(result.reason || 'Falha desconhecida')
            };
        });

        const combined = allResults
            .filter(r => r.status === 'fulfilled')
            .flatMap(r => r.value || [])
            .sort((a, b) => (b.seeds || 0) - (a.seeds || 0));

        const successCount = allResults.filter(r => r.status === 'fulfilled' && r.value?.length > 0).length;
        logger.info(`[ENGINE] Ã¢Å“â€¦ ${combined.length} resultados de ${successCount}/5 scrapers ativos`);
        logger.info(`[ENGINE] Providers: ${diagnostics.map(d => `${d.provider}:${d.status}${d.count ? `(${d.count})` : ''}`).join(' | ')}`);

        Object.defineProperty(combined, '_diagnostics', {
            value: diagnostics,
            enumerable: false,
            configurable: true,
        });

        if (combined.length === 0) {
            const emptyError = new Error("Vazio em todas as fontes.");
            emptyError.failures = diagnostics;
            throw emptyError;
        }

        return combined;

    } catch (error) {
        const failures = Array.isArray(error?.failures) ? error.failures : [];
        logger.error(`[ENGINE] Erro crÃƒÂ­tico multi-source para "${term}": ${error.message}${failures.length ? ` | failures=${JSON.stringify(failures)}` : ''}`);

        const fallbackDiagnostics = failures.length > 0
            ? failures
            : [{
                provider: 'engine',
                status: classifyProviderFailure(error?.message || ''),
                count: 0,
                error: error?.message || 'Falha desconhecida no deepScraping.'
            }];

        const emptyResults = [];
        Object.defineProperty(emptyResults, '_diagnostics', {
            value: fallbackDiagnostics,
            enumerable: false,
            configurable: true,
        });

        return emptyResults;
    } finally {
        if (browser) await browser.close();
    }
}

// --- ROTAS ---
const searchRateLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 30,
    message: { error: 'LIMITE DE REQUISIÃ‡Ã•ES ATINGIDO. AGUARDE O RESET DO NEXO.' }
});

app.get('/api/health', (req, res) => {
    res.json({ status: "ONLINE", system: "NEXUS DEEP SEARCH", timestamp: new Date().toISOString() });
});

app.post('/api/search', searchRateLimiter, async (req, res) => {
    const { query, category = "all", forceRefresh, prioritizePTBR = true, ptbrOnly = false } = req.body;
    if (!query || query.trim().length < 3) return res.status(400).json({ error: "Termo de busca insuficiente." });

    const normalizedTerm = query.toLowerCase().trim();

    logger.info(`[SEARCH] ðŸ” Busca: "${normalizedTerm}" | PT-BR Priority: ${prioritizePTBR} | PT-BR Only: ${ptbrOnly}`);

    db.get(`SELECT id, createdAt FROM SearchQuery WHERE term = ? ORDER BY createdAt DESC LIMIT 1`, [normalizedTerm], async (err, row) => {
        const cacheValid = row && ((Date.now() - new Date(row.createdAt).getTime()) / 36e5) < CACHE_TTL_HOURS;

        // SÃ³ usamos o cache se houver resultados reais salvos
        if (cacheValid && !forceRefresh) {
            db.all(`SELECT * FROM SearchResult WHERE queryId = ? ORDER BY seeds DESC`, [row.id], (err, results) => {
                if (results && results.length > 0) {
                    // Aplicar priorizaÃ§Ã£o PT-BR mesmo no cache
                    let finalResults = prioritizePTBR ? PTBRPriority.prioritizePTBRResults(results) : results;
                    if (ptbrOnly) {
                        finalResults = PTBRPriority.filterPTBROnly(finalResults);
                    }
                    return res.json({ source: 'cache', prioritized: prioritizePTBR, results: finalResults });
                }
                // Se o cache estÃ¡ vazio, forÃ§amos uma nova busca viva
                performLiveSearch();
            });
        } else {
            performLiveSearch();
        }

        async function performLiveSearch() {
            try {
                const freshResults = await performDeepScraping(normalizedTerm);

                if (!freshResults || freshResults.length === 0) {
                    logger.warn(`[API] Nenhuma semente encontrada para "${normalizedTerm}".`);

                    return res.json({ source: 'live_network', results: [] });
                }

                // Aplicar priorizaÃ§Ã£o PT-BR aos resultados frescos
                let finalResults = prioritizePTBR ? PTBRPriority.prioritizePTBRResults(freshResults) : freshResults;
                if (ptbrOnly) {
                    finalResults = PTBRPriority.filterPTBROnly(finalResults);
                }

                // Logar estatÃ­sticas de PT-BR
                const ptbrCount = finalResults.filter(r => r.hasPTBRAudio || r.hasPTBRSubs).length;
                logger.info(`[SEARCH] ðŸ‡§ðŸ‡· ${ptbrCount}/${finalResults.length} resultados com conteÃºdo PT-BR detectado`);

                const queryId = crypto.randomUUID();

                db.serialize(() => {
                    db.run(`INSERT INTO SearchQuery (id, term, category) VALUES (?, ?, ?)`, [queryId, normalizedTerm, category]);
                    const stmt = db.prepare(`INSERT INTO SearchResult (id, queryId, title, magnetLink, size, seeds, leechers, sourceSite) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
                    finalResults.forEach(r => stmt.run(crypto.randomUUID(), queryId, r.title, r.magnetLink, r.size, r.seeds, r.leechers || r.peers, r.sourceSite || r.provider));
                    stmt.finalize();
                });

                res.json({
                    source: 'live_network',
                    prioritized: prioritizePTBR,
                    ptbrCount,
                    results: finalResults
                });
            } catch (scrapeError) {
                logger.error(`[API] Falha na extraÃ§Ã£o viva: ${scrapeError.message}`);
                res.status(500).json({ error: "Erro na extraÃ§Ã£o profunda.", details: scrapeError.message });
            }
        }
    });
});

// --- BUSCA AVANÃ‡ADA (MULTI-PROVIDER API) ---
let advancedSearch = null;
let extendedSources = null;

// Inicializar motor avanÃ§ado
try {
    advancedSearch = new NexusAdvancedSearch();
    logger.info('âœ… Motor de Busca AvanÃ§ado inicializado');
} catch (e) {
    logger.warn('âš ï¸  Motor AvanÃ§ado nÃ£o disponÃ­vel, usando apenas Puppeteer');
}

// Inicializar fontes estendidas
try {
    extendedSources = new ExtendedSources();
    logger.info('âœ… Fontes Estendidas inicializadas (YTS, EZTV, Nyaa, BitSearch)');
} catch (e) {
    logger.warn('âš ï¸  Fontes Estendidas nÃ£o disponÃ­veis');
}

app.post('/api/search/advanced', searchRateLimiter, async (req, res) => {
    const { query, category = 'Movies', limit = 5, mode = 'auto' } = req.body;

    if (!query || query.trim().length < 3) {
        return res.status(400).json({ error: "Termo de busca insuficiente (mÃ­n. 3 caracteres)" });
    }

    logger.info(`[ADVANCED] ðŸ” Busca: "${query}" | Modo: ${mode}`);

    try {
        let results = [];

        // Modo AUTO: Tenta API primeiro, depois Puppeteer
        if (mode === 'auto' || mode === 'api') {
            if (advancedSearch) {
                logger.info('[ADVANCED] Tentando busca via API multi-provider...');
                results = await advancedSearch.search(query, category, limit);

                if (results.length > 0) {
                    logger.info(`[ADVANCED] âœ… API retornou ${results.length} resultados`);

                    // Salvar no cache
                    const queryId = crypto.randomUUID();
                    db.serialize(() => {
                        db.run(`INSERT INTO SearchQuery (id, term, category) VALUES (?, ?, ?)`,
                            [queryId, query.toLowerCase().trim(), category]);

                        const stmt = db.prepare(`INSERT INTO SearchResult (id, queryId, title, magnetLink, size, seeds, leechers, sourceSite) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
                        results.forEach(r => {
                            stmt.run(
                                crypto.randomUUID(),
                                queryId,
                                r.title,
                                r.magnetLink,
                                r.size,
                                r.seeds,
                                r.peers,
                                r.provider
                            );
                        });
                        stmt.finalize();
                    });

                    return res.json({
                        source: 'advanced_api',
                        providers: advancedSearch.listProviders().active,
                        results: results
                    });
                }
            }
        }

        // Fallback para Puppeteer se API falhou ou modo = 'puppeteer'
        if (results.length === 0 && (mode === 'auto' || mode === 'puppeteer')) {
            logger.info('[ADVANCED] API sem resultados, usando Puppeteer...');
            results = await performDeepScraping(query);

            if (results.length > 0) {
                return res.json({
                    source: 'puppeteer_scraping',
                    results: results
                });
            }
        }

        // Nenhum resultado encontrado
        logger.warn(`[ADVANCED] âš ï¸  Nenhum resultado para: "${query}"`);
        res.json({
            source: 'no_results',
            message: 'Nenhum resultado encontrado',
            results: []
        });

    } catch (error) {
        logger.error(`[ADVANCED] âŒ Erro: ${error.message}`);
        res.status(500).json({
            error: "Erro na busca avanÃ§ada",
            details: error.message
        });
    }
});

// Rota para listar providers disponÃ­veis
app.get('/api/providers', (req, res) => {
    if (!advancedSearch) {
        return res.json({
            available: false,
            message: 'Motor avanÃ§ado nÃ£o disponÃ­vel'
        });
    }

    const providers = advancedSearch.listProviders();
    res.json({
        available: true,
        ...providers
    });
});

// Rota para busca paralela (mais rÃ¡pida mas mais recursos)
app.post('/api/search/parallel', searchRateLimiter, async (req, res) => {
    const { query, category = 'Movies', limit = 3 } = req.body;

    if (!query || query.trim().length < 3) {
        return res.status(400).json({ error: "Termo de busca insuficiente" });
    }

    if (!advancedSearch) {
        return res.status(503).json({ error: "Motor avanÃ§ado nÃ£o disponÃ­vel" });
    }

    try {
        logger.info(`[PARALLEL] âš¡ Busca paralela: "${query}"`);
        const results = await advancedSearch.parallelSearch(query, category, limit);

        res.json({
            source: 'parallel_search',
            providers: advancedSearch.listProviders().active,
            results: results
        });

    } catch (error) {
        logger.error(`[PARALLEL] âŒ Erro: ${error.message}`);
        res.status(500).json({ error: "Erro na busca paralela", details: error.message });
    }
});

// --- FONTES ESTENDIDAS (YTS, EZTV, NYAA, BITSEARCH) ---

// Busca em todas as fontes estendidas
app.post('/api/search/extended', searchRateLimiter, async (req, res) => {
    const { query, category = 'All', limit = 5 } = req.body;

    if (!query || query.trim().length < 3) {
        return res.status(400).json({ error: "Termo de busca insuficiente" });
    }

    if (!extendedSources) {
        return res.status(503).json({ error: "Fontes estendidas nÃ£o disponÃ­veis" });
    }

    try {
        logger.info(`[EXTENDED] ðŸŒ Busca estendida: "${query}" | Categoria: ${category}`);
        const results = await extendedSources.searchAll(query, category, limit);

        // Salvar no cache
        if (results.length > 0) {
            const queryId = crypto.randomUUID();
            db.serialize(() => {
                db.run(`INSERT INTO SearchQuery (id, term, category) VALUES (?, ?, ?)`,
                    [queryId, query.toLowerCase().trim(), category]);

                const stmt = db.prepare(`INSERT INTO SearchResult (id, queryId, title, magnetLink, size, seeds, leechers, sourceSite) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
                results.forEach(r => {
                    stmt.run(
                        crypto.randomUUID(),
                        queryId,
                        r.title,
                        r.magnetLink,
                        r.size,
                        r.seeds,
                        r.peers,
                        r.provider
                    );
                });
                stmt.finalize();
            });
        }

        res.json({
            source: 'extended_sources',
            sources: extendedSources.listSources().sources,
            results: results
        });

    } catch (error) {
        logger.error(`[EXTENDED] âŒ Erro: ${error.message}`);
        res.status(500).json({ error: "Erro na busca estendida", details: error.message });
    }
});

// Busca especÃ­fica por fonte
app.post('/api/search/source/:sourceName', searchRateLimiter, async (req, res) => {
    const { sourceName } = req.params;
    const { query, limit = 10 } = req.body;

    if (!query || query.trim().length < 3) {
        return res.status(400).json({ error: "Termo de busca insuficiente" });
    }

    if (!extendedSources) {
        return res.status(503).json({ error: "Fontes estendidas nÃ£o disponÃ­veis" });
    }

    try {
        logger.info(`[SOURCE] ðŸŽ¯ Busca em ${sourceName}: "${query}"`);

        let results = [];
        switch (sourceName.toLowerCase()) {
            case 'yts':
                results = await extendedSources.searchYTS(query, limit);
                break;
            case 'eztv':
                results = await extendedSources.searchEZTV(query, limit);
                break;
            case 'nyaa':
            case 'nyaasi':
                results = await extendedSources.searchNyaa(query, limit);
                break;
            case 'bitsearch':
                results = await extendedSources.searchBitSearch(query, limit);
                break;
            default:
                return res.status(404).json({ error: `Fonte '${sourceName}' nÃ£o encontrada` });
        }

        res.json({
            source: sourceName,
            results: results
        });

    } catch (error) {
        logger.error(`[SOURCE] âŒ Erro em ${sourceName}: ${error.message}`);
        res.status(500).json({ error: `Erro na busca em ${sourceName}`, details: error.message });
    }
});

// Listar fontes estendidas disponÃ­veis
app.get('/api/sources', (req, res) => {
    if (!extendedSources) {
        return res.json({
            available: false,
            message: 'Fontes estendidas nÃ£o disponÃ­veis'
        });
    }

    const sources = extendedSources.listSources();
    res.json({
        available: true,
        ...sources
    });
});

// Busca ULTRA (Todos os motores combinados)
app.post('/api/search/ultra', searchRateLimiter, async (req, res) => {
    const { query, category = 'Movies', limit = 3 } = req.body;

    if (!query || query.trim().length < 3) {
        return res.status(400).json({ error: "Termo de busca insuficiente" });
    }

    try {
        logger.info(`[ULTRA] ðŸš€ Busca ULTRA: "${query}"`);

        const searches = [];

        // 1. Fontes Estendidas (YTS, EZTV, etc)
        if (extendedSources) {
            searches.push({ engine: 'extendedSources', run: () => extendedSources.searchAll(query, category, limit) });
        }

        // 2. API Multi-Provider
        if (advancedSearch) {
            searches.push({ engine: 'advancedSearch', run: () => advancedSearch.search(query, category, limit) });
        }

        // 3. Puppeteer (fallback)
        searches.push({ engine: 'deepScraping', run: () => performDeepScraping(query) });

        const settled = await Promise.allSettled(searches.map((entry) => entry.run()));
        const failures = [];
        const results = settled.map((entry, index) => {
            const engine = searches[index].engine;
            if (entry.status === 'fulfilled') {
                const value = Array.isArray(entry.value) ? entry.value : [];
                if (value.length === 0) {
                    failures.push({ provider: engine, status: 'empty', error: 'Vazio neste motor.' });
                }
                if (Array.isArray(value._diagnostics)) {
                    failures.push(...value._diagnostics
                        .filter((item) => item.status !== 'ok')
                        .map((item) => ({ provider: `${engine}:${item.provider}`, status: item.status || classifyProviderFailure(item.error || ''), count: item.count || 0, error: item.error || item.status })));
                }
                return value;
            }

            failures.push({ provider: engine, status: classifyProviderFailure(entry.reason?.message || ''), error: entry.reason?.message || String(entry.reason || 'Falha desconhecida') });
            return [];
        });
        const combined = results.flat();

        // Remover duplicatas
        const seen = new Set();
        const unique = combined.filter(r => {
            if (!r.magnetLink) return false;
            const match = r.magnetLink.match(/btih:([a-zA-Z0-9]+)/i);
            if (!match) return true;
            const hash = match[1].toLowerCase();
            if (seen.has(hash)) return false;
            seen.add(hash);
            return true;
        });

        // Ordenar por seeds
        const sorted = unique.sort((a, b) => (b.seeds || 0) - (a.seeds || 0));

        logger.info(`[ULTRA] Ã¢Å“â€¦ ${sorted.length} resultados ÃƒÂºnicos de ${searches.length} motores`);

        if (sorted.length === 0) {
            return res.status(503).json({
                error: "Busca ultra sem resultados utilizaveis",
                details: "Todos os motores retornaram vazio ou falha.",
                failures,
                engines: searches.length,
                results: []
            });
        }

        res.json({
            source: 'ultra_search',
            engines: searches.length,
            failures,
            results: sorted
        });

    } catch (error) {
        logger.error(`[ULTRA] Ã¢ÂÅ’ Erro: ${error.message}`);
        res.status(500).json({ error: "Erro na busca ultra", details: error.message, failures: error?.failures || [] });
    }
});

// ============================================
// ðŸ‡§ðŸ‡· BUSCA PT-BR PRIORITÃRIA (Multi-Query Paralelo)
// ============================================
app.post('/api/search/ptbr', searchRateLimiter, async (req, res) => {
    const { query, limit = 10 } = req.body;

    if (!query || query.trim().length < 2) {
        return res.status(400).json({ error: "Termo de busca insuficiente" });
    }

    try {
        logger.info(`[PT-BR] ðŸ‡§ðŸ‡· Busca PT-BR prioritÃ¡ria: "${query}"`);

        // Gerar variaÃ§Ãµes PT-BR da query
        const ptbrQueries = PTBRPriority.enhanceQueryForPTBR(query);
        logger.info(`[PT-BR] VariaÃ§Ãµes geradas: ${ptbrQueries.join(' | ')}`);

        // Executar buscas em PARALELO para todas as variaÃ§Ãµes
        const allSearches = [];

        for (const pq of ptbrQueries) {
            // Puppeteer scraping para cada variaÃ§Ã£o
            allSearches.push(
                performDeepScraping(pq).catch(() => [])
            );

            // Fontes estendidas para cada variaÃ§Ã£o
            if (extendedSources) {
                allSearches.push(
                    extendedSources.searchAll(pq, 'All', Math.ceil(limit / ptbrQueries.length)).catch(() => [])
                );
            }

            // API multi-provider para cada variaÃ§Ã£o
            if (advancedSearch) {
                allSearches.push(
                    advancedSearch.search(pq, 'All', Math.ceil(limit / ptbrQueries.length)).catch(() => [])
                );
            }
        }

        const results = await Promise.all(allSearches);
        const combined = results.flat();

        // Remover duplicatas por hash
        const seen = new Set();
        const unique = combined.filter(r => {
            if (!r.magnetLink) return false;
            const match = r.magnetLink.match(/btih:([a-zA-Z0-9]+)/i);
            if (!match) return true;
            const hash = match[1].toLowerCase();
            if (seen.has(hash)) return false;
            seen.add(hash);
            return true;
        });

        // Aplicar priorizaÃ§Ã£o PT-BR com score
        const prioritized = PTBRPriority.prioritizePTBRResults(unique);

        // Separar resultados por categoria
        const ptbrResults = prioritized.filter(r => r.hasPTBRAudio || r.hasPTBRSubs);
        const otherResults = prioritized.filter(r => !r.hasPTBRAudio && !r.hasPTBRSubs);

        logger.info(`[PT-BR] âœ… ${prioritized.length} resultados (${ptbrResults.length} PT-BR, ${otherResults.length} outros)`);

        // Salvar no cache
        if (prioritized.length > 0) {
            const queryId = crypto.randomUUID();
            db.serialize(() => {
                db.run(`INSERT INTO SearchQuery (id, term, category) VALUES (?, ?, ?)`,
                    [queryId, query.toLowerCase().trim(), 'ptbr']);
                const stmt = db.prepare(`INSERT INTO SearchResult (id, queryId, title, magnetLink, size, seeds, leechers, sourceSite) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
                prioritized.slice(0, 20).forEach(r => {
                    stmt.run(crypto.randomUUID(), queryId, r.title, r.magnetLink, r.size, r.seeds, r.leechers || r.peers, r.sourceSite || r.provider);
                });
                stmt.finalize();
            });
        }

        res.json({
            source: 'ptbr_priority_search',
            queries_used: ptbrQueries,
            total: prioritized.length,
            ptbr_count: ptbrResults.length,
            results: prioritized.slice(0, limit)
        });

    } catch (error) {
        logger.error(`[PT-BR] âŒ Erro: ${error.message}`);
        res.status(500).json({ error: "Erro na busca PT-BR", details: error.message });
    }
});

// ============================================
// ðŸ“º BUSCA DE SÃ‰RIES (Season-Aware Intelligence)
// ============================================
app.post('/api/search/series', searchRateLimiter, async (req, res) => {
    const { query, season, limit = 15 } = req.body;

    if (!query || query.trim().length < 2) {
        return res.status(400).json({ error: "Nome da sÃ©rie insuficiente" });
    }

    try {
        const rawSeriesName = query.trim();
        const seriesName = rawSeriesName
            .replace(/\bS\d{1,2}\b/gi, ' ')
            .replace(/\bseason\s+\d+\b/gi, ' ')
            .replace(/\btemporada\s+\d+\b/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const normalizedSeriesName = seriesName.replace(/[:\-]+/g, ' ').replace(/\s+/g, ' ').trim();
        logger.info(`[SERIES] ðŸ“º Busca de sÃ©rie: "${seriesName}" ${season ? `| Temporada ${season}` : '| Todas'}`);

        // Construir variaÃ§Ãµes de busca inteligentes para sÃ©ries
        const seriesQueries = [];

        if (season) {
            const sNum = String(season).padStart(2, '0');
            // PadrÃµes comuns para temporadas especÃ­ficas
            seriesQueries.push(`${seriesName} S${sNum}`);
            seriesQueries.push(`${seriesName} S${sNum} complete`);
            seriesQueries.push(`${seriesName} S${sNum} dublado`);
            seriesQueries.push(`${seriesName} season ${season}`);
            seriesQueries.push(`${seriesName} temporada ${season} dublado`);
            seriesQueries.push(`${seriesName} S${sNum} 1080p`);
            if (normalizedSeriesName && normalizedSeriesName !== seriesName) {
                seriesQueries.push(`${normalizedSeriesName} S${sNum}`);
                seriesQueries.push(`${normalizedSeriesName} season ${season}`);
                seriesQueries.push(`${normalizedSeriesName} S${sNum} 1080p`);
            }
        } else {
            // Pack completo da sÃ©rie
            seriesQueries.push(`${seriesName} complete series`);
            seriesQueries.push(`${seriesName} season pack`);
            seriesQueries.push(`${seriesName} S01`);
            seriesQueries.push(`${seriesName} S01 dublado`);
            seriesQueries.push(`${seriesName} dublado`);
            seriesQueries.push(`${seriesName} dual audio`);
            seriesQueries.push(`${seriesName} complete`);
            if (normalizedSeriesName && normalizedSeriesName !== seriesName) {
                seriesQueries.push(`${normalizedSeriesName} complete series`);
                seriesQueries.push(`${normalizedSeriesName} S01`);
                seriesQueries.push(`${normalizedSeriesName} complete`);
            }
        }

        const dedupedQueries = [...new Set(seriesQueries.map(q => q.replace(/\s+/g, ' ').trim()).filter(Boolean))];

        logger.info(`[SERIES] VariaÃ§Ãµes: ${dedupedQueries.join(' | ')}`);

        // Executar buscas em paralelo
        const allSearches = [];

        for (const sq of dedupedQueries) {
            allSearches.push(performDeepScraping(sq).catch(() => []));

            if (extendedSources) {
                // EZTV Ã© a melhor fonte para sÃ©ries
                allSearches.push(extendedSources.searchEZTV(sq, Math.ceil(limit / 2)).catch(() => []));
                allSearches.push(extendedSources.searchBitSearch(sq, Math.ceil(limit / 3)).catch(() => []));
            }

            if (advancedSearch) {
                allSearches.push(advancedSearch.search(sq, 'TV', Math.ceil(limit / 3)).catch(() => []));
            }
        }

        const results = await Promise.all(allSearches);
        const combined = results.flat();

        // Remover duplicatas
        const seen = new Set();
        const unique = combined.filter(r => {
            if (!r.magnetLink) return false;
            const match = r.magnetLink.match(/btih:([a-zA-Z0-9]+)/i);
            if (!match) return true;
            const hash = match[1].toLowerCase();
            if (seen.has(hash)) return false;
            seen.add(hash);
            return true;
        });

        // Detectar e categorizar conteÃºdo de sÃ©rie
        const categorized = unique.map(r => {
            const title = (r.title || '').toUpperCase();

            // Detectar temporada e episÃ³dio
            const seasonMatch = title.match(/S(\d{1,2})/i);
            const episodeMatch = title.match(/E(\d{1,2})/i);
            const isCompletePack = /\b(complete|pack|completa|all\s*seasons?)\b/i.test(title);
            const isSeasonPack = /\b(season\s*pack|s\d{1,2}\s*complete|s\d{1,2}\s*full)\b/i.test(title) ||
                (seasonMatch && !episodeMatch);

            return {
                ...r,
                detectedSeason: seasonMatch ? parseInt(seasonMatch[1]) : null,
                detectedEpisode: episodeMatch ? parseInt(episodeMatch[1]) : null,
                isCompletePack,
                isSeasonPack: isSeasonPack || isCompletePack,
                type: isCompletePack ? 'COMPLETE_PACK' :
                    isSeasonPack ? 'SEASON_PACK' :
                        episodeMatch ? 'SINGLE_EPISODE' :
                            'UNKNOWN'
            };
        });

        // Aplicar priorizaÃ§Ã£o PT-BR
        const prioritized = PTBRPriority.prioritizePTBRResults(categorized);

        // Ordenar: Season Packs primeiro > PT-BR > Seeds
        const sorted = prioritized.sort((a, b) => {
            // Complete packs no topo
            if (a.isCompletePack && !b.isCompletePack) return -1;
            if (!a.isCompletePack && b.isCompletePack) return 1;

            // Season packs em seguida
            if (a.isSeasonPack && !b.isSeasonPack) return -1;
            if (!a.isSeasonPack && b.isSeasonPack) return 1;

            // PT-BR prioritÃ¡rio
            const aPTBR = (a.hasPTBRAudio ? 100 : 0) + (a.hasPTBRSubs ? 50 : 0);
            const bPTBR = (b.hasPTBRAudio ? 100 : 0) + (b.hasPTBRSubs ? 50 : 0);
            if (aPTBR !== bPTBR) return bPTBR - aPTBR;

            // Seeds
            return (b.seeds || 0) - (a.seeds || 0);
        });

        // EstatÃ­sticas
        const stats = {
            total: sorted.length,
            completePacks: sorted.filter(r => r.isCompletePack).length,
            seasonPacks: sorted.filter(r => r.isSeasonPack).length,
            singleEpisodes: sorted.filter(r => r.type === 'SINGLE_EPISODE').length,
            ptbrCount: sorted.filter(r => r.hasPTBRAudio || r.hasPTBRSubs).length
        };

        logger.info(`[SERIES] âœ… ${stats.total} resultados | ${stats.completePacks} packs completos | ${stats.seasonPacks} packs de temporada | ${stats.ptbrCount} PT-BR`);

        res.json({
            source: 'series_search',
            series_name: seriesName,
            season_filter: season || 'all',
            stats,
            results: sorted.slice(0, limit)
        });

    } catch (error) {
        logger.error(`[SERIES] âŒ Erro: ${error.message}`);
        res.status(500).json({ error: "Erro na busca de sÃ©ries", details: error.message });
    }
});

// ============================================
// ðŸ§  BUSCA SEMÃ‚NTICA COM IA
// ============================================
app.post('/api/search/semantic', searchRateLimiter, async (req, res) => {
    const { query, limit = 10, useAI = true } = req.body;

    if (!query || query.trim().length < 2) {
        return res.status(400).json({ error: "Query muito curta" });
    }

    try {
        logger.info(`[SEMANTIC] ðŸ§  Busca semÃ¢ntica: "${query}"`);

        // 1. Analisar intenÃ§Ã£o do usuÃ¡rio
        const intents = SemanticSearch.analyzeIntent(query);
        logger.info(`[SEMANTIC] IntenÃ§Ãµes: ${JSON.stringify(intents)}`);

        // 2. Gerar queries otimizadas (com ou sem IA)
        let optimizedQueries;
        if (useAI) {
            optimizedQueries = await SemanticSearch.enhanceQueryWithAI(query, intents);
        } else {
            optimizedQueries = SemanticSearch.generateFallbackQueries(query, intents);
        }
        
        logger.info(`[SEMANTIC] Queries geradas: ${optimizedQueries.join(' | ')}`);

        // 3. Executar buscas em paralelo para todas as queries
        const allSearches = [];
        
        for (const oq of optimizedQueries) {
            // Puppeteer scraping
            allSearches.push(performDeepScraping(oq).catch(() => []));
            
            // Fontes estendidas
            if (extendedSources) {
                allSearches.push(extendedSources.searchAll(oq, 'All', Math.ceil(limit / 2)).catch(() => []));
            }
            
            // API multi-provider
            if (advancedSearch) {
                allSearches.push(advancedSearch.search(oq, 'All', Math.ceil(limit / 2)).catch(() => []));
            }
        }

        const results = await Promise.all(allSearches);
        const combined = results.flat();

        // 4. Remover duplicatas
        const seen = new Set();
        const unique = combined.filter(r => {
            if (!r.magnetLink) return false;
            const match = r.magnetLink.match(/btih:([a-zA-Z0-9]+)/i);
            if (!match) return true;
            const hash = match[1].toLowerCase();
            if (seen.has(hash)) return false;
            seen.add(hash);
            return true;
        });

        // 5. Aplicar priorizaÃ§Ã£o PT-BR
        const prioritized = PTBRPriority.prioritizePTBRResults(unique);

        // 6. Filtrar e pontuar por intenÃ§Ã£o
        const filtered = SemanticSearch.filterByIntent(prioritized, intents);

        logger.info(`[SEMANTIC] âœ… ${filtered.length} resultados (${optimizedQueries.length} queries)`);

        res.json({
            source: 'semantic_search',
            original_query: query,
            intents: intents,
            optimized_queries: optimizedQueries,
            used_ai: useAI,
            total: filtered.length,
            results: filtered.slice(0, limit)
        });

    } catch (error) {
        logger.error(`[SEMANTIC] âŒ Erro: ${error.message}`);
        res.status(500).json({ error: "Erro na busca semÃ¢ntica", details: error.message });
    }
});

app.listen(PORT, () => {
    logger.info(`NEXUS SERVER ONLINE NA PORTA ${PORT}`);
});
