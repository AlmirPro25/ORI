/**
 * 🏗️ BOOTSTRAP INDEX
 * Ponto de entrada para todos os módulos de inicialização do sistema.
 *
 * Uso no server-portable.ts:
 *   import { bootstrapSecurity, bootstrapFFmpeg, registerSocketEvents } from './bootstrap';
 */
export { bootstrapSecurity, type ServerConfig } from './security';
export { bootstrapFFmpeg } from './ffmpeg';
export { registerSocketEvents } from './socket';
