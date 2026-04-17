/**
 * 🤖 ROTAS DO CHAT COM IA
 */

import { Router } from 'express';
import { AIChatService } from './ai-chat-service';

const router = Router();

/**
 * POST /api/ai-chat
 * Envia mensagem e recebe resposta + ação
 */
router.post('/', async (req, res) => {
    try {
        const { message, history } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Mensagem é obrigatória' });
        }

        const response = await AIChatService.chat(message, history || []);
        res.json(response);

    } catch (error: any) {
        console.error('❌ Erro no chat:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/ai-chat/suggestions
 * Retorna sugestões de comandos
 */
router.get('/suggestions', (req, res) => {
    const suggestions = AIChatService.getSuggestions();
    res.json({ suggestions });
});

export default router;
