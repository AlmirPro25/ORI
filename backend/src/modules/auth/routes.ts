/**
 * 🔐 MODULE: Authentication Routes
 * 
 * Responsabilidades:
 * - Register
 * - Login
 * 
 * Recebe o JWT_SECRET via factory para evitar duplicação de configuração.
 */
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export function createAuthRoutes(jwtSecret: string): Router {
    const router = Router();

    router.post('/register', async (req, res) => {
        try {
            const { name, email, password } = req.body;
            console.log(`📝 [Auth] Tentativa de registro: ${email}`);

            let user = await prisma.user.findUnique({ where: { email } });
            if (user) {
                console.warn(`⚠️ [Auth] Email já existe: ${email}`);
                return res.status(400).json({ error: 'Email already exists' });
            }

            user = await prisma.user.create({
                data: {
                    name: name || 'Operator',
                    email,
                    password,
                    role: email.endsWith('admin@streamforge.com') || email.includes('admin') ? 'ADMIN' : 'USER'
                }
            });

            console.log(`✅ [Auth] Usuário criado: ${user.email} (${user.id})`);
            const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, jwtSecret);
            res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
        } catch (error: any) {
            console.error('❌ [Auth] Erro no registro:', error);
            res.status(500).json({ error: 'Registration failed', details: error.message });
        }
    });

    router.post('/login', async (req, res) => {
        try {
            const { email, password } = req.body;
            const user = await prisma.user.findUnique({ where: { email } });
            if (!user) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const isValidPassword = await bcrypt.compare(password, user.password);
            if (!isValidPassword) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, jwtSecret);
            res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
        } catch (error) {
            res.status(500).json({ error: 'Login failed' });
        }
    });

    return router;
}
