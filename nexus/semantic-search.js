/**
 * NEXUS SEMANTIC SEARCH ENGINE
 * =============================
 * Busca semântica com IA que entende intenção do usuário
 */

const axios = require('axios');

// Mapeamento de intenções para queries otimizadas
const INTENT_PATTERNS = {
    // Gêneros
    action: ['ação', 'action', 'pancadaria', 'luta', 'explosão', 'tiro'],
    comedy: ['comédia', 'comedy', 'engraçado', 'rir', 'humor', 'funny'],
    drama: ['drama', 'triste', 'chorar', 'emocional', 'pesado'],
    horror: ['terror', 'horror', 'medo', 'assustador', 'suspense'],
    scifi: ['ficção científica', 'sci-fi', 'scifi', 'futuro', 'espaço', 'alien'],
    romance: ['romance', 'amor', 'romântico', 'casal'],
    thriller: ['suspense', 'thriller', 'mistério', 'investigação'],
    animation: ['animação', 'animation', 'desenho', 'anime'],
    
    // Qualidades
    quality_4k: ['4k', 'uhd', '2160p', 'ultra hd'],
    quality_1080p: ['1080p', 'full hd', 'hd'],
    quality_720p: ['720p', 'hd'],
    
    // Idioma
    dubbed: ['dublado', 'dub', 'português', 'pt-br', 'brasileiro'],
    subtitled: ['legendado', 'leg', 'legenda', 'subtitle'],
    dual: ['dual', 'dual audio', 'dois áudios'],
    
    // Origem
    brazilian: ['brasileiro', 'nacional', 'brasil', 'br'],
    hollywood: ['hollywood', 'americano', 'eua'],
    
    // Mood/Vibe
    fun: ['divertido', 'legal', 'massa', 'dahora'],
    serious: ['sério', 'profundo', 'reflexivo'],
    family: ['família', 'family', 'infantil', 'criança'],
    adult: ['adulto', 'maduro', '18+']
};

/**
 * Analisa a query do usuário e extrai intenções
 * @param {string} userQuery - Query natural do usuário
 * @returns {Object} - Intenções detectadas
 */
function analyzeIntent(userQuery) {
    const query = userQuery.toLowerCase();
    const intents = {
        genres: [],
        quality: null,
        language: [],
        origin: null,
        mood: [],
        keywords: []
    };
    
    // Detectar gêneros
    for (const [genre, patterns] of Object.entries(INTENT_PATTERNS)) {
        if (genre.startsWith('quality_')) continue;
        if (genre === 'dubbed' || genre === 'subtitled' || genre === 'dual') continue;
        if (genre === 'brazilian' || genre === 'hollywood') continue;
        if (genre === 'fun' || genre === 'serious' || genre === 'family' || genre === 'adult') continue;
        
        for (const pattern of patterns) {
            if (query.includes(pattern)) {
                intents.genres.push(genre);
                break;
            }
        }
    }
    
    // Detectar qualidade
    if (INTENT_PATTERNS.quality_4k.some(p => query.includes(p))) intents.quality = '4K';
    else if (INTENT_PATTERNS.quality_1080p.some(p => query.includes(p))) intents.quality = '1080p';
    else if (INTENT_PATTERNS.quality_720p.some(p => query.includes(p))) intents.quality = '720p';
    
    // Detectar idioma
    if (INTENT_PATTERNS.dubbed.some(p => query.includes(p))) intents.language.push('dubbed');
    if (INTENT_PATTERNS.subtitled.some(p => query.includes(p))) intents.language.push('subtitled');
    if (INTENT_PATTERNS.dual.some(p => query.includes(p))) intents.language.push('dual');
    
    // Detectar origem
    if (INTENT_PATTERNS.brazilian.some(p => query.includes(p))) intents.origin = 'brazilian';
    else if (INTENT_PATTERNS.hollywood.some(p => query.includes(p))) intents.origin = 'hollywood';
    
    // Detectar mood
    if (INTENT_PATTERNS.fun.some(p => query.includes(p))) intents.mood.push('fun');
    if (INTENT_PATTERNS.serious.some(p => query.includes(p))) intents.mood.push('serious');
    if (INTENT_PATTERNS.family.some(p => query.includes(p))) intents.mood.push('family');
    if (INTENT_PATTERNS.adult.some(p => query.includes(p))) intents.mood.push('adult');
    
    // Extrair palavras-chave (nomes de filmes, atores, etc)
    const stopWords = ['quero', 'ver', 'assistir', 'filme', 'série', 'um', 'uma', 'de', 'pra', 'para', 'com'];
    const words = query.split(/\s+/).filter(w => w.length > 2 && !stopWords.includes(w));
    
    // Remover palavras que já foram detectadas como intenções
    const allPatterns = Object.values(INTENT_PATTERNS).flat();
    intents.keywords = words.filter(w => !allPatterns.includes(w));
    
    return intents;
}

/**
 * Usa IA para melhorar a query baseado na intenção
 * @param {string} userQuery - Query original
 * @param {Object} intents - Intenções detectadas
 * @returns {Promise<string[]>} - Queries otimizadas
 */
async function enhanceQueryWithAI(userQuery, intents) {
    try {
        const prompt = `Você é um especialista em busca de torrents. O usuário pediu: "${userQuery}"

Intenções detectadas:
- Gêneros: ${intents.genres.join(', ') || 'nenhum'}
- Qualidade: ${intents.quality || 'qualquer'}
- Idioma: ${intents.language.join(', ') || 'qualquer'}
- Origem: ${intents.origin || 'qualquer'}
- Mood: ${intents.mood.join(', ') || 'neutro'}
- Palavras-chave: ${intents.keywords.join(', ') || 'nenhuma'}

Gere 3 queries de busca otimizadas para torrents que atendam essa intenção.
Retorne APENAS as queries, uma por linha, sem numeração ou explicação.
Priorize filmes populares e com bons seeders.`;

        const response = await axios.post('http://localhost:3000/api/ai/chat', {
            message: prompt,
            conversationId: 'semantic-search-' + Date.now()
        }, { timeout: 10000 });

        const aiResponse = response.data.response || '';
        const queries = aiResponse
            .split('\n')
            .map(q => q.trim())
            .filter(q => q.length > 0 && !q.match(/^\d+[\.\)]/)) // Remove numeração
            .slice(0, 3);

        return queries.length > 0 ? queries : [userQuery];
    } catch (error) {
        console.warn('[AI] Falha ao usar IA, usando fallback:', error.message);
        return generateFallbackQueries(userQuery, intents);
    }
}

/**
 * Gera queries de fallback sem IA
 * @param {string} userQuery
 * @param {Object} intents
 * @returns {string[]}
 */
function generateFallbackQueries(userQuery, intents) {
    const queries = [];
    
    // Query base com keywords
    if (intents.keywords.length > 0) {
        let baseQuery = intents.keywords.join(' ');
        
        // Adicionar modificadores
        if (intents.language.includes('dubbed')) baseQuery += ' dublado';
        if (intents.language.includes('dual')) baseQuery += ' dual audio';
        if (intents.quality) baseQuery += ' ' + intents.quality;
        if (intents.origin === 'brazilian') baseQuery += ' nacional';
        
        queries.push(baseQuery);
        
        // Variação com gênero
        if (intents.genres.length > 0) {
            queries.push(`${intents.genres[0]} ${baseQuery}`);
        }
    } else {
        // Query baseada em gênero + modificadores
        const genre = intents.genres[0] || 'movie';
        let query = genre;
        
        if (intents.language.includes('dubbed')) query += ' dublado';
        if (intents.quality) query += ' ' + intents.quality;
        if (intents.origin === 'brazilian') query = 'filme brasileiro';
        
        queries.push(query);
    }
    
    // Sempre incluir query original como fallback
    queries.push(userQuery);
    
    return queries.slice(0, 3);
}

/**
 * Filtra resultados baseado nas intenções
 * @param {Array} results - Resultados da busca
 * @param {Object} intents - Intenções do usuário
 * @returns {Array} - Resultados filtrados e pontuados
 */
function filterByIntent(results, intents) {
    return results.map(result => {
        let intentScore = 0;
        const title = result.title.toLowerCase();
        
        // Pontuação por idioma
        if (intents.language.includes('dubbed') && /dublado|dub|pt-br/i.test(title)) {
            intentScore += 50;
        }
        if (intents.language.includes('dual') && /dual/i.test(title)) {
            intentScore += 40;
        }
        
        // Pontuação por qualidade
        if (intents.quality === '4K' && /4k|2160p|uhd/i.test(title)) {
            intentScore += 30;
        } else if (intents.quality === '1080p' && /1080p/i.test(title)) {
            intentScore += 20;
        }
        
        // Pontuação por origem
        if (intents.origin === 'brazilian' && /nacional|brasil|br/i.test(title)) {
            intentScore += 60;
        }
        
        // Pontuação por keywords
        for (const keyword of intents.keywords) {
            if (title.includes(keyword)) {
                intentScore += 15;
            }
        }
        
        return {
            ...result,
            intentScore,
            totalScore: (result.totalScore || 0) + intentScore
        };
    }).sort((a, b) => b.totalScore - a.totalScore);
}

module.exports = {
    analyzeIntent,
    enhanceQueryWithAI,
    filterByIntent,
    generateFallbackQueries
};
