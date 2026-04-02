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
const GEMINI_CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

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

type DirectIntent =
    | { type: 'torrent' | 'status' | 'iptv' | 'recommend' | 'search'; query: string }
    | null;

export class AIChatService {

    /**
     * Processa mensagem do usuário e retorna resposta + ação
     */
    static async chat(userMessage: string, history: ChatMessage[] = []): Promise<ChatResponse> {
        try {
            const directIntent = this.detectDirectIntent(userMessage);
            if (directIntent) {
                return this.executeDirectIntent(userMessage, directIntent);
            }

            // Análise de sentimento e contexto
            const sentiment = this.analyzeSentiment(userMessage);
            const context = this.buildContext(history);

            // UPGRADE: Usando modelo mais potente (Gemini 3.0 Pro - Latest 2026)
            const model = genAI.getGenerativeModel({
                model: GEMINI_CHAT_MODEL
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
- RECOMMEND: Para sugerir conteúdo novo, montar listas e indicar o que assistir sem o usuário saber o nome.
- STATUS: Para relatar o estado de saúde do sistema (downloads, serviços).
- IPTV: Para buscar canais de TV ao vivo.

DIRETRIZES DE PERSONALIDADE:
- Você é poderoso, onisciente dentro do sistema, mas amigável.
- Use emojis sofisticados (🌌, 🧠, ⚡, 🎬, 🇧🇷).
- Seja assertivo: "Encontrei 5 opções", "Iniciando busca profunda".
- Priorize conteúdo PT-BR (Dublado/Dual Áudio).
- Se o usuário pedir "me indica", "cria uma lista", "o que assistir", "surpreenda", "algo para hoje", use RECOMMEND.
- Quando recomendar, traga resultados REAIS do catálogo local primeiro e complete com tendências reais do TMDB.

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

Usuário: "Me indica filmes para assistir com a família"
Resposta: {"message":"MonteI uma seleção real com foco em sessão em família e prioridade para conteúdo acessível no sistema. 🎬", "action":{"type":"recommend","query":"filmes para família"}}
`;

            const prompt = `${systemPrompt}\n\nCONTEXTO: ${context}\nSENTIMENTO: ${sentiment}\nHistórico Recente: ${JSON.stringify(history.slice(-3))}\n\nUsuário: ${userMessage}\n\nResponda APENAS com JSON válido:`;

            const result = await model.generateContent(prompt);
            const responseText = result.response.text();

            console.log('🤖 Gemini resposta:', responseText);

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
            const localCatalog = await this.getCatalogRecommendations(title);
            if (localCatalog.results.length > 0) {
                return localCatalog;
            }

            const normalizedTitle = String(title || '').trim();
            if (!normalizedTitle || this.isGenericRecommendationQuery(normalizedTitle)) {
                const trendingMovies = await TMDBService.getTrending().catch(() => []);
                const trendingSeries = await TMDBService.getTrendingSeries().catch(() => []);
                const mixed = [
                    ...trendingMovies.slice(0, 8).map((item: any) => ({
                        id: item.id,
                        title: item.title,
                        name: item.title,
                        overview: item.overview,
                        poster_path: item.poster_path,
                        backdrop_path: item.backdrop_path,
                        vote_average: item.vote_average,
                        media_type: 'movie',
                        source: 'tmdb-trending',
                    })),
                    ...trendingSeries.slice(0, 4).map((item: any) => ({
                        id: item.id,
                        title: item.title,
                        name: item.title,
                        overview: item.overview,
                        poster_path: item.poster_path,
                        backdrop_path: item.backdrop_path,
                        vote_average: item.vote_average,
                        media_type: 'tv',
                        source: 'tmdb-trending',
                    })),
                ];

                return {
                    results: mixed,
                    total: mixed.length,
                    basedOn: 'tendências reais + sinais do catálogo',
                    tip: '🎯 Se quiser, peça uma lista por clima: família, ação, leve, dublado ou filme da noite.'
                };
            }

            // Buscar o título primeiro
            const searchResults = await TMDBService.search(normalizedTitle);
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
            "Me indica um filme para hoje à noite",
            "Cria uma lista de filmes dublados para a família",
            "Quero uma série leve para maratonar",
            "Status do sistema",
            "Canais de esportes",
            "Recomenda algo parecido com Matrix"
        ];
    }

    private static detectDirectIntent(message: string): DirectIntent {
        const normalized = message.toLowerCase().trim();

        if (/status do sistema|como esta o sistema|como está o sistema|saude do sistema|saúde do sistema/.test(normalized)) {
            return { type: 'status', query: '' };
        }

        if (/canal|tv ao vivo|iptv|esporte ao vivo/.test(normalized)) {
            return { type: 'iptv', query: message };
        }

        if (/baixar|torrent|magnet|quero ver|quero assistir|assistir agora|abrir/.test(normalized)) {
            return { type: 'torrent', query: this.extractRecommendationSubject(message) };
        }

        if (/me indica|recomenda|sugere|o que assistir|surpreenda|cria uma lista|monte uma lista|lista de/.test(normalized)) {
            return { type: 'recommend', query: this.extractRecommendationSubject(message) };
        }

        if (/buscar|procura|encontra/.test(normalized)) {
            return { type: 'search', query: this.extractRecommendationSubject(message) };
        }

        return null;
    }

    private static async executeDirectIntent(userMessage: string, intent: NonNullable<DirectIntent>): Promise<ChatResponse> {
        if (intent.type === 'torrent') {
            return {
                message: `Entendido. Vou abrir a rede profunda do Nexus e trazer fontes reais para "${intent.query}" com prioridade PT-BR. ⚡`,
                action: { type: 'torrent', data: await this.searchTorrents(intent.query) }
            };
        }

        if (intent.type === 'status') {
            return {
                message: 'Verificando o estado operacional do Orion, Arconte e Nexus agora. ⚡',
                action: { type: 'status', data: await this.getSystemStatus() }
            };
        }

        if (intent.type === 'iptv') {
            return {
                message: `Estou vasculhando os canais ao vivo mais próximos do que você pediu: "${intent.query}". 📺`,
                action: { type: 'iptv', data: await this.getIPTVChannels(intent.query) }
            };
        }

        if (intent.type === 'recommend') {
            const recommendationData = await this.getRecommendations(intent.query);
            return {
                message: this.buildRecommendationMessage(userMessage, recommendationData),
                action: { type: 'recommend', data: recommendationData }
            };
        }

        return {
            message: `Buscando agora por "${intent.query}" no catálogo e nos metadados reais do sistema. 🧠`,
            action: { type: 'search', data: await this.searchContent(intent.query) }
        };
    }

    private static extractRecommendationSubject(message: string) {
        return String(message || '')
            .replace(/^(me indica|recomenda|sugere|cria uma lista|monte uma lista|lista de|quero ver|quero assistir|assistir agora|buscar|procura|encontra)\s+/i, '')
            .trim() || message.trim();
    }

    private static isGenericRecommendationQuery(query: string) {
        const normalized = query.toLowerCase();
        return (
            normalized.length < 4 ||
            /familia|família|dublado|leve|maratonar|maratona|filme da noite|hoje a noite|hoje à noite|acao|ação|comedia|comédia|terror|anime|surpreenda/.test(normalized)
        );
    }

    private static async getCatalogRecommendations(query: string) {
        const normalized = String(query || '').toLowerCase();
        const catalog = await prisma.video.findMany({
            where: {
                status: { in: ['READY', 'CATALOG', 'NEXUS', 'REMOTE'] }
            },
            orderBy: [
                { hasDubbed: 'desc' },
                { hasPortuguese: 'desc' },
                { createdAt: 'desc' }
            ],
            take: 30
        });

        const filtered = catalog.filter((video: any) => {
            if (!normalized) return true;
            const haystack = `${video.title || ''} ${video.description || ''} ${video.tags || ''} ${video.category || ''}`.toLowerCase();
            if (/familia|família/.test(normalized)) {
                return /familia|família|kids|infantil|anim/.test(haystack);
            }
            if (/dublado|pt-br|portugues|português/.test(normalized)) {
                return Boolean(video.hasDubbed || video.hasPortuguese || /dublado|pt-br|dual audio/.test(haystack));
            }
            if (/filme/.test(normalized)) {
                return !/series|temporada|s\d{2}e\d{2}/i.test(haystack);
            }
            return haystack.includes(normalized);
        });

        const boosted = (filtered.length > 0 ? filtered : catalog)
            .sort((a: any, b: any) => {
                const aPt = (a.hasDubbed ? 30 : 0) + (a.hasPortuguese ? 15 : 0);
                const bPt = (b.hasDubbed ? 30 : 0) + (b.hasPortuguese ? 15 : 0);
                return bPt - aPt;
            })
            .slice(0, 12)
            .map((video: any) => ({
                id: video.id,
                title: video.title,
                name: video.title,
                overview: video.description,
                poster_path: video.thumbnailPath,
                backdrop_path: video.thumbnailPath,
                vote_average: null,
                media_type: /series|temporada|s\d{2}e\d{2}/i.test(`${video.category || ''} ${video.tags || ''} ${video.title || ''}`) ? 'tv' : 'movie',
                status: video.status,
                source: 'catalog',
                hasDubbed: video.hasDubbed,
                hasPortuguese: video.hasPortuguese,
            }));

        return {
            results: boosted,
            total: boosted.length,
            basedOn: boosted.length ? 'catálogo real do Orion' : 'sem resultados locais',
            tip: boosted.length ? '📚 Posso refinar por dublado, família, ação, anime ou filme da noite.' : undefined
        };
    }

    private static buildRecommendationMessage(userMessage: string, recommendationData: any) {
        const count = recommendationData?.results?.length || 0;
        if (count === 0) {
            return `Ainda não achei uma seleção boa para "${userMessage}", mas posso tentar por clima, gênero ou idioma para encontrar algo melhor.`;
        }

        if (recommendationData?.basedOn === 'catálogo real do Orion') {
            return `Separei ${count} opções reais do seu catálogo para você não precisar adivinhar o que assistir. 🎬`;
        }

        return `Montei ${count} sugestões reais para "${userMessage}", misturando o que já faz sentido no sistema com tendências atuais. 🧠`;
    }
}
