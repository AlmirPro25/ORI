/**
 * Script para iniciar todos os servidores necessários
 * - Backend principal (porta 3000)
 * - Torrent Gateway (porta 3333)
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Iniciando todos os servidores...\n');

// 1. Iniciar Torrent Gateway
const gateway = spawn('node', ['torrent-gateway.mjs'], {
    cwd: __dirname,
    stdio: 'inherit',
    shell: true
});

gateway.on('error', (err) => {
    console.error('❌ Erro ao iniciar Gateway:', err);
});

// 2. Iniciar Backend Principal (aguardar 2 segundos)
setTimeout(() => {
    const backend = spawn('npm', ['run', 'dev'], {
        cwd: __dirname,
        stdio: 'inherit',
        shell: true
    });

    backend.on('error', (err) => {
        console.error('❌ Erro ao iniciar Backend:', err);
    });
}, 2000);

// Cleanup ao fechar
process.on('SIGINT', () => {
    console.log('\n🛑 Encerrando todos os servidores...');
    gateway.kill();
    process.exit(0);
});
