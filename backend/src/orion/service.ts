import { OrionNode } from './node';

class OrionService {
    private static instance: OrionNode;

    public static getInstance(): OrionNode {
        if (!OrionService.instance) {
            OrionService.instance = new OrionNode({
                listenPort: parseInt(process.env.ORION_PORT || '4000'),
                bootstrapNodes: process.env.ORION_BOOTSTRAP_NODES ? process.env.ORION_BOOTSTRAP_NODES.split(',') : []
            });
        }
        return OrionService.instance;
    }
}

export const orionNode = OrionService.getInstance();
