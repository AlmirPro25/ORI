export const TRUSTED_PORTUGUESE_CHANNEL_PATTERNS = [
    /porta dos fundos/i,
    /tv cultura/i,
    /canal brasil/i,
    /globoplay/i,
    /globo/i,
    /record/i,
    /sbt/i,
    /prime video brasil/i,
    /netflix brasil/i,
    /disney brasil/i,
    /warner play/i,
    /paramount brasil/i,
    /telecine/i,
    /playplus/i,
    /gshow/i,
    /canal nostalgia/i,
    /omeleteve/i,
    /adoro cinema/i,
    /podpah/i,
    /manual do mundo/i,
];

export const PORTUGUESE_KEYWORD_PATTERNS = [
    /\bdublado\b/i,
    /\blegendado\b/i,
    /\bportugues\b/i,
    /\bportuguês\b/i,
    /\bpt-br\b/i,
    /\bptbr\b/i,
    /\bbrasil\b/i,
    /\bnacional\b/i,
    /\btemporada\b/i,
    /\bepisodio\b/i,
    /\bepisódio\b/i,
    /\bfilme\b/i,
    /\bsérie\b/i,
    /\bserie\b/i,
    /\bnovela\b/i,
    /\banime\b/i,
    /\boficial\b/i,
];

export const GENERIC_LOW_SIGNAL_CHANNEL_PATTERNS = [
    /\bclips?\b/i,
    /\bshorts?\b/i,
    /\bfan\b/i,
    /\breact\b/i,
    /\bmemes?\b/i,
];

export function normalizePortugueseText(value?: string | null) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

export function countPatternMatches(value: string, patterns: RegExp[]) {
    return patterns.reduce((total, pattern) => total + (pattern.test(value) ? 1 : 0), 0);
}
