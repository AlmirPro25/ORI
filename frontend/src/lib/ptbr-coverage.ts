import { DiscoveryItem } from '@/types/discovery';

export type PtbrCoverageHint = {
    tone: 'strong' | 'subtitle' | 'weak';
    label: string;
    detail?: string;
};

export type PtbrSignalSummary = {
    label: string;
    detail: string;
    tone: 'strong' | 'subtitle' | 'weak';
    sourceLabel: string;
    confidenceLabel: string;
    samplesLabel?: string;
    reasons: string[];
};

export const getPtbrCoverageHint = (
    item?: Pick<DiscoveryItem, 'ptbrCoverageLabel' | 'isPortuguese' | 'ptbrConfidenceSource' | 'coverageSamples'> | null
): PtbrCoverageHint | null => {
    if (!item) return null;

    const validatedByTelemetry = item.ptbrConfidenceSource === 'telemetry' && Number(item.coverageSamples || 0) >= 3;

    if (item.ptbrCoverageLabel === 'strong') {
        return {
            tone: 'strong',
            label: validatedByTelemetry ? 'PT-BR validado' : 'PT-BR forte',
            detail: validatedByTelemetry ? `Base real: ${Number(item.coverageSamples || 0)} amostras` : undefined,
        };
    }

    if (item.ptbrCoverageLabel === 'subtitle') {
        return {
            tone: 'subtitle',
            label: validatedByTelemetry ? 'Legenda validada' : 'Mais legenda',
            detail: validatedByTelemetry ? `Base real: ${Number(item.coverageSamples || 0)} amostras` : undefined,
        };
    }

    if (item.ptbrCoverageLabel === 'weak') {
        return { tone: 'weak', label: 'Cobertura instavel' };
    }

    if (item.isPortuguese) {
        return { tone: 'subtitle', label: 'PT-BR em foco' };
    }

    return null;
};

export const getPtbrSignalSummary = (
    item?: Pick<DiscoveryItem, 'ptbrCoverageLabel' | 'ptbrConfidence' | 'ptbrConfidenceSource' | 'coverageSamples' | 'isPortuguese' | 'ptbrScoreReasons'> | null
): PtbrSignalSummary | null => {
    const hint = getPtbrCoverageHint(item);
    if (!hint || !item) return null;

    const confidence = `${Math.round(Number(item.ptbrConfidence || 0) * 100)}%`;
    const sourceLabel = item.ptbrConfidenceSource === 'telemetry'
        ? 'Base aprendida'
        : item.ptbrConfidenceSource === 'editorial'
            ? 'Sinal editorial'
            : 'Sem base';
    const samplesLabel = item.ptbrConfidenceSource === 'telemetry' && Number(item.coverageSamples || 0) > 0
        ? `${Number(item.coverageSamples || 0)} amostras`
        : '';

    return {
        tone: hint.tone,
        label: hint.label,
        detail: `${sourceLabel} | confianca ${confidence}${samplesLabel ? ` | ${samplesLabel}` : ''}`,
        sourceLabel,
        confidenceLabel: confidence,
        samplesLabel: samplesLabel || undefined,
        reasons: Array.isArray(item.ptbrScoreReasons) ? item.ptbrScoreReasons.slice(0, 3) : [],
    };
};
