/**
 * SCRIPT DE PROMOÇÃO PARA ADMIN
 * 
 * Promove um usuário existente para ADMIN ou cria um novo usuário ADMIN
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function promoteToAdmin() {
    try {
        console.log('🔐 SISTEMA DE PROMOÇÃO ADMIN\n');

        // Verificar se já existe algum usuário
        const users = await prisma.user.findMany();
        
        console.log(`📊 Total de usuários no sistema: ${users.length}\n`);

        if (users.length > 0) {
            console.log('👥 Usuários encontrados:');
            users.forEach((user, index) => {
                console.log(`${index + 1}. ${user.email} - ${user.name} [${user.role}]`);
            });
            console.log('');
        }

        // Dados do admin
        const adminEmail = 'admin@streamforge.com';
        const adminPassword = 'admin123';
        const adminName = 'Administrador';

        // Verificar se já existe um admin com esse email
        const existingUser = await prisma.user.findUnique({
            where: { email: adminEmail }
        });

        if (existingUser) {
            // Promover usuário existente
            console.log(`✅ Usuário encontrado: ${existingUser.email}`);
            console.log(`📝 Role atual: ${existingUser.role}`);

            if (existingUser.role === 'ADMIN') {
                console.log('⚠️  Usuário já é ADMIN!');
            } else {
                await prisma.user.update({
                    where: { id: existingUser.id },
                    data: { role: 'ADMIN' }
                });
                console.log('🎉 Usuário promovido para ADMIN com sucesso!');
            }
        } else {
            // Criar novo usuário ADMIN
            console.log('🆕 Criando novo usuário ADMIN...');
            
            const hashedPassword = await bcrypt.hash(adminPassword, 10);
            
            const newAdmin = await prisma.user.create({
                data: {
                    email: adminEmail,
                    password: hashedPassword,
                    name: adminName,
                    role: 'ADMIN'
                }
            });

            console.log('✅ Usuário ADMIN criado com sucesso!');
            console.log(`📧 Email: ${newAdmin.email}`);
            console.log(`🔑 Senha: ${adminPassword}`);
        }

        console.log('\n' + '='.repeat(60));
        console.log('🎯 CREDENCIAIS DE ADMIN');
        console.log('='.repeat(60));
        console.log(`📧 Email: ${adminEmail}`);
        console.log(`🔑 Senha: ${adminPassword}`);
        console.log('='.repeat(60));
        console.log('\n✅ Processo concluído! Use essas credenciais para fazer login.\n');

    } catch (error) {
        console.error('❌ Erro:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

// Executar
promoteToAdmin();
