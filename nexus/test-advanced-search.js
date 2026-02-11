/**
 * Script de Teste do Motor de Busca Avançado
 * Testa todos os providers e modos de busca
 */

const NexusAdvancedSearch = require('./advanced-search');

async function testAdvancedSearch() {
    console.log('\n🧪 TESTE DO MOTOR DE BUSCA AVANÇADO\n');
    console.log('═'.repeat(60));

    const search = new NexusAdvancedSearch();

    // 1. Listar Providers
    console.log('\n📋 PROVIDERS DISPONÍVEIS:\n');
    const providers = search.listProviders();
    console.log(`Total: ${providers.total}`);
    console.log(`Ativos: ${providers.activeCount}`);
    console.log(`Lista: ${providers.active.join(', ')}\n`);

    // 2. Teste de Busca Simples
    console.log('═'.repeat(60));
    console.log('\n🔍 TESTE 1: Busca Simples (Big Buck Bunny)\n');

    try {
        const results1 = await search.search('Big Buck Bunny', 'Movies', 3);
        console.log(`✅ Resultados encontrados: ${results1.length}\n`);

        results1.slice(0, 3).forEach((r, i) => {
            console.log(`${i + 1}. ${r.title}`);
            console.log(`   Provider: ${r.provider}`);
            console.log(`   Seeds: ${r.seeds} | Peers: ${r.peers}`);
            console.log(`   Size: ${r.size}`);
            console.log(`   Magnet: ${r.magnetLink.substring(0, 60)}...`);
            console.log('');
        });
    } catch (e) {
        console.error(`❌ Erro no Teste 1: ${e.message}`);
    }

    // 3. Teste de Busca Paralela
    console.log('═'.repeat(60));
    console.log('\n⚡ TESTE 2: Busca Paralela (Sintel)\n');

    try {
        const results2 = await search.parallelSearch('Sintel', 'Movies', 2);
        console.log(`✅ Resultados únicos: ${results2.length}\n`);

        results2.slice(0, 3).forEach((r, i) => {
            console.log(`${i + 1}. ${r.title}`);
            console.log(`   Provider: ${r.provider}`);
            console.log(`   Seeds: ${r.seeds}`);
            console.log('');
        });
    } catch (e) {
        console.error(`❌ Erro no Teste 2: ${e.message}`);
    }

    // 4. Teste de Provider Específico
    console.log('═'.repeat(60));
    console.log('\n🎯 TESTE 3: Busca em Provider Específico (YTS)\n');

    try {
        const results3 = await search.searchProvider('Matrix', 'Yts', 'Movies', 3);
        console.log(`✅ Resultados do YTS: ${results3.length}\n`);

        results3.slice(0, 2).forEach((r, i) => {
            console.log(`${i + 1}. ${r.title}`);
            console.log(`   Seeds: ${r.seeds} | Size: ${r.size}`);
            console.log('');
        });
    } catch (e) {
        console.error(`❌ Erro no Teste 3: ${e.message}`);
    }

    console.log('═'.repeat(60));
    console.log('\n✅ TESTES CONCLUÍDOS!\n');
}

// Executar testes
testAdvancedSearch().catch(console.error);
