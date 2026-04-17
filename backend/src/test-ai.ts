
import { aiService } from './ai-service';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function testGemini() {
    console.log("🧪 Testando Gemini Integration...");
    try {
        const result = await aiService.enrichContent("Inception", "A thief who steals corporate secrets through the use of dream-sharing technology.");
        console.log("✅ Resultado da IA:");
        console.log(JSON.stringify(result, null, 2));
    } catch (e) {
        console.error("❌ Erro no teste:", e);
    }
}

testGemini();
