/**
 * PROMOVER USUÁRIO ESPECÍFICO PARA ADMIN
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function promoteUser(email) {
    try {
        console.log(`\n🔍 Buscando usuário: ${email}\n`);

        const user = await prisma.user.findUnique({
            where: { email }
        });

        if (!user) {
            console.log('❌ Usuário não encontrado!');
            return;
        }

        console.log(`✅ Usuário encontrado:`);
        console.log(`   Nome: ${user.name}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Role atual: ${user.role}\n`);

        if (user.role === 'ADMIN') {
            console.log('⚠️  Usuário já é ADMIN!\n');
            return;
        }

        await prisma.user.update({
            where: { id: user.id },
            data: { role: 'ADMIN' }
        });

        console.log('🎉 USUÁRIO PROMOVIDO PARA ADMIN COM SUCESSO!\n');
        console.log('='.repeat(60));
        console.log('🎯 NOVA CONTA ADMIN');
        console.log('='.repeat(60));
        console.log(`📧 Email: ${user.email}`);
        console.log(`👤 Nome: ${user.name}`);
        console.log(`🔑 Role: ADMIN`);
        console.log('='.repeat(60) + '\n');

    } catch (error) {
        console.error('❌ Erro:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

// Promover o usuário almir@gmail.com
promoteUser('almir@gmail.com');
