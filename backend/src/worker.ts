
import env from './config/env';
import './queue/consumer'; // Importa o worker para iniciar o processamento

console.log('👷 StreamForge Worker Started');
console.log(`🔌 Connected to Redis at ${env.REDIS_HOST}:${env.REDIS_PORT}`);
console.log('👀 Waiting for jobs in queue: video-transcoding...');

// Mantém o processo vivo
process.on('SIGTERM', async () => {
  console.log('Worker shutting down...');
  process.exit(0);
});
