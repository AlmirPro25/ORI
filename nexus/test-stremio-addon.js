/**
 * Teste do Stremio Addon
 * Valida a integração e funcionalidades
 */

const { addonInterface } = require('./stremio-addon');

async function testStremioAddon() {
    console.log('\n🧪 TESTE DO STREMIO ADDON\n');
    console.log('═'.repeat(60));

    // 1. Testar Manifesto
    console.log('\n📋 TESTE 1: Manifesto\n');
    const manifest = addonInterface.manifest;
    console.log(`✅ Nome: ${manifest.name}`);
    console.log(`✅ Versão: ${manifest.version}`);
    console.log(`✅ ID: ${manifest.id}`);
    console.log(`✅ Recursos: ${manifest.resources.join(', ')}`);
    console.log(`✅ Tipos: ${manifest.types.join(', ')}`);
    console.log(`✅ Catálogos: ${manifest.catalogs.length}`);

    // 2. Testar Stream Handler
    console.log('\n' + '═'.repeat(60));
    console.log('\n🎬 TESTE 2: Stream Handler (Filme)\n');

    try {
        const movieArgs = {
            type: 'movie',
            id: 'tt0133093', // Matrix
            name: 'Matrix'
        };

        console.log(`Buscando streams para: ${movieArgs.name}`);
        const movieStreams = await addonInterface.get('stream', movieArgs.type, movieArgs.id);

        console.log(`✅ Encontrados ${movieStreams.streams.length} streams\n`);

        movieStreams.streams.slice(0, 3).forEach((s, i) => {
            console.log(`${i + 1}. ${s.name}`);
            console.log(`   Title: ${s.title}`);
            console.log(`   InfoHash: ${s.infoHash?.substring(0, 20)}...`);
            console.log('');
        });
    } catch (e) {
        console.error(`❌ Erro: ${e.message}`);
    }

    // 3. Testar com Série
    console.log('═'.repeat(60));
    console.log('\n📺 TESTE 3: Stream Handler (Série)\n');

    try {
        const seriesArgs = {
            type: 'series',
            id: 'tt0903747', // Breaking Bad
            name: 'Breaking Bad'
        };

        console.log(`Buscando streams para: ${seriesArgs.name}`);
        const seriesStreams = await addonInterface.get('stream', seriesArgs.type, seriesArgs.id);

        console.log(`✅ Encontrados ${seriesStreams.streams.length} streams\n`);

        seriesStreams.streams.slice(0, 2).forEach((s, i) => {
            console.log(`${i + 1}. ${s.name}`);
            console.log(`   Title: ${s.title}`);
            console.log('');
        });
    } catch (e) {
        console.error(`❌ Erro: ${e.message}`);
    }

    // 4. Testar com Anime
    console.log('═'.repeat(60));
    console.log('\n🎌 TESTE 4: Stream Handler (Anime)\n');

    try {
        const animeArgs = {
            type: 'anime',
            id: 'kitsu:1', // One Piece
            name: 'One Piece'
        };

        console.log(`Buscando streams para: ${animeArgs.name}`);
        const animeStreams = await addonInterface.get('stream', animeArgs.type, animeArgs.id);

        console.log(`✅ Encontrados ${animeStreams.streams.length} streams\n`);

        animeStreams.streams.slice(0, 2).forEach((s, i) => {
            console.log(`${i + 1}. ${s.name}`);
            console.log(`   Title: ${s.title}`);
            console.log('');
        });
    } catch (e) {
        console.error(`❌ Erro: ${e.message}`);
    }

    // 5. Testar Catálogo
    console.log('═'.repeat(60));
    console.log('\n📚 TESTE 5: Catalog Handler\n');

    try {
        const catalogArgs = {
            type: 'movie',
            id: 'nexus-movies',
            extra: {
                search: 'Inception'
            }
        };

        console.log(`Buscando no catálogo: ${catalogArgs.extra.search}`);
        const catalog = await addonInterface.get('catalog', catalogArgs.type, catalogArgs.id, catalogArgs.extra);

        console.log(`✅ Encontrados ${catalog.metas.length} itens no catálogo\n`);

        catalog.metas.slice(0, 3).forEach((m, i) => {
            console.log(`${i + 1}. ${m.name}`);
            console.log(`   ID: ${m.id}`);
            console.log(`   Descrição: ${m.description}`);
            console.log('');
        });
    } catch (e) {
        console.error(`❌ Erro: ${e.message}`);
    }

    console.log('═'.repeat(60));
    console.log('\n✅ TESTES CONCLUÍDOS!\n');
    console.log('📝 Próximo passo: Iniciar o servidor com `node stremio-server.js`\n');
}

testStremioAddon().catch(console.error);
