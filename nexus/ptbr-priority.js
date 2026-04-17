/**
 * NEXUS PT-BR PRIORITY ENGINE
 * ============================
 * Sistema de priorização de conteúdo em Português Brasileiro
 * Detecta e pontua torrents com áudio/legendas PT-BR
 */

// Padrões que indicam conteúdo com áudio PT-BR
const PTBR_AUDIO_PATTERNS = [
    // Padrões diretos
    /\b(dublado|dub|dual|pt-br|pt\.br|ptbr|bra|brazilian|brasil)\b/i,
    /\b(audio\s*pt|som\s*pt|dublagem\s*br|dub\s*br)\b/i,
    /\b(nacional|audio\.brasileiro|audio\.nacional)\b/i,
    /\[pt-br\]/i,
    /\(pt-br\)/i,
    /\.pt-br\./i,

    // Padrões de release groups brasileiros
    /\b(comando|bludragon|bia|amzn\.br|comando\s*torrent)\b/i,
    /\b(qualitytv|tubarao|mrssjj|cinehunter|dublagembr)\b/i,
    /\b(animeshd|animesbr|animes\s*br|torrent\s*br)\b/i,
    /\b(lapumia|vamostorrent|bludv|makingoff)\b/i,
    /\b(extremetorrents|torrentbr|torrentsbr)\b/i,

    // Multi-audio que provavelmente inclui PT
    /\b(multi|multi-audio|multi\.audio)\b/i,
    /\b(dual\s*audio|dual\.audio|dualaudio)\b/i,

    // Padrões alternativos comuns
    /\bpt[\s\.\-_]?br\b/i,
    /\bpt[\s\.\-_]?pt\b/i,          // PT-PT (Português de Portugal, similar)
    /\bportuguese\b/i,
    /\bportugues\b/i,
    /\bpt\+en\b/i,                   // PT+EN dual audio
    /\b(aud|audio)[:\s\.\-]?(br|pt)\b/i,
];

// Padrões que indicam legendas PT-BR
const PTBR_SUBTITLE_PATTERNS = [
    /\b(leg\s*pt|legenda\s*pt|sub\s*pt|subs\s*pt|legendado)\b/i,
    /\[leg\]/i,
    /\.leg\./i,
    /\bsubtitles?\s*pt\b/i,
];

// Padrões de qualidade para priorização
const QUALITY_PATTERNS = {
    '4K': { pattern: /\b(4k|uhd|2160p)\b/i, score: 100 },
    '1080p': { pattern: /\b1080p\b/i, score: 80 },
    '720p': { pattern: /\b720p\b/i, score: 60 },
    'HDTV': { pattern: /\bhdtv\b/i, score: 50 },
    'WEB-DL': { pattern: /\b(web-?dl|webdl)\b/i, score: 70 },
    'BluRay': { pattern: /\b(blu-?ray|bdremux|bdrip)\b/i, score: 90 },
    'REMUX': { pattern: /\bremux\b/i, score: 95 },
};

// Release groups brasileiros conhecidos (para badges)
const BR_RELEASE_GROUPS = {
    'COMANDO': { quality: 'high', specialty: 'Dual Audio' },
    'LAPUMiA': { quality: 'high', specialty: 'Qualidade Premium' },
    'VAMOSTORRENT': { quality: 'medium', specialty: 'Conteúdo Nacional' },
    'BludV': { quality: 'medium', specialty: 'Clássicos BR' },
    'BLUDRAGON': { quality: 'high', specialty: 'Anime Dublado' },
    'QUALITYTV': { quality: 'high', specialty: 'Séries BR' },
    'MAKINGOFF': { quality: 'high', specialty: 'Cinema BR' }
};

/**
 * Detecta release group brasileiro
 * @param {string} title
 * @returns {{ group: string, info: object } | null}
 */
function detectBRReleaseGroup(title) {
    for (const [group, info] of Object.entries(BR_RELEASE_GROUPS)) {
        const regex = new RegExp(`\\b${group}\\b`, 'i');
        if (regex.test(title)) {
            return { group, ...info };
        }
    }
    return null;
}

/**
 * Analisa um título de torrent e retorna pontuação PT-BR
 * @param {string} title - Título do torrent
 * @returns {{ hasPTBRAudio: boolean, hasPTBRSubs: boolean, score: number, matchedPatterns: string[], releaseGroup: object }}
 */
function analyzePTBRContent(title) {
    const matchedPatterns = [];
    let score = 0;

    // Checar padrões de áudio PT-BR
    let hasPTBRAudio = false;
    for (const pattern of PTBR_AUDIO_PATTERNS) {
        if (pattern.test(title)) {
            hasPTBRAudio = true;
            matchedPatterns.push(pattern.source);
            score += 50; // Áudio tem pontuação alta
        }
    }

    // Checar padrões de legendas PT-BR
    let hasPTBRSubs = false;
    for (const pattern of PTBR_SUBTITLE_PATTERNS) {
        if (pattern.test(title)) {
            hasPTBRSubs = true;
            matchedPatterns.push(pattern.source);
            score += 25; // Legendas têm pontuação média
        }
    }

    // Detectar release group brasileiro
    const releaseGroup = detectBRReleaseGroup(title);
    if (releaseGroup) {
        score += 60; // Bônus grande para grupos conhecidos
        hasPTBRAudio = true; // Grupos BR sempre têm PT-BR
    }

    // Bônus para dual audio
    if (/dual/i.test(title)) {
        score += 30;
    }

    // Bônus para releases nacionais
    if (/nacional|brazilian|brasil/i.test(title)) {
        score += 40;
    }

    return { hasPTBRAudio, hasPTBRSubs, score, matchedPatterns, releaseGroup };
}

/**
 * Analisa qualidade do vídeo
 * @param {string} title - Título do torrent
 * @returns {{ quality: string, score: number }}
 */
function analyzeQuality(title) {
    for (const [name, config] of Object.entries(QUALITY_PATTERNS)) {
        if (config.pattern.test(title)) {
            return { quality: name, score: config.score };
        }
    }
    return { quality: 'SD', score: 30 };
}

/**
 * Pontua e ordena resultados priorizando SEEDS + PT-BR
 * @param {Array} results - Array de resultados de torrent
 * @returns {Array} - Resultados ordenados com scores
 */
function prioritizePTBRResults(results) {
    const scored = results.map(result => {
        const ptbrAnalysis = analyzePTBRContent(result.title);
        const qualityAnalysis = analyzeQuality(result.title);

        // NOVO CÁLCULO - SEEDS TÊM PRIORIDADE MÁXIMA:
        // - Seeds: até 200 pontos (DOBRADO!)
        // - Qualidade: até 100 pontos
        // - PT-BR: até 50 pontos (bônus menor)
        
        const seeds = result.seeds || 0;
        let seedScore = 0;
        
        // Escala exponencial para seeds - MUITO mais peso
        if (seeds > 5000) seedScore = 200;
        else if (seeds > 2000) seedScore = 180;
        else if (seeds > 1000) seedScore = 160;
        else if (seeds > 500) seedScore = 140;
        else if (seeds > 200) seedScore = 120;
        else if (seeds > 100) seedScore = 100;
        else if (seeds > 50) seedScore = 80;
        else if (seeds > 20) seedScore = 60;
        else if (seeds > 10) seedScore = 40;
        else if (seeds > 5) seedScore = 20;
        else if (seeds > 0) seedScore = 10;

        // PT-BR agora é só um BÔNUS (50% do original)
        const ptbrScore = Math.floor(ptbrAnalysis.score * 0.5);

        const totalScore = seedScore + qualityAnalysis.score + ptbrScore;

        return {
            ...result,
            ptbrScore: ptbrScore,
            qualityScore: qualityAnalysis.score,
            seedScore: seedScore,
            totalScore,
            hasPTBRAudio: ptbrAnalysis.hasPTBRAudio,
            hasPTBRSubs: ptbrAnalysis.hasPTBRSubs,
            detectedQuality: qualityAnalysis.quality,
            releaseGroup: ptbrAnalysis.releaseGroup
        };
    });

    // Ordenar: SEEDS primeiro, depois score total
    return scored.sort((a, b) => {
        // Se diferença de seeds for grande (>100), priorizar seeds
        const seedDiff = Math.abs(a.seedScore - b.seedScore);
        if (seedDiff > 30) {
            return b.seedScore - a.seedScore;
        }
        // Senão, usar score total
        return b.totalScore - a.totalScore;
    });
}

/**
 * Filtra apenas resultados com conteúdo PT-BR
 * @param {Array} results - Resultados com scores
 * @param {boolean} includeSubsOnly - Se deve incluir resultados só com legendas
 * @returns {Array}
 */
function filterPTBROnly(results, includeSubsOnly = true) {
    return results.filter(r => {
        if (r.hasPTBRAudio) return true;
        if (includeSubsOnly && r.hasPTBRSubs) return true;
        return false;
    });
}

/**
 * Modifica query de busca para melhorar chances de encontrar PT-BR
 * @param {string} query - Query original
 * @returns {string[]} - Array de queries variantes
 */
function enhanceQueryForPTBR(query) {
    const queries = [query]; // Sempre incluir query original

    // Adicionar variações PT-BR
    if (!/(dublado|pt-br|dual|nacional)/i.test(query)) {
        queries.push(`${query} dublado`);
        queries.push(`${query} pt-br`);
        queries.push(`${query} dual audio`);
    }

    return queries;
}

/**
 * Agrupa resultados por título (para evitar duplicatas de diferentes qualidades)
 * @param {Array} results - Resultados com scores
 * @returns {Map}
 */
function groupByTitle(results) {
    const groups = new Map();

    for (const result of results) {
        // Normalizar título para agrupamento
        const normalized = result.title
            .replace(/\.(mkv|mp4|avi|m4v)$/i, '')
            .replace(/\b(1080p|720p|480p|2160p|4k)\b/gi, '')
            .replace(/\b(x264|x265|hevc|h264|h265)\b/gi, '')
            .replace(/\b(web-?dl|bluray|hdtv|dvdrip|bdrip)\b/gi, '')
            .replace(/[\[\]\(\)\.\_\-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase()
            .slice(0, 50); // Primeiros 50 chars

        if (!groups.has(normalized)) {
            groups.set(normalized, []);
        }
        groups.get(normalized).push(result);
    }

    return groups;
}

/**
 * Retorna o melhor resultado de cada grupo (melhor qualidade PT-BR)
 * @param {Map} groups
 * @returns {Array}
 */
function getBestFromEachGroup(groups) {
    const best = [];

    for (const [, results] of groups) {
        // Já estão ordenados por score, pegar o primeiro
        if (results.length > 0) {
            best.push(results[0]);
        }
    }

    // Ordenar novamente por score
    return best.sort((a, b) => b.totalScore - a.totalScore);
}

// Export para CommonJS
module.exports = {
    analyzePTBRContent,
    analyzeQuality,
    prioritizePTBRResults,
    filterPTBROnly,
    enhanceQueryForPTBR,
    groupByTitle,
    getBestFromEachGroup,
    detectBRReleaseGroup,
    PTBR_AUDIO_PATTERNS,
    PTBR_SUBTITLE_PATTERNS,
    QUALITY_PATTERNS,
    BR_RELEASE_GROUPS
};
