/**
 * 📦 MODULES INDEX
 * 
 * Barrel export para todos os módulos de rotas.
 * 
 * Uso no server-portable.ts:
 *   import { governanceRoutes, healthRoutes, searchRoutes, createAuthRoutes } from './modules';
 * 
 *   app.use('/api/v1', governanceRoutes);     // Governor, telemetry, federation, badges
 *   app.use('', healthRoutes);                 // Health check at /health (sem prefixo)
 *   app.use('/api/v1/search', searchRoutes);   // Orion V4 search orchestrator
 *   app.use('/api/v1/auth', createAuthRoutes(JWT_SECRET));  // Auth (register/login)
 */
export { default as governanceRoutes, healthRouter as healthRoutes } from './governance/routes';
export { default as searchRoutes } from './search/routes';
export { createAuthRoutes } from './auth/routes';
