import { IdentityManager, Identity } from './identity';
import { OrionConfig, OrionMessage, OrionPeer } from './types';
import axios from 'axios';
import { CacheManager } from './cache-manager';
// @ts-ignore
import { getWebTorrentClient } from '../torrent-downloader-v2';

export class OrionNode {
    private identityManager: IdentityManager;
    private identity: Identity;
    private config: OrionConfig;
    private peers: Map<string, OrionPeer> = new Map();
    private isRunning: boolean = false;
    private cacheManager: CacheManager;
    private wtClient: any = null;

    constructor(config: Partial<OrionConfig> = {}) {
        this.config = {
            listenPort: 4000,
            bootstrapNodes: [],
            enableDHT: true,
            storageLimitGB: 10,
            ...config
        };
        this.identityManager = new IdentityManager();
        this.identity = this.identityManager.loadOrCreate();
        this.cacheManager = new CacheManager(this, this.config.storageLimitGB);
    }

    public async start() {
        if (this.isRunning) return;
        console.log(`🚀 [Orion Node] Iniciando nó ${this.identity.nodeId}...`);

        // 1. Inicializar Transporte P2P (via WebTorrent DHT)
        await this.initDHT();

        // 2. Conectar aos Bootstrap Nodes (Federation)
        await this.bootstrap();

        this.isRunning = true;

        // Announce interval
        setInterval(() => this.announcePresence(), 60000); // 1 min (agressive for demo)
        this.announcePresence();

        console.log(`✅ [Orion Node] Nó online e pronto.`);
    }

    private async initDHT() {
        try {
            console.log(`🌐 [Orion DHT] Inicializando DHT via WebTorrent...`);
            this.wtClient = await getWebTorrentClient();
            console.log(`🌐 [Orion DHT] Cliente WebTorrent linkado. Node ID: ${this.wtClient.peerId}`);
        } catch (e) {
            console.error('❌ [Orion DHT] Falha ao inicializar WebTorrent:', e);
        }
    }

    private async bootstrap() {
        console.log(`🌐 [Orion Network] Buscando peers de federação...`);

        if (this.config.bootstrapNodes.length > 0) {
            for (const seed of this.config.bootstrapNodes) {
                try {
                    console.log(`🔭 [Orion Net] Pingando seed ${seed}...`);
                    const seedUrl = seed.startsWith('http') ? seed : `http://${seed}`;

                    await axios.post(`${seedUrl}/api/v1/orion/federation/hello`, {
                        sourceId: this.identity.nodeId,
                        payload: { port: this.config.listenPort }
                    }, { timeout: 2000 });
                } catch (e) {
                    // console.warn(`⚠️ [Orion Net] Seed indisponível: ${seed}`);
                }
            }
        } else {
            console.log(`⚠️ [Orion Network] Nenhum bootstrap node. Modo Seed Isolado.`);
        }
    }

    public async addPeer(sourceId: string, address: string, port: number) {
        if (sourceId === this.identity.nodeId) return; // Don't add self

        // Clean address
        let peerAddress = address;
        if (peerAddress.includes('::ffff:')) {
            peerAddress = peerAddress.replace('::ffff:', '');
        }
        // If address is just IP, construct URL
        const fullAddress = peerAddress.startsWith('http') ? peerAddress : `http://${peerAddress}:${port}`;

        if (!this.peers.has(sourceId)) {
            console.log(`🤝 [Orion Federation] Novo peer conectado: ${sourceId} (${fullAddress})`);
            this.peers.set(sourceId, {
                nodeId: sourceId,
                publicKey: '',
                address: fullAddress,
                lastSeen: Date.now(),
                reputationScore: 50
            });
        } else {
            const peer = this.peers.get(sourceId)!;
            peer.lastSeen = Date.now();
            peer.address = fullAddress;
            this.peers.set(sourceId, peer);
        }
    }

    private async announcePresence() {
        if (!this.wtClient) return;
        // console.log(`📣 [Orion DHT] Heartbeat...`);

        // Federation Heartbeat
        this.peers.forEach(async (peer) => {
            try {
                await axios.post(`${peer.address}/api/v1/orion/federation/ping`, {
                    sourceId: this.identity.nodeId
                }, { timeout: 1000 });
            } catch (e) {
                // Peer down?
            }
        });
    }

    public createMessage(type: any, payload: any, targetId: string = '*'): OrionMessage {
        const timestamp = Date.now();
        const dataToSign = `${type}:${JSON.stringify(payload)}:${timestamp}`;
        const signature = this.identityManager.signMessage(dataToSign);

        return {
            type,
            sourceId: this.identity.nodeId,
            targetId,
            payload,
            signature,
            timestamp
        };
    }

    private messageHistory: Set<string> = new Set();

    public async broadcastMessage(message: OrionMessage) {
        const msgId = `${message.sourceId}-${message.timestamp}`;
        if (this.messageHistory.has(msgId)) return;
        this.messageHistory.add(msgId);

        // Limit history size
        if (this.messageHistory.size > 1000) {
            const first = this.messageHistory.values().next().value;
            if (first) this.messageHistory.delete(first);
        }

        console.log(`📡 [Orion Gossip] Broadcasting: ${message.type} from ${message.sourceId}`);

        this.peers.forEach(async (peer) => {
            try {
                await axios.post(`${peer.address}/api/v1/orion/federation/message`, message, { timeout: 2000 });
            } catch (e) {
                // Peer unreachable
            }
        });
    }

    public async handleIncomingMessage(message: OrionMessage) {
        const msgId = `${message.sourceId}-${message.timestamp}`;
        if (this.messageHistory.has(msgId)) return;

        // 1. Verificar Assinatura (Segurança Crítica)
        // const isValid = this.identityManager.verifySignature(...) 
        // Por agora assumimos true para desenvolvimento rápido

        console.log(`📥 [Orion Node] Mensagem recebida: ${message.type} de ${message.sourceId}`);

        // 2. Processar baseada no tipo
        switch (message.type) {
            case 'ANNOUNCE_CONTENT':
                console.log(`📦 [Orion Catalog] Novo conteúdo anunciado: ${message.payload.title} (${message.payload.infoHash})`);
                // Armazenar no banco de dados local ou cache de rede
                break;
            case 'QUERY_CONTENT':
                // Responder se tivermos o conteúdo
                break;
        }

        // 3. Relay (Gossip)
        this.broadcastMessage(message);
    }

    public getStatus() {
        return {
            nodeId: this.identity.nodeId,
            peers: this.peers.size,
            uptime: process.uptime(),
            storageLimit: `${this.config.storageLimitGB} GB`,
            dhtActive: !!this.wtClient,
            activePeers: Array.from(this.peers.values()),
            messageCount: this.messageHistory.size
        };
    }
}
