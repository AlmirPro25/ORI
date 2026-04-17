type QueryPlanParams = {
    title?: string | null;
    originalTitle?: string | null;
    seasonNumber?: number | null;
    episodeNumber?: number | null;
    preferPortugueseAudio?: boolean;
};

export type PtBrQueryPlan = {
    canonicalTitle: string;
    aliases: string[];
    searchVariants: string[];
    preferSeasonPack: boolean;
};

function normalize(value?: string | null) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .toLowerCase()
        .trim();
}

function unique(values: Array<string | null | undefined>) {
    return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

export class PtBrQueryPlanner {
    static build(params: QueryPlanParams): PtBrQueryPlan {
        const title = String(params.title || '').trim();
        const originalTitle = String(params.originalTitle || '').trim();
        const season = Number.isFinite(Number(params.seasonNumber)) ? Number(params.seasonNumber) : null;
        const episode = Number.isFinite(Number(params.episodeNumber)) ? Number(params.episodeNumber) : null;
        const episodeCode = season !== null && episode !== null
            ? `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
            : '';
        const altEpisodeCode = season !== null && episode !== null
            ? `${season}x${episode}`
            : '';

        const aliases = unique([
            title,
            originalTitle,
            normalize(title),
            normalize(originalTitle),
            title.replace(/[:,]/g, ' '),
            originalTitle.replace(/[:,]/g, ' '),
        ]);

        const baseTitles = unique([title, originalTitle]).filter(Boolean);
        const ptBrSuffixes = params.preferPortugueseAudio === false
            ? ['legendado', 'pt-br']
            : ['dublado', 'dual audio', 'pt-br', 'portugues'];

        const searchVariants = unique(baseTitles.flatMap((baseTitle) => {
            const variants = [
                baseTitle,
                ...ptBrSuffixes.map((suffix) => `${baseTitle} ${suffix}`),
            ];

            if (episodeCode && altEpisodeCode) {
                variants.push(
                    `${baseTitle} ${episodeCode}`,
                    `${baseTitle} ${altEpisodeCode}`,
                    `${baseTitle} ${episodeCode} dublado`,
                    `${baseTitle} ${altEpisodeCode} dublado`,
                );
            }

            if (season !== null) {
                variants.push(
                    `${baseTitle} temporada ${season} dublado`,
                    `${baseTitle} season ${season} dual audio`,
                    `${baseTitle} temporada ${season} pt-br`,
                );
            }

            return variants;
        }));

        return {
            canonicalTitle: title || originalTitle || aliases[0] || '',
            aliases,
            searchVariants,
            preferSeasonPack: season !== null,
        };
    }
}
