import { OrionNode } from './node';
import fs from 'fs/promises';
import path from 'path';

/**
 * 🟡 ORION CACHE MANAGER (Edge Layer)
 * Responsável por gerenciar o espaço disponível e decidir o que manter/evictar.
 */
export class CacheManager {
    private node: OrionNode;
    private maxStorage: number; // Bytes
    private storagePath: string;

    constructor(node: OrionNode, maxStorageGB: number) {
        this.node = node;
        this.maxStorage = maxStorageGB * 1024 * 1024 * 1024;
        this.storagePath = path.join(process.cwd(), 'downloads'); // Default folder
    }

    public async checkStorage() {
        try {
            const size = await this.getDirSize(this.storagePath);
            const usagePercent = (size / this.maxStorage) * 100;

            console.log(`🟡 [Orion Cache] Storage: ${(size / 1024 / 1024 / 1024).toFixed(2)} GB / ${(this.maxStorage / 1024 / 1024 / 1024).toFixed(2)} GB (${usagePercent.toFixed(1)}%)`);

            if (size > this.maxStorage) {
                await this.evictContent(size - this.maxStorage);
            }
        } catch (error) {
            console.warn('⚠️ [Orion Cache] Falha ao verificar storage:', error);
        }
    }

    public async trackAccess(contentHash: string) {
        // LRU logic here: update 'lastAccessed' timestamp in DB or local map
        console.log(`🟡 [Orion Cache] Conteúdo acessado (Hit): ${contentHash}`);
    }

    private async getDirSize(dir: string): Promise<number> {
        let size = 0;
        try {
            const files = await fs.readdir(dir, { withFileTypes: true });
            for (const file of files) {
                const filePath = path.join(dir, file.name);
                if (file.isDirectory()) {
                    size += await this.getDirSize(filePath);
                } else {
                    const stats = await fs.stat(filePath);
                    size += stats.size;
                }
            }
        } catch (e) {
            // Ignore missing dirs
        }
        return size;
    }

    private async evictContent(bytesToFree: number) {
        console.log(`🧹 [Orion Cache] Storage cheio! Tentando liberar ${(bytesToFree / 1024 / 1024).toFixed(2)} MB...`);
        // Aqui entraria a regra de eviction: deletar arquivos mais antigos (LRU)
        // Por segurança, apenas logamos por enquanto.
        console.log(`⚠️ [Orion Cache] Eviction Policy: Not yet deleting files (Safety Mode).`);
    }
}
