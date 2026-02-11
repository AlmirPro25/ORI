/**
 * INTELLIGENCE WORKER
 * Job que roda a cada 5 minutos para recalcular scores
 */

import { runIntelligenceJob } from './intelligence-engine';

const INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

async function startWorker() {
  console.log('🧠 [Intelligence Worker] Iniciado');
  console.log(`⏰ Intervalo: ${INTERVAL_MS / 1000}s`);

  // Executa imediatamente
  await runIntelligenceJob();

  // Depois executa periodicamente
  setInterval(async () => {
    try {
      await runIntelligenceJob();
    } catch (error) {
      console.error('❌ [Intelligence Worker] Erro:', error);
    }
  }, INTERVAL_MS);
}

// Inicia se for executado diretamente
if (require.main === module) {
  startWorker().catch(console.error);
}

export { startWorker };
