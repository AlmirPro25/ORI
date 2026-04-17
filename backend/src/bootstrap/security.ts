/**
 * 🏗️ BOOTSTRAP: Security & Configuration
 * Centraliza validação de segurança e configuração do servidor.
 */

export interface ServerConfig {
    port: number;
    jwtSecret: string;
    isProduction: boolean;
}

export function bootstrapSecurity(): ServerConfig {
    const isProduction = process.env.NODE_ENV === 'production';

    // 🔐 JWT Secret — Fail-fast em produção
    if (!process.env.JWT_SECRET && isProduction) {
        console.error('🚨 [FATAL] JWT_SECRET não definido em produção. Abortando.');
        process.exit(1);
    }
    if (!process.env.JWT_SECRET) {
        console.warn('⚠️ [SECURITY] JWT_SECRET não definido. Usando chave efêmera (APENAS DEV).');
    }

    const jwtSecret = process.env.JWT_SECRET || require('crypto').randomBytes(32).toString('hex');
    const port = parseInt(process.env.PORT || '3000', 10);

    console.log(`🔐 [Bootstrap] Security initialized (production: ${isProduction})`);

    return {
        port,
        jwtSecret,
        isProduction
    };
}
