import axios from 'axios';
import winston from 'winston';
import { aiService } from './ai-service';
import { downloadTorrentToServer } from './torrent-downloader';

/**
 * AGENTE ARCONTE - ORQUESTRADOR DE SINERGIA (TS Version)
 * Este serviço age como o administrador inteligente do StreamForge.
 */

const NEXUS_API = 'http://localhost:3005/api';
const STREAMFORGE_API = 'http://localhost:3000/api/v1';

const logger = winston.createLogger({
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
    ),
    transports: [new winston.transports.Console()]
});

class ArconteAdmin {
    async processDemand(term: string) {
        logger.info(`[ARCONTE] 🔍 Investigando demanda profunda por: "${term}"`);

        try {
            const nexusResponse = await axios.post(`${NEXUS_API}/search/ultra`, {
                query: term,
                category: 'Movies',
                limit: 10
            });
            const allResults = nexusResponse.data.results;

            if (!allResults || allResults.length === 0) {
                logger.warn(`[ARCONTE] 🌑 Vazio digital. Nada encontrado para "${term}".`);
                return null;
            }

            // Filtramos os melhores candidatos (ex: top 3 com mais seeds)
            const topCandidates = allResults
                .sort((a: any, b: any) => b.seeds - a.seeds)
                .slice(0, 3);

            logger.info(`[ARCONTE] 🎯 Selecionados ${topCandidates.length} candidatos para ingestão.`);

            const ingestions = [];

            for (const candidate of topCandidates) {
                logger.info(`[ARCONTE] 🚀 Processando: ${candidate.title} (${candidate.seeds} seeds)`);

                const enrichmentContext = `
                    Título do Torrent: ${candidate.title}
                    Tamanho: ${candidate.size}
                    Fonte: ${candidate.sourceSite}
                    Termo original da busca: ${term}
                `;

                const enrichedData = await aiService.enrichContent(
                    candidate.title,
                    enrichmentContext
                );

                const ingestion = await this.ingestToStreamForge({
                    title: enrichedData.title || candidate.title,
                    category: enrichedData.category,
                    description: enrichedData.description,
                    externalSource: candidate.magnetLink,
                    thumbnailUrl: candidate.poster || enrichedData.poster,
                    tags: enrichedData.tags
                });

                if (ingestion) ingestions.push(ingestion);
            }

            // --- SINERGIA DE COLEÇÃO (AUTO-BUSCA DE SEQUÊNCIAS) ---
            // Se for um filme e tiver alta confiança, tentamos buscar o "próximo"
            if (ingestions.length > 0 && term.length > 3) {
                this.discoverRelatedContent(term, ingestions[0].category);
            }

            return ingestions;

        } catch (error: any) {
            logger.error(`[ARCONTE] ❌ Falha no ciclo de sinergia: ${error.message}`);
            return null;
        }
    }

    private async discoverRelatedContent(term: string, category: string) {
        // Lógica de background para expandir a biblioteca
        const relatedTerms = [term + ' 2', term + ' sequel', term + ' prequel'];
        for (const rTerm of relatedTerms) {
            setTimeout(async () => {
                logger.info(`[ARCONTE] 🌀 Sinergia de Coleção ativada para: "${rTerm}"`);
                try {
                    const nexusResponse = await axios.post(`${NEXUS_API}/search/ultra`, {
                        query: rTerm,
                        category: 'Movies',
                        limit: 10
                    });
                    const results = nexusResponse.data.results;
                    if (results && results.length > 0) {
                        const best = results.sort((a: any, b: any) => b.seeds - a.seeds)[0];
                        if (best.seeds > 100) {
                            const enriched = await aiService.enrichContent(best.title, `Relacionado a ${term}`);
                            await this.ingestToStreamForge({
                                title: enriched.title,
                                category: enriched.category,
                                description: enriched.description,
                                externalSource: best.magnetLink,
                                thumbnailUrl: best.poster || enriched.poster,
                                tags: [...enriched.tags, 'Relacionado']
                            });
                        }
                    }
                } catch (e) { }
            }, 5000); // Delay para não sobrecarregar o scraper
        }
    }

    async ingestToStreamForge(videoData: any) {
        try {
            logger.info(`[ARCONTE] 🛠️ Forjando metadados no catálogo: ${videoData.title}`);

            // MODIFICAÇÃO: Não baixar fisicamente automático.
            // O usuário quer "povoar a tela" com metadados ricos, mas baixar apenas sob demanda.

            /* LÓGICA ANTIGA (Baixar tudo) - DESATIVADA
            if (videoData.externalSource && videoData.externalSource.startsWith('magnet:')) {
                // ... logic removed ...
            }
            */

            // NOVA LÓGICA: Ingestão de Metadados (Catálogo Virtual)
            // O vídeo entra como "READY" (ou similar) visualmente, mas o link é o Magnet.
            // Precisamos garantir que o backend aceite isso.

            logger.info(`[ARCONTE] 📚 Catalogando item rico: ${videoData.title}`);

            const payload = {
                ...videoData,
                status: 'CATALOG', // Novo status para indicar "Item de Catálogo" (não arquivo físico)
                storageKey: videoData.externalSource, // Guardamos o magnet aqui ou em campo específico
                originalFilename: 'magnet-link'
            };

            const response = await axios.post(`${STREAMFORGE_API}/videos/auto-ingest`, payload);

            // Forçamos o update de thumbnail para garantir
            if (response.data && response.data.id && videoData.thumbnailUrl) {
                await axios.put(`${STREAMFORGE_API}/videos/${response.data.id}`, {
                    thumbnailPath: videoData.thumbnailUrl,
                    tags: videoData.tags
                });
            }

            logger.info(`[ARCONTE] ✅ Item catalogado com sucesso (ID: ${response.data.id})`);
            return response.data;
        } catch (err: any) {
            logger.error(`[ARCONTE] ❌ Erro ao registrar no banco StreamForge: ${err.message}`);
            return null;
        }
    }
}

export const arconteAdmin = new ArconteAdmin();

/**
 * 🕵️‍♂️ BUSCA BRUTA NO NEXUS (SCRAPERS)
 */
export async function runSearch(query: string) {
    try {
        const response = await axios.post(`${NEXUS_API}/search/ultra`, {
            query,
            category: 'Movies',
            limit: 10
        });
        return response.data.results || [];
    } catch (error: any) {
        console.error(`❌ [NexusBridge] Erro na busca bruta: ${query}`, error);
        return [];
    }
}
