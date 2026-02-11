import axios from 'axios';
import { TMDBService } from './tmdb-service';

/**
 * ARCONTE AUTO-CURATOR
 * Robô de curadoria automática que popula o catálogo com conteúdo de alta qualidade.
 */

const BACKEND_URL = 'http://localhost:3000/api/v1';
const NEXUS_URL = 'http://localhost:3005/api/search/ultra';

export class ArconteAutoCurator {
    private isRunning = false;
    private predictiveLimit = 5;
    private minSeedsForPredictive = 50;
    private lastAccuracy = 100;

    constructor() { }

    /**
     * Inicia o ciclo de curadoria automática
     * @param intervalInHours Intervalo entre as buscas (padrão 6h)
     */
    start(intervalInHours: number = 6) {
        if (this.isRunning) return;
        this.isRunning = true;

        console.log(`🚀 Arconte Auto-Curator iniciado (Ciclo: ${intervalInHours}h)`);

        // Executa a primeira vez imediatamente
        this.runCycle();

        // Configura o intervalo
        setInterval(() => this.runCycle(), intervalInHours * 60 * 60 * 1000);
    }

    private async runCycle() {
        console.log('🔍 Arconte iniciando ciclo de busca de tendências...');

        // 🔴 V2.6: Feedback Loop - Ajustar agressividade baseado em performance
        try {
            // Nota: Usamos bypass de auth se necessário ou token de sistema
            const statsRes = await axios.get(`${BACKEND_URL}/downloads/stats/predictions`).catch(() => null);
            if (statsRes) {
                const { accuracy } = statsRes.data;
                this.lastAccuracy = accuracy;

                if (accuracy < 30) {
                    this.predictiveLimit = 2; // Errou muito, seja conservador
                    this.minSeedsForPredictive = 100; // Exija mais qualidade
                    console.log(`📉 [Arconte] Baixa acurácia (${accuracy}%). Tornando-se conservador.`);
                } else if (accuracy > 70) {
                    this.predictiveLimit = 10; // Acertou muito, seja agressivo
                    this.minSeedsForPredictive = 30; // Pode arriscar mais
                    console.log(`📈 [Arconte] Alta acurácia (${accuracy}%). Tornando-se agressivo.`);
                } else {
                    this.predictiveLimit = 5;
                    this.minSeedsForPredictive = 50;
                }
            }
        } catch (e) {
            console.warn('⚠️ [Arconte] Não foi possível obter stats para feedback loop.');
        }

        let movies = [];

        try {
            // 1. Tentar buscar filmes populares (YTS)
            try {
                console.log('🔍 [Arconte] Tentando YTS...');
                const response = await axios.get('https://yts.mx/api/v2/list_movies.json?sort_by=trending_score&limit=20', { timeout: 10000 });
                movies = response.data.data.movies;
                console.log(`✅ [Arconte] ${movies.length} tendências encontradas no YTS.`);
            } catch (ytsError: any) {
                console.warn(`⚠️ [Arconte] YTS falhou (DNS ou Timeout). Tentando fallback TMDB...`);
                // Fallback para TMDB
                const tmdbMovies = await TMDBService.getTrending();
                movies = tmdbMovies.map(m => ({
                    title: m.title,
                    year: m.release_date?.split('-')[0],
                    summary: m.overview,
                    large_cover_image: m.poster_path,
                    medium_cover_image: m.poster_path,
                    genres: [] // TMDB retorna IDs, simplificando aqui
                }));
                console.log(`✅ [Arconte] ${movies.length} tendências encontradas no TMDB.`);
            }

            if (!movies || movies.length === 0) {
                console.warn('⚠️ Nenhuma tendência encontrada no momento.');
                return;
            }

            for (let i = 0; i < movies.length; i++) {
                const movie = movies[i];
                // 🔴 V2.6: Predictive Ingestion Dinâmica baseado em performance histórica
                const isHighTrend = i < this.predictiveLimit;
                await this.processMovie(movie, isHighTrend);

                // Delay para evitar overload
                await new Promise(resolve => setTimeout(resolve, 5000));
            }

            console.log('✅ Ciclo de curadoria concluído.');
        } catch (error: any) {
            console.error('❌ Erro crítico no ciclo do Arconte:', error.message);
        }
    }

    private async processMovie(movie: any, isHighTrend: boolean = false) {
        try {
            console.log(`📦 Processando: ${movie.title} (${movie.year}) ${isHighTrend ? '🔥 [Predictive Candidate]' : ''}`);

            // 2. Verificar se já existe no catálogo
            const searchResponse = await axios.get(`${BACKEND_URL}/videos?search=${encodeURIComponent(movie.title)}`);
            const existing = searchResponse.data.find((v: any) => v.title === movie.title);

            if (existing) {
                console.log(`⏩ ${movie.title} ya existe no catálogo. Pulando.`);
                return;
            }

            // 3. Buscar o melhor magnet link via Nexus Ultra Search
            console.log(`🔍 Buscando melhor fonte P2P para: ${movie.title}...`);
            const nexusResponse = await axios.post(NEXUS_URL, {
                query: `${movie.title} ${movie.year} 1080p`,
                category: 'Movies',
                limit: 3
            });

            const bestTorrent = nexusResponse.data.results?.[0];

            if (!bestTorrent || bestTorrent.seeds < 10) {
                console.log(`⚠️ Fontes insuficientes para ${movie.title}. Ignorando.`);
                return;
            }

            // 🔴 V2.6: Predictive Ingestion Logic (Dinâmica)
            const shouldPredictiveDownload = isHighTrend && bestTorrent.seeds > this.minSeedsForPredictive;

            // 4. Ingestão automática no catálogo
            await axios.post(`${BACKEND_URL}/videos/auto-ingest`, {
                title: movie.title,
                description: movie.summary || `Filme popular de ${movie.year}. Encontrado via curadoria automática.`,
                category: 'Movies',
                externalSource: bestTorrent.magnetLink,
                thumbnailUrl: movie.large_cover_image || movie.medium_cover_image,
                tags: ['Autobot', 'Trending', movie.genres?.[0] || 'Movie', '1080p'],
                predictive: shouldPredictiveDownload
            });

            if (shouldPredictiveDownload) {
                console.log(`🧠 [Predictive] ${movie.title} marcado para download automático preventivo.`);
            }

            console.log(`✨ ${movie.title} adicionado com sucesso ao catálogo!`);
        } catch (error: any) {
            console.error(`❌ Erro ao processar ${movie.title}:`, error.message);
        }
    }
}
