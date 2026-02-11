const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
    console.log('\n🗑️  LIMPEZA DE VÍDEOS FAILED\n');

    try {
        const failedVideos = await prisma.video.findMany({
            where: { status: 'FAILED' },
            orderBy: { createdAt: 'desc' }
        });

        if (failedVideos.length === 0) {
            console.log('✅ Nenhum vídeo FAILED encontrado!\n');
            rl.close();
            await prisma.$disconnect();
            return;
        }

        console.log(`Encontrados ${failedVideos.length} vídeo(s) FAILED:\n`);

        failedVideos.forEach((v, i) => {
            const date = new Date(v.createdAt).toLocaleDateString('pt-BR');
            console.log(`  ${i + 1}. ${v.title}`);
            console.log(`     ID: ${v.id.substring(0, 8)}... | Data: ${date}`);
        });

        console.log('\nOpções:');
        console.log('  1 - Remover TODOS os vídeos FAILED');
        console.log('  2 - Remover vídeos FAILED com mais de 7 dias');
        console.log('  3 - Cancelar');

        const choice = await question('\nEscolha uma opção (1-3): ');

        let toDelete = [];

        switch (choice.trim()) {
            case '1':
                toDelete = failedVideos;
                break;
            case '2':
                const sevenDaysAgo = new Date();
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                toDelete = failedVideos.filter(v => new Date(v.createdAt) < sevenDaysAgo);
                break;
            case '3':
                console.log('\n❌ Operação cancelada.\n');
                rl.close();
                await prisma.$disconnect();
                return;
            default:
                console.log('\n❌ Opção inválida.\n');
                rl.close();
                await prisma.$disconnect();
                return;
        }

        if (toDelete.length === 0) {
            console.log('\n✅ Nenhum vídeo para remover.\n');
            rl.close();
            await prisma.$disconnect();
            return;
        }

        console.log(`\n⚠️  Serão removidos ${toDelete.length} vídeo(s):`);
        toDelete.forEach(v => console.log(`   - ${v.title}`));

        const confirm = await question('\nConfirmar remoção? (s/N): ');

        if (confirm.toLowerCase() !== 's') {
            console.log('\n❌ Operação cancelada.\n');
            rl.close();
            await prisma.$disconnect();
            return;
        }

        console.log('\n🗑️  Removendo vídeos...\n');

        for (const video of toDelete) {
            await prisma.video.delete({ where: { id: video.id } });
            console.log(`  ✅ Removido: ${video.title}`);
        }

        console.log(`\n✅ ${toDelete.length} vídeo(s) removido(s) com sucesso!\n`);

    } catch (e) {
        console.error('\n❌ Erro:', e.message, '\n');
    } finally {
        rl.close();
        await prisma.$disconnect();
    }
}

main();
