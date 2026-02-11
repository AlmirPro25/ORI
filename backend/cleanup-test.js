const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanup() {
    await prisma.downloadQueue.deleteMany();
    await prisma.video.deleteMany({
        where: {
            OR: [
                { category: 'Teste' },
                { title: { contains: 'Sintel' } },
                { title: { contains: 'Big Buck Bunny' } },
                { title: { contains: 'Tears of Steel' } }
            ]
        }
    });
    console.log('✅ Cleanup complete');
    await prisma.$disconnect();
}

cleanup();
