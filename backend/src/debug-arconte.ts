
import { arconteAdmin } from './nexus-bridge';
import * as dotenv from 'dotenv';
import path from 'path';

// Carregar variáveis de ambiente
dotenv.config({ path: path.join(__dirname, '../.env') });

async function debugArconte() {
    console.log("🕵️‍♂️ Depurando Arconte...");

    try {
        const query = `Sintel Test ${Date.now()}`;
        console.log(`📡 Solicitando busca para: "${query}"`);

        // Vamos chamar e esperar o resultado, logando tudo
        const result = await arconteAdmin.processDemand(query);

        if (result) {
            console.log("✅ Sucesso Completo! Resultado:");
            console.log(JSON.stringify(result, null, 2));
        } else {
            console.error("❌ Arconte retornou vazio (NULL). Algo falhou no meio do caminho.");
        }
    } catch (e) {
        console.error("🔥 EXCEPTION CRÍTICA:", e);
    }
}

debugArconte();
