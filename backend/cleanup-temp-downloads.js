/**
 * 🧹 CLEANUP TEMP DOWNLOADS
 * 
 * Remove arquivos temporários de downloads antigos do sistema.
 * Mantém apenas arquivos acessados nas últimas 2 horas.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
const MAX_AGE_HOURS = 2; // Manter apenas arquivos das últimas 2 horas
const MAX_AGE_MS = MAX_AGE_HOURS * 60 * 60 * 1000;

async function getDirectorySize(dirPath) {
    let totalSize = 0;
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                totalSize += await getDirectorySize(fullPath);
            } else {
                const stats = await fs.stat(fullPath);
                totalSize += stats.size;
            }
        }
    } catch (err) {
        // Ignora erros de acesso
    }
    return totalSize;
}

async function cleanupOldDownloads() {
    console.log('🧹 [Cleanup] Iniciando limpeza de downloads temporários...');
    
    try {
        const exists = await fs.access(DOWNLOADS_DIR).then(() => true).catch(() => false);
        if (!exists) {
            console.log('✅ [Cleanup] Pasta de downloads não existe. Nada a limpar.');
            return;
        }

        const entries = await fs.readdir(DOWNLOADS_DIR, { withFileTypes: true });
        const now = Date.now();
        let removedCount = 0;
        let freedSpace = 0;

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            const dirPath = path.join(DOWNLOADS_DIR, entry.name);
            
            try {
                const stats = await fs.stat(dirPath);
                const ageMs = now - stats.mtimeMs;

                if (ageMs > MAX_AGE_MS) {
                    const size = await getDirectorySize(dirPath);
                    await fs.rm(dirPath, { recursive: true, force: true });
                    removedCount++;
                    freedSpace += size;
                    console.log(`🗑️  [Cleanup] Removido: ${entry.name} (${(size / 1024 / 1024).toFixed(2)} MB, idade: ${(ageMs / 1000 / 60).toFixed(0)} min)`);
                }
            } catch (err) {
                console.warn(`⚠️  [Cleanup] Erro ao processar ${entry.name}:`, err.message);
            }
        }

        if (removedCount > 0) {
            console.log(`✅ [Cleanup] Limpeza concluída: ${removedCount} pasta(s) removida(s), ${(freedSpace / 1024 / 1024).toFixed(2)} MB liberados`);
        } else {
            console.log('✅ [Cleanup] Nenhum arquivo antigo encontrado.');
        }
    } catch (err) {
        console.error('❌ [Cleanup] Erro na limpeza:', err.message);
    }
}

// Executar limpeza
cleanupOldDownloads().then(() => {
    console.log('🎬 [Cleanup] Processo finalizado.');
    process.exit(0);
}).catch(err => {
    console.error('❌ [Cleanup] Falha crítica:', err);
    process.exit(1);
});
