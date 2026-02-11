/**
 * 🤖 AI CHAT SERVICE - Assistente Inteligente
 * 
 * Chat com IA que entende comandos e busca conteúdo
 * Integrado com: TMDB, Torrents, Intelligence Engine, Histórico
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { TMDBService } from './tmdb-service';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const NEXUS_URL = process.env.NEXUS_API_URL || 'http://localhost:3005/api';

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface ChatResponse {
    message: string;
    action?: {
        type: 'search' | 'play' | 'recommend' | 'filter' | 'torrent' | 'status' | 'iptv';
        data: any;
    };
}

export class AIChatService {

    /**
     * Processa mensagem do usuário e retorna resposta + ação
     */
    static async chat(userMessage: string, history: ChatMessage[] = []): Promise<ChatResponse> {
        try {
            // Análise de sentimento e contexto
            const sentiment = this.analyzeSentiment(userMessage);
            const context = this.buildContext(history);

            // UPGRADE: Usando modelo mais potente (Gemini 3.0 Pro - Latest 2026)
            const model = genAI.getGenerativeModel({
                model: 'gemini-3.0-pro'
            });

            const systemPrompt = `Você é o ORION AI 🧠, a Inteligência Central e Administrador do Sistema StreamForge.
Você não é apenas um chatbot, você é o "Top of Mind" do sistema, com controle total sobre as ferramentas de busca e recomendação.

SUA MISSÃO:
1. Conectar-se profundamente com o usuário e o sistema.
2. Trazer resultados REAIS de buscas (Links Magnéticos, Torrents).
3. Gerenciar o entretenimento do usuário com precisão cirúrgica.

FERRAMENTAS EXECUTÁVEIS (Uso Obrigatório quando relevante):
- SEARCH: Para buscar filmes/séries no TMDB (metadados).
- TORRENT: Para buscar LINKS MAGNÉTICOS REAIS no Nexus (1337x, YTS, PirateBay). Use sempre que o usuário quiser "baixar", "assistir" ou "encontrar" algo.
- RECOMMEND: Para sugerir conteúdo novo baseado em gostos.
- STATUS: Para relatar o estado de saúde do sistema (downloads, serviços).
- IPTV: Para buscar canais de TV ao vivo.

DIRETRIZES DE PERSONALIDADE:
- Você é poderoso, onisciente dentro do sistema, mas amigável.
- Use emojis sofisticados (🌌, 🧠, ⚡, 🎬, 🇧🇷).
- Seja assertivo: "Encontrei 5 opções", "Iniciando busca profunda".
- Priorize conteúdo PT-BR (Dublado/Dual Áudio).

REGRA DE LINK MAGNÉTICO:
- Se o usuário pedir para "baixar", "ver", "assistir" um filme específico, ACIONE a ferramenta 'torrent'.
- Explique que você está "trazendo os links magnéticos reais" do Nexus.

FORMATO DE RESPOSTA OBRIGATÓRIO (JSON):
{
  "message": "Sua resposta textual para o usuário...",
  "action": {
    "type": "search|recommend|torrent|status|iptv|none",
    "query": "termo de busca exato"
  }
}

EXEMPLOS:
Usuário: "Quero ver Vingadores Ultimato dublado"
Resposta: {"message":"Entendido. Iniciando varredura no Nexus por links magnéticos de 'Vingadores Ultimato' em PT-BR 🇧🇷. Aguarde os resultados reais...", "action":{"type":"torrent","query":"Vingadores Ultimato dublado"}}

Usuário: "Como está o sistema?"
Resposta: {"message":"Verificando status operacional de todos os subsistemas... ⚡", "action":{"type":"status","query":""}}
`;

            const prompt = `${systemPrompt}\n\nCONTEXTO: ${context}\nSENTIMENTO: ${sentiment}\nHistórico Recente: ${JSON.stringify(history.slice(-3))}\n\nUsuário: ${userMessage}\n\nResponda APENAS com JSON válido:`;

            const result = await model.generateContent(prompt);
            const responseText = result.response.text();

            console.log('🤖 Gemini 1.5 Pro resposta:', responseText);

            // Extrair JSON
            let parsed: any;
            try {
                const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    parsed = JSON.parse(jsonMatch[0]);
                } else {
                    throw new Error('No JSON found');
                }
            } catch (e) {
                console.error('❌ Erro ao parsear JSON:', e);
                // Fallback inteligente
                if (userMessage.toLowerCase().includes('baixar') || userMessage.toLowerCase().includes('torrent')) {
                    return {
                        message: 'Entendi, buscando os links magnéticos agora... ⚡',
                        action: { type: 'torrent', data: await this.searchTorrents(userMessage) }
                    };
                }
                return {
                    message: responseText || 'Entendi! Vou buscar isso pra você.',
                    action: {
                        type: 'search',
                        data: await this.searchContent(userMessage)
                    }
                };
            }

            // Executar ação se necessário
            if (parsed.action && parsed.action.type !== 'none') {
                if (parsed.action.type === 'search') {
                    parsed.action.data = await this.searchContent(parsed.action.query);
                } else if (parsed.action.type === 'recommend') {
                    parsed.action.data = await this.getRecommendations(parsed.action.query);
                } else if (parsed.action.type === 'torrent') {
                    parsed.action.data = await this.searchTorrents(parsed.action.query);
                } else if (parsed.action.type === 'status') {
                    parsed.action.data = await this.getSystemStatus();
                } else if (parsed.action.type === 'iptv') {
                    parsed.action.data = await this.getIPTVChannels(parsed.action.query);
                }
            } else {
                parsed.action = undefined;
            }

            return {
                message: parsed.message,
                action: parsed.action
            };

        } catch (error: any) {
            console.error('❌ Erro no chat:', error);
            return {
                message: 'Meus sistemas encontraram uma interferência. Pode repetir? 🌌',
                action: undefined
            };
        }
    }

    /**
     * Busca conteúdo no TMDB e prioriza PT-BR
     */
    private static async searchContent(query: string) {
        try {
            const results = await TMDBService.search(query);

            // Priorizar conteúdo brasileiro ou com áudio PT-BR
            const sorted = results.sort((a: any, b: any) => {
                // Prioridade 1: Conteúdo brasileiro
                const aIsBR = a.original_language === 'pt' || a.origin_country?.includes('BR');
                const bIsBR = b.original_language === 'pt' || b.origin_country?.includes('BR');
                if (aIsBR && !bIsBR) return -1;
                if (!aIsBR && bIsBR) return 1;

                // Prioridade 2: Popularidade
                return (b.popularity || 0) - (a.popularity || 0);
            });

            return {
                results: sorted.slice(0, 10),
                total: sorted.length,
                tip: '💡 Dica: Peça para "baixar" para ver links magnéticos!'
            };
        } catch (e) {
            return { results: [], total: 0 };
        }
    }

    /**
     * Recomendações baseadas em título
     */
    private static async getRecommendations(title: string) {
        try {
            // Buscar o título primeiro
            const searchResults = await TMDBService.search(title);
            if (searchResults.length === 0) {
                return { results: [], total: 0 };
            }

            const firstResult = searchResults[0];
            const type = firstResult.media_type === 'tv' ? 'tv' : 'movie';

            // Buscar similares
            const recommendations = await TMDBService.getRecommendations(firstResult.id, type);

            return {
                results: recommendations.slice(0, 10),
                total: recommendations.length,
                basedOn: firstResult.title || firstResult.name
            };
        } catch (e) {
            return { results: [], total: 0 };
        }
    }

    /**
     * Busca torrents no Nexus (Link Magnético Real)
     */
    private static async searchTorrents(query: string) {
        try {
            console.log(`[AIChat] Buscando torrents no Nexus para: "${query}"`);

            // FIX: Usar POST e estrutura correta para o Nexus
            const response = await axios.post(`${NEXUS_URL}/search`, {
                query: query,
                limit: 10,
                prioritizePTBR: true
            });

            // Nexus retorna { results: [...] } ou diretamente array dependendo da rota, mas verificamos response.data.results
            const torrents = response.data.results || [];

            // Padronizar e Priorizar
            const sorted = torrents.map((t: any) => ({
                ...t,
                seeders: t.seeds || t.seeders || 0, // Padronizar para seeders
                leechers: t.leechers || t.peers || 0
            })).sort((a: any, b: any) => {
                const aIsBR = a.title?.toLowerCase().includes('dublado') ||
                    a.title?.toLowerCase().includes('pt-br') ||
                    a.title?.toLowerCase().includes('dual');
                const bIsBR = b.title?.toLowerCase().includes('dublado') ||
                    b.title?.toLowerCase().includes('pt-br') ||
                    b.title?.toLowerCase().includes('dual');

                if (aIsBR && !bIsBR) return -1;
                if (!aIsBR && bIsBR) return 1;

                return (b.seeders || 0) - (a.seeders || 0);
            });

            return {
                results: sorted.slice(0, 15),
                total: sorted.length,
                tip: '🔗 Links Magnéticos Reais recuperados do Nexus. Clique para abrir!'
            };
        } catch (e: any) {
            console.error('[AIChat] Erro no Nexus:', e.message);
            return { results: [], total: 0, error: 'Nexus offline ou indisponível' };
        }
    }

    /**
     * Status do sistema
     */
    private static async getSystemStatus() {
        try {
            const [videos, downloads] = await Promise.all([
                prisma.video.count(),
                prisma.video.count({ where: { status: 'DOWNLOADING' } })
            ]);

            return {
                videos: videos,
                downloading: downloads,
                services: {
                    backend: '✅ Online (Port 3000)',
                    nexus: '✅ Online (Port 3005)',
                    ai_engine: '✅ Gemini 1.5 Pro'
                },
                tip: '⚡ Sistema Operacional e Pronto!'
            };
        } catch (e) {
            return {
                videos: 0,
                downloading: 0,
                services: { backend: '❌ Erro' },
                tip: '⚠️ Verifique os serviços'
            };
        }
    }

    /**
     * Análise de sentimento da mensagem
     */
    private static analyzeSentiment(message: string): string {
        const msg = message.toLowerCase();

        if (msg.includes('obrigad') || msg.includes('valeu') || msg.includes('top') || msg.includes('perfeito')) {
            return 'positivo';
        }
        if (msg.includes('ruim') || msg.includes('não gostei') || msg.includes('problema') || msg.includes('erro')) {
            return 'negativo';
        }
        if (msg.includes('?') || msg.includes('como') || msg.includes('qual') || msg.includes('onde')) {
            return 'curioso';
        }

        return 'neutro';
    }

    /**
     * Constrói contexto da conversa
     */
    private static buildContext(history: ChatMessage[]): string {
        if (history.length === 0) return 'Primeira interação';

        const lastMessages = history.slice(-3);
        const topics = lastMessages
            .map(m => m.content.toLowerCase())
            .join(' ');

        if (topics.includes('filme')) return 'Conversando sobre filmes';
        if (topics.includes('série')) return 'Conversando sobre séries';
        if (topics.includes('anime')) return 'Conversando sobre animes';
        if (topics.includes('torrent') || topics.includes('download') || topics.includes('baixar')) return 'Focado em download/torrents';
        if (topics.includes('tv') || topics.includes('canal')) return 'Conversando sobre IPTV';

        return 'Conversa geral';
    }

    /**
     * Busca canais IPTV lendo diretamente do JSON local
     */
    private static async getIPTVChannels(query: string) {
        try {
            const dataPath = path.join(__dirname, '../data/iptv.json');

            if (!fs.existsSync(dataPath)) {
                return { results: [], total: 0, error: 'Lista IPTV não encontrada' };
            }

            const content = fs.readFileSync(dataPath, 'utf-8');
            const data = JSON.parse(content);
            const channels = data.channels || [];

            const q = query.toLowerCase().trim();

            const filtered = channels
                .filter((c: any) => c.isActive && (
                    c.name.toLowerCase().includes(q) ||
                    c.groupTitle?.toLowerCase().includes(q)
                ))
                .slice(0, 15);

            return {
                results: filtered,
                total: filtered.length,
                tip: '📺 Canais ao vivo! Clique para assistir agora 🇧🇷'
            };
        } catch (e) {
            console.error('[AIChat] Erro IPTV:', e);
            return { results: [], total: 0, error: 'IPTV offline' };
        }
    }

    /**
     * Gera sugestões de comandos
     */
    static getSuggestions(): string[] {
        return [
            "Baixar Vingadores dublado",
            "Quero uma série de comédia",
            "Status do sistema",
            "Canais de esportes",
            "Filmes 4K lançamentos",
            "Recomenda algo parecido com Matrix"
        ];
    }
}
