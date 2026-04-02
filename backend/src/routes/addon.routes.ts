import express from 'express';
import { AddonService } from '../services/addon.service';

const router = express.Router();

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
        const streams = await AddonService.getStreamsFromAllAddons(type, id, { title });
        res.json(streams);
    } catch (e: any) {
        console.error(`Erro ao buscar streams agregados: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

export const addonRoutes = router;
