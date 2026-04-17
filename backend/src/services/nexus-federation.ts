/**
 * 🛰️ NEXUS FEDERATION SERVICE
 * 
 * Coordenação entre organismos autônomos.
 * Transforma nós isolados em um ecossistema de mídia.
 */

import { DownloadGovernor } from './download-governor';
import { ConsumptionAnalytics } from './consumption-analytics';

export interface NexusPeer {
    nodeId: string;
    concurrency: number;
    sc: number;
    healthScore: number;
    stabilizationMode: boolean;
    avgTTFF: number;
    lastSeen: number;
}

class NexusFederationService {
    private peers = new Map<string, NexusPeer>();
    private leaseHolders = new Map<string, number>(); // userId -> timestamp

    /**
     * PROCESSAR HEARTBEAT REMOTO
     */
    async processHeartbeat(heartbeat: NexusPeer) {
        this.peers.set(heartbeat.nodeId, {
            ...heartbeat,
            lastSeen: Date.now()
        });
    }

    /**
     * ADMISSION: Decide se podemos aceitar um usuário federado
     */
    async requestAdmission(userId: string): Promise<{ allowed: boolean; reason: string }> {
        // Enforce Lease (Para evitar oscilação entre nós)
        const lease = this.leaseHolders.get(userId);
        if (lease && Date.now() - lease < 60000) { // 60s lease
            return { allowed: true, reason: '🛡️ LEASE ACTIVE: User already anchored to this node.' };
        }

        const decision = await DownloadGovernor.canAcceptFederatedTraffic();

        if (decision.allowed) {
            this.leaseHolders.set(userId, Date.now());
            ConsumptionAnalytics.trackRequest(false); // Track as non-local (federated)
        }

        return decision;
    }

    /**
     * FED_HEAT: Calcula o calor federado considerando o Trust Factor
     */
    async getFederatedHeat(episodeId: string, remoteNodeId: string, remoteHeat: number): Promise<number> {
        const trustFactor = await ConsumptionAnalytics.getRemoteTrustFactor(remoteNodeId);
        const federatedHeat = remoteHeat * trustFactor;

        console.log(`📡 [Nexus] Remote Heat Signal: Node ${remoteNodeId} -> ${episodeId} (${remoteHeat} pts) * Trust ${trustFactor.toFixed(1)} = ${federatedHeat.toFixed(1)}`);

        return federatedHeat;
    }

    /**
     * STATUS: Visão geral da rede conhecida
     */
    getNetworkStatus() {
        const activePeers = Array.from(this.peers.values()).filter(p => Date.now() - p.lastSeen < 30000);
        return {
            peerCount: activePeers.length,
            peers: activePeers,
            localSatisfactionRatio: ConsumptionAnalytics.getSatisfactionRatio()
        };
    }
}

export const NexusFederation = new NexusFederationService();
