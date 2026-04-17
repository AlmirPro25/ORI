
import { PrismaClient } from '@prisma/client';

// Singleton do Prisma para evitar múltiplas conexões
const prisma = new PrismaClient();

export default prisma;
