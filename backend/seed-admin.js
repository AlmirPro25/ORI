
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createAdmin() {
    const email = 'admin@admin.com';
    const password = 'admin';

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        console.log('Admin already exists.');
        return;
    }

    const user = await prisma.user.create({
        data: {
            email,
            password,
            name: 'Nexus Admin',
            role: 'ADMIN'
        }
    });
    console.log('Admin created:', user);
    await prisma.$disconnect();
}

createAdmin().catch(console.error);
