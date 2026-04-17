const ADULT_PATTERNS = [
    /\bxxx\b/i,
    /\bporn\b/i,
    /\bporno\b/i,
    /\bsex\b/i,
    /\bhentai\b/i,
    /\bonlyfans\b/i,
    /\bbrasileirinhas\b/i,
    /\badulto\b/i,
];

function normalize(value?: string | null) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function levenshtein(a: string, b: string) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    const matrix = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

    for (let i = 1; i <= a.length; i += 1) {
        for (let j = 1; j <= b.length; j += 1) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost,
            );
        }
    }

    return matrix[a.length][b.length];
}

function similarity(a: string, b: string) {
    const left = normalize(a);
    const right = normalize(b);
    if (!left || !right) return 0;
    const distance = levenshtein(left, right);
    return 1 - (distance / Math.max(left.length, right.length, 1));
}

export function isJunkResult(title?: string | null) {
    const normalized = normalize(title);
    if (!normalized) return true;
    return ADULT_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function classifyMediaShape(title?: string | null) {
    const normalized = normalize(title);
    if (!normalized) return 'unknown' as const;
    if (/\bpack\b|\bseason\b|\btemporada\b|\bcomplete\b|\bcompleta\b/.test(normalized)) return 'pack' as const;
    if (ADULT_PATTERNS.some((pattern) => pattern.test(normalized))) return 'junk' as const;
    return 'media' as const;
}

export function computeResultRelevance(params: {
    query: string;
    resultTitle?: string | null;
    seeds?: number | null;
    peers?: number | null;
    hasPTBRAudio?: boolean;
    hasPTBRSubs?: boolean;
}) {
    const resultTitle = String(params.resultTitle || '');
    const seeds = Math.max(0, Number(params.seeds || 0));
    const peers = Math.max(0, Number(params.peers || 0));
    const titleSimilarity = similarity(params.query, resultTitle);
    const tokenMatch = normalize(params.query)
        .split(/\s+/)
        .filter((token) => token.length > 2)
        .reduce((score, token) => score + (normalize(resultTitle).includes(token) ? 1 : 0), 0);
    const languageConfidence = params.hasPTBRAudio ? 1 : params.hasPTBRSubs ? 0.6 : 0.1;

    const score = (seeds * 0.5)
        + (peers * 0.2)
        + (Math.max(titleSimilarity, Math.min(1, tokenMatch / 4)) * 100 * 0.2)
        + (languageConfidence * 100 * 0.1);

    return {
        score: Math.round(score),
        titleSimilarity,
        tokenMatch,
    };
}
