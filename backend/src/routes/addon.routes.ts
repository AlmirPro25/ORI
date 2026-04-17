import express from 'express';
import { PrismaClient } from '@prisma/client';
import { AddonService } from '../services/addon.service';
import { SourceDiscoveryService } from '../services/source-discovery.service';

const router = express.Router();
const prisma = new PrismaClient();

function normalizeText(value?: string | null) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function parseHeuristicScore(raw?: string | null) {
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

async function annotateStreamsWithArconteSignals(type: string, streams: any[]) {
    const addonNames = Array.from(new Set(
        streams
            .map((stream) => String(stream.addonName || stream.provider || '').trim())
            .filter(Boolean)
    ));

    if (!addonNames.length) {
        return streams;
    }

    const keys = addonNames.map((name) => `arconte:heuristic:addon:${type}:${normalizeText(name)}`);
    const rows = await prisma.systemStats.findMany({
        where: { key: { in: keys } },
    }).catch(() => []);

    const scoreMap = new Map<string, any>();
    for (const row of rows) {
        scoreMap.set(row.key, parseHeuristicScore(row.valueString));
    }

    return streams.map((stream) => {
        const addonName = String(stream.addonName || stream.provider || '').trim();
        const score = scoreMap.get(`arconte:heuristic:addon:${type}:${normalizeText(addonName)}`);
        const wins = Number(score?.wins || 0);
        const ptBrWins = Number(score?.ptBrWins || 0);
        const avgAvailability = wins > 0 ? Number(score?.totalAvailability || 0) / wins : 0;
        const trustLevel = ptBrWins >= 3 || avgAvailability >= 70
            ? 'high'
            : wins >= 2 || avgAvailability >= 35
                ? 'medium'
                : wins >= 1
                    ? 'low'
                    : null;

        return {
            ...stream,
            arconteSignal: score ? {
                wins,
                ptBrWins,
                avgAvailability: Math.round(avgAvailability),
                trustLevel,
                label: trustLevel === 'high'
                    ? 'Arconte confia neste addon'
                    : trustLevel === 'medium'
                        ? 'Addon com bom historico'
                        : trustLevel === 'low'
                            ? 'Primeiros sinais positivos'
                            : null,
            } : null,
        };
    });
}

router.get('/', async (_req, res) => {
    try {
        const addons = await AddonService.listAddons();
        res.json(addons);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/install', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ error: 'URL do manifesto e obrigatoria.' });
        }
        const result = await AddonService.installAddon(url);
        res.json({ success: true, addon: result });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

router.post('/discover', async (req, res) => {
    try {
        const searchTerms = Array.isArray(req.body?.searchTerms)
            ? req.body.searchTerms.map((item: unknown) => String(item || '').trim()).filter(Boolean)
            : [];
        const limit = Number(req.body?.limit || 8);
        const result = await SourceDiscoveryService.discoverAndInstall({ searchTerms, limit });
        res.json({ success: true, ...result });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await AddonService.removeAddon(req.params.id);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/streams/:type/:id', async (req, res) => {
    try {
        const { type, id } = req.params;
        const title = typeof req.query.title === 'string' ? req.query.title : undefined;
        const preferPortugueseAudio = req.query.preferPortugueseAudio === 'true';
        const acceptPortugueseSubtitles = req.query.acceptPortugueseSubtitles !== 'false';
        const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
        let streams = await AddonService.getStreamsFromAllAddons(type, id, {
            title,
            preferPortugueseAudio,
            acceptPortugueseSubtitles,
            userId,
        });

        const ptFriendlyStreams = streams.filter((stream: any) => {
            const text = normalizeText([
                stream?.title,
                stream?.name,
                stream?.description,
                stream?.behaviorHints?.filename,
            ].filter(Boolean).join(' '));

            return /\bdublado\b|\bpt-br\b|\bptbr\b|\bportugues\b|\bportuguese\b|\blegendado\b|\blegenda pt\b|\bsub pt\b/.test(text);
        });

        if (type === 'series' && title && ptFriendlyStreams.length === 0) {
            const discoveryResult = await SourceDiscoveryService.discoverAndInstall({
                searchTerms: [title, `${title} pt-br`, `${title} dublado`],
                limit: 6,
            });

            if (discoveryResult.installed.length > 0) {
                streams = await AddonService.getStreamsFromAllAddons(type, id, {
                    title,
                    preferPortugueseAudio,
                    acceptPortugueseSubtitles,
                    userId,
                    forceRefresh: true,
                });
            }
        }

        const annotated = await annotateStreamsWithArconteSignals(type, streams);
        res.json(annotated);
    } catch (e: any) {
        console.error(`Erro ao buscar streams agregados: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

export const addonRoutes = router;
