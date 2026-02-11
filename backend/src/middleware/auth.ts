import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

interface TokenPayload {
  id: string;
  email: string;
  name: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

// 🔐 Alinhado com server-portable.ts — mesmo secret efêmero em dev
const JWT_SECRET = process.env.JWT_SECRET || require('crypto').randomBytes(32).toString('hex');

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Token not provided' });
  }

  const [, token] = authHeader.split(' ');

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    req.user = decoded;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
