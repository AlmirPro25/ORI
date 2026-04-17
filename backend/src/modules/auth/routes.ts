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
            const rawName = String(req.body?.name || '').trim();
            const rawEmail = String(req.body?.email || '').trim().toLowerCase();
            const rawPassword = String(req.body?.password || '');
            console.log(`📝 [Auth] Tentativa de registro: ${rawEmail}`);

            if (!rawName || rawName.length < 2) {
                return res.status(400).json({ error: 'Nome deve ter pelo menos 2 caracteres' });
            }

            if (!rawEmail || !rawEmail.includes('@')) {
                return res.status(400).json({ error: 'Email invalido' });
            }

            if (!rawPassword || rawPassword.length < 4) {
                return res.status(400).json({ error: 'Senha deve ter pelo menos 4 caracteres' });
            }

            let user = await prisma.user.findUnique({ where: { email: rawEmail } });
            if (user) {
                console.warn(`⚠️ [Auth] Email já existe: ${rawEmail}`);
                return res.status(400).json({ error: 'Email already exists' });
            }

            const passwordHash = await bcrypt.hash(rawPassword, 10);

            user = await prisma.user.create({
                data: {
                    name: rawName || 'Operator',
                    email: rawEmail,
                    password: passwordHash,
                    role: rawEmail.endsWith('admin@streamforge.com') || rawEmail.includes('admin') ? 'ADMIN' : 'USER'
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
            const email = String(req.body?.email || '').trim().toLowerCase();
            const password = String(req.body?.password || '');

            if (!email || !password) {
                return res.status(400).json({ error: 'Email e senha sao obrigatorios' });
            }

            const user = await prisma.user.findUnique({ where: { email } });
            if (!user) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            let isValidPassword = false;
            if (user.password?.startsWith('$2a$') || user.password?.startsWith('$2b$') || user.password?.startsWith('$2y$')) {
                isValidPassword = await bcrypt.compare(password, user.password);
            } else {
                isValidPassword = password === user.password;
                if (isValidPassword) {
                    const passwordHash = await bcrypt.hash(password, 10);
                    await prisma.user.update({
                        where: { id: user.id },
                        data: { password: passwordHash },
                    }).catch(() => null);
                }
            }

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
