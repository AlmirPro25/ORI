import axios from 'axios';
import winston from 'winston';

/**
 * STREAMFORGE BATCH INGESTOR
 * Este script automatiza a população do catálogo usando o Nexus Deep Search.
 */

const BACKEND_API = 'http://localhost:3000/api/v1';

const logger = winston.createLogger({
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
    ),
    transports: [new winston.transports.Console()]
});

// Lista de Sementes para o Catálogo Inicial
const targetContent = [
    { term: 'Big Buck Bunny', category: 'Animação' },
    { term: 'Tears of Steel', category: 'Sci-Fi' },
    { term: 'Cosmos Laundromat', category: 'Experimental' },
    { term: 'Inception 4K', category: 'Filmes' },
    { term: 'Interstellar', category: 'Filmes' },
    { term: 'The Matrix Resurrections', category: 'Filmes' },
    { term: 'Futurama S01', category: 'Séries' },
    { term: 'The Mandalorian', category: 'Séries' },
    { term: 'Rick and Morty', category: 'Séries' },
    { term: 'NASA Space Documentaries', category: 'Documentário' }
];

async function startBatchIngestion() {
    logger.info('🚀 INICIANDO PROTOCOLO DE POPULAÇÃO MASIVA...');

    for (const item of targetContent) {
        logger.info(`🔍 Despachando Arconte para: ${item.term} [${item.category}]`);
        try {
            // Chamada direta para o endpoint de busca profunda que já configuramos
            await axios.post(`${BACKEND_API}/ai/deep-search`, { query: item.term });
            logger.info(`✅ Comando enviado com sucesso. Processando em segundo plano...`);

            // Pequeno delay para não sobrecarregar o motor do Nexus
            await new Promise(resolve => setTimeout(resolve, 5000));
        } catch (error: any) {
            logger.error(`❌ Falha ao solicitar "${item.term}": ${error.message}`);
        }
    }

    logger.info('🏁 PROTOCOLO CONCLUÍDO. O Arconte está em campo populando seu banco de dados.');
}

startBatchIngestion();
