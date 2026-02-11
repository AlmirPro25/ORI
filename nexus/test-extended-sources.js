/**
 * Teste das Fontes Estendidas
 * Valida YTS, EZTV, Nyaa.si e BitSearch
 */

const ExtendedSources = require('./extended-sources');

async function testExtendedSources() {
    console.log('\n🧪 TESTE DAS FONTES ESTENDIDAS\n');
    console.log('═'.repeat(60));

    const sources = new ExtendedSources();

    // Listar fontes
    console.log('\n📋 FONTES DISPONÍVEIS:\n');
    const list = sources.listSources();
    console.log(`Total: ${list.total} | Ativas: ${list.active}\n`);
    list.sources.forEach(s => {
        console.log(`  ✅ ${s.name.padEnd(20)} | ${s.category.padEnd(10)} | Qualidade: ${s.quality}`);
    });

    // Teste 1: YTS (Filmes)
    console.log('\n' + '═'.repeat(60));
    console.log('\n🎬 TESTE 1: YTS (Filmes em HD)\n');
    try {
        const yts = await sources.searchYTS('Matrix', 3);
        console.log(`✅ Encontrados ${yts.length} resultados\n`);
        yts.slice(0, 2).forEach((r, i) => {
            console.log(`${i + 1}. ${r.title}`);
            console.log(`   Seeds: ${r.seeds} | Size: ${r.size} | Rating: ${r.rating}`);
            console.log('');
        });
    } catch (e) {
        console.error(`❌ Erro: ${e.message}`);
    }

    // Teste 2: EZTV (Séries)
    console.log('═'.repeat(60));
    console.log('\n📺 TESTE 2: EZTV (Séries de TV)\n');
    try {
        const eztv = await sources.searchEZTV('Breaking Bad', 3);
        console.log(`✅ Encontrados ${eztv.length} resultados\n`);
        eztv.slice(0, 2).forEach((r, i) => {
            console.log(`${i + 1}. ${r.title}`);
            console.log(`   Seeds: ${r.seeds} | Size: ${r.size}`);
            console.log('');
        });
    } catch (e) {
        console.error(`❌ Erro: ${e.message}`);
    }

    // Teste 3: Nyaa.si (Anime)
    console.log('═'.repeat(60));
    console.log('\n🎌 TESTE 3: Nyaa.si (Anime)\n');
    try {
        const nyaa = await sources.searchNyaa('One Piece', 3);
        console.log(`✅ Encontrados ${nyaa.length} resultados\n`);
        nyaa.slice(0, 2).forEach((r, i) => {
            console.log(`${i + 1}. ${r.title}`);
            console.log(`   Seeds: ${r.seeds} | Size: ${r.size}`);
            console.log('');
        });
    } catch (e) {
        console.error(`❌ Erro: ${e.message}`);
    }

    // Teste 4: Busca em Todas as Fontes
    console.log('═'.repeat(60));
    console.log('\n🌐 TESTE 4: Busca em Todas as Fontes\n');
    try {
        const all = await sources.searchAll('Inception', 'Movies', 3);
        console.log(`✅ Total de ${all.length} resultados únicos\n`);
        all.slice(0, 3).forEach((r, i) => {
            console.log(`${i + 1}. ${r.title}`);
            console.log(`   Provider: ${r.provider} | Seeds: ${r.seeds}`);
            console.log('');
        });
    } catch (e) {
        console.error(`❌ Erro: ${e.message}`);
    }

    console.log('═'.repeat(60));
    console.log('\n✅ TESTES CONCLUÍDOS!\n');
}

testExtendedSources().catch(console.error);
