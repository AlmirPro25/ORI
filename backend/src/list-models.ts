
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const apiKey = process.env.GEMINI_API_KEY || "AIzaSyAePQ5VtlKYVdb9n8AC-mnirGEKoO9M2hw";
const genAI = new GoogleGenerativeAI(apiKey);

async function listModels() {
    console.log("🔍 Listando modelos disponíveis...");
    try {
        // O SDK não tem um método direto simples de listagem sem o cliente REST as vezes, 
        // mas vamos tentar ver se conseguimos por erro ou algo assim.
        // Na verdade, vamos tentar um fetch manual rápido.
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await response.json();
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("❌ Erro ao listar modelos:", e);
    }
}

listModels();
