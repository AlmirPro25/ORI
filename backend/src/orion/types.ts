export interface OrionPeer {
    nodeId: string;
    publicKey: string;
    address: string; // IP:Port ou Domain
    lastSeen: number;
    latency?: number;
    reputationScore: number;
}

export type MessageType = 'HELLO' | 'QUERY' | 'FOUND' | 'UPDATE' | 'SYNC' | 'ANNOUNCE_CONTENT' | 'QUERY_CONTENT';

export interface OrionMessage {
    type: MessageType;
    sourceId: string;
    targetId: string; // '*' para broadcast
    payload: any;
    signature: string;
    timestamp: number;
}

export interface ContentMetadata {
    hash: string; // InfoHash
    title: string;
    size: number;
    seeds: number;
    peers: number;
    category?: string;
    popularity?: number; // Calculado localmente
}

export interface OrionConfig {
    listenPort: number;
    bootstrapNodes: string[];
    enableDHT: boolean;
    storageLimitGB: number;
}
