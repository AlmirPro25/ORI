
import express from 'express';
import { AddonService } from '../services/addon.service';

const router = express.Router();

/**
 * Listar Addons Instalados
 */
router.get('/', async (req, res) => {
    try {
        const addons = await AddonService.listAddons();
        res.json(addons);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * Instalar Addon
 */
router.post('/install', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ error: 'URL do manifesto é obrigatória.' });
        }
        const result = await AddonService.installAddon(url);
        res.json({ success: true, addon: result });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

/**
 * Remover Addon
 */
router.delete('/:id', async (req, res) => {
    try {
        await AddonService.removeAddon(req.params.id);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * Buscar Streams de Todos os Addons (Agregador)
 */
router.get('/streams/:type/:id', async (req, res) => {
    try {
        const { type, id } = req.params;
        console.log(`📡 Buscando streams agregados para: ${type} ${id}`);
        // Paralelizar com timeout
        const streams = await AddonService.getStreamsFromAllAddons(type, id);
        res.json(streams);
    } catch (e: any) {
        console.error(`Erro ao buscar streams agregados: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

export const addonRoutes = router;
