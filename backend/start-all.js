/**
 * Script para iniciar todos os servidores necessarios:
 * - Backend principal (porta 3000)
 * - Torrent Gateway (porta 3333)
 *
 * Se uma porta ja estiver em uso, assume que o servico correspondente
 * ja esta rodando e apenas pula a inicializacao.
 */

const { spawn } = require('child_process');
const net = require('net');

const BACKEND_PORT = 3000;
const GATEWAY_PORT = 3333;
const START_DELAY_MS = 2000;
const children = [];

console.log('Iniciando todos os servidores...\n');

function isPortFree(port) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let resolved = false;

        const finalize = (value) => {
            if (resolved) {
                return;
            }

            resolved = true;
            socket.destroy();
            resolve(value);
        };

        socket.setTimeout(1000);

        socket.once('connect', () => finalize(false));
        socket.once('timeout', () => finalize(true));
        socket.once('error', (err) => {
            if (err.code === 'ECONNREFUSED') {
                finalize(true);
                return;
            }

            console.warn(`[WARN] Falha ao verificar porta ${port}: ${err.message}`);
            finalize(false);
        });

        socket.connect(port, '127.0.0.1');
    });
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function spawnService(label, command, args) {
    const child = spawn(command, args, {
        cwd: __dirname,
        stdio: 'inherit',
        shell: true
    });

    children.push(child);

    child.on('error', (err) => {
        console.error(`[ERRO] Falha ao iniciar ${label}:`, err);
    });

    child.on('exit', (code, signal) => {
        if (signal) {
            console.log(`[INFO] ${label} encerrado por sinal ${signal}.`);
            return;
        }

        if (code !== 0) {
            console.warn(`[WARN] ${label} terminou com codigo ${code}.`);
        }
    });

    return child;
}

async function main() {
    const gatewayFree = await isPortFree(GATEWAY_PORT);
    const backendFree = await isPortFree(BACKEND_PORT);

    if (gatewayFree) {
        console.log(`[START] Subindo Torrent Gateway na porta ${GATEWAY_PORT}...`);
        spawnService('Torrent Gateway', 'node', ['torrent-gateway.mjs']);
    } else {
        console.log(`[SKIP] Porta ${GATEWAY_PORT} ja esta em uso. Gateway aparentemente ja esta rodando.`);
    }

    if (backendFree) {
        if (gatewayFree) {
            await wait(START_DELAY_MS);
        }

        console.log(`[START] Subindo Backend na porta ${BACKEND_PORT}...`);
        spawnService('Backend', 'npm', ['run', 'dev']);
    } else {
        console.log(`[SKIP] Porta ${BACKEND_PORT} ja esta em uso. Backend aparentemente ja esta rodando.`);
    }

    if (!gatewayFree && !backendFree) {
        console.log('\nNenhum servico foi iniciado porque backend e gateway ja estavam ativos.');
        process.exit(0);
    }
}

function shutdown() {
    console.log('\nEncerrando servicos iniciados por este processo...');

    for (const child of children) {
        if (!child.killed) {
            child.kill();
        }
    }

    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((err) => {
    console.error('[FATAL] Falha ao iniciar stack local:', err);
    process.exit(1);
});
