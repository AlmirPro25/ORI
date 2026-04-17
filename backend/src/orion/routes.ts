import { Router } from 'express';
import { orionNode } from './service';

const router = Router();

// Rota pública para verificar status do nó
router.get('/status', (req, res) => {
    try {
        const status = orionNode.getStatus();
        res.json({
            status: 'online',
            ...status
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Identidade do nó (Chave pública, ID)
router.get('/identity', (req, res) => {
    try {
        // @ts-ignore - Acessando propriedade privada via getter (se tiver) ou assumindo acesso restrito
        // Na prática, vamos expor via método público no Node se precisar
        // Por enquanto, vamos pegar do getStatus se tiver, ou implementar um getter no node
        const status = orionNode.getStatus();
        res.json({
            nodeId: status.nodeId,
            // publicKey seria bom expor também
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Hello World da Federação (Handshake)
router.post('/federation/hello', (req, res) => {
    const { sourceId, payload } = req.body;
    // Pega o IP do request se não enviado no payload
    const ip = req.socket.remoteAddress || 'unknown';
    const port = payload?.port || 3000; // Assume default if missing

    orionNode.addPeer(sourceId, ip, port);

    console.log(`🤝 [Orion Federation] Handshake recebido de ${sourceId}`);
    res.json({ message: 'Hello acknowledged', targetId: orionNode.getStatus().nodeId });
});

router.post('/federation/ping', (req, res) => {
    const { sourceId } = req.body;
    // Just update last seen
    // orionNode.updatePeer(sourceId);
    res.json({ pong: true });
});

router.post('/federation/message', async (req, res) => {
    try {
        const message = req.body;
        await orionNode.handleIncomingMessage(message);
        res.json({ acknowledged: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Publicar conteúdo na rede (Manual/Debug)
router.post('/publish', async (req, res) => {
    try {
        const { title, infoHash } = req.body;
        const msg = orionNode.createMessage('ANNOUNCE_CONTENT', { title, infoHash });
        await orionNode.broadcastMessage(msg);
        res.json({ success: true, message: 'Content announced to federation' });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export const orionRoutes = router;
