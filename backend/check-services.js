/**
 * Script de diagnóstico para verificar se todos os serviços estão rodando
 */

const http = require('http');

const services = [
    { name: 'Backend Principal', url: 'http://localhost:3000/health' },
    { name: 'Torrent Gateway', url: 'http://localhost:3333/health' }
];

console.log('🔍 Verificando serviços...\n');

async function checkService(service) {
    return new Promise((resolve) => {
        const url = new URL(service.url);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'GET',
            timeout: 3000
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    console.log(`✅ ${service.name} - ONLINE`);
                    try {
                        const json = JSON.parse(data);
                        console.log(`   Detalhes:`, json);
                    } catch (e) {
                        console.log(`   Status: ${res.statusCode}`);
                    }
                } else {
                    console.log(`⚠️  ${service.name} - Respondeu com status ${res.statusCode}`);
                }
                resolve(true);
            });
        });

        req.on('error', (err) => {
            console.log(`❌ ${service.name} - OFFLINE`);
            console.log(`   Erro: ${err.message}`);
            resolve(false);
        });

        req.on('timeout', () => {
            console.log(`⏱️  ${service.name} - TIMEOUT`);
            req.destroy();
            resolve(false);
        });

        req.end();
    });
}

async function checkAll() {
    for (const service of services) {
        await checkService(service);
        console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('💡 Se algum serviço estiver offline:');
    console.log('   1. Execute: npm run dev:all');
    console.log('   2. Ou inicie separadamente:');
    console.log('      - npm run gateway (Terminal 1)');
    console.log('      - npm run dev (Terminal 2)');
    console.log('');
}

checkAll();
