
import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface StremioManifest {
    id: string;
    version: string;
    name: string;
    description?: string;
    resources: string[] | { name: string; types: string[]; idPrefixes?: string[] }[];
    types: string[];
    catalogs: any[];
    background?: string;
    logo?: string;
}

export class AddonService {

    /**
     * Instala um novo addon a partir da URL do manifesto
     */
    static async installAddon(manifestUrl: string) {
        try {
            // Validar e normalizar URL
            if (!manifestUrl.startsWith('http')) {
                throw new Error('URL inválida. Deve começar com http:// ou https://');
            }

            // Buscar manifesto
            console.log(`🔍 Buscando manifesto em: ${manifestUrl}`);
            const response = await axios.get(manifestUrl);
            const manifest: StremioManifest = response.data;

            if (!manifest.id || !manifest.name || !manifest.version) {
                throw new Error('Manifesto inválido: Faltam campos obrigatórios (id, name, version)');
            }

            // Verificar se já existe
            const existing = await prisma.addon.findUnique({
                where: { manifestUrl }
            });

            if (existing) {
                return { success: false, message: 'Addon já instalado', addon: existing };
            }

            // Salvar no banco
            const newAddon = await prisma.addon.create({
                data: {
                    manifestUrl,
                    name: manifest.name,
                    description: manifest.description || '',
                    version: manifest.version,
                    types: manifest.types ? JSON.stringify(manifest.types) : null,
                    resources: manifest.resources ? JSON.stringify(manifest.resources.map((r: any) => typeof r === 'string' ? r : r.name)) : null,
                    enabled: true
                }
            });

            return { success: true, message: 'Addon instalado com sucesso', addon: newAddon };

        } catch (error: any) {
            console.error('Erro ao instalar addon:', error.message);
            throw new Error(`Falha na instalação: ${error.message}`);
        }
    }

    /**
     * Lista todos os addons instalados
     */
    static async listAddons() {
        return prisma.addon.findMany({
            orderBy: { createdAt: 'desc' }
        });
    }

    /**
     * Remove um addon
     */
    static async removeAddon(id: string) {
        return prisma.addon.delete({
            where: { id }
        });
    }

    /**
     * Proxy para fazer requisições aos addons (evita CORS e centraliza lógica)
     */
    static async proxyRequest(addonId: string, resource: string, type: string, id: string, extra?: string) {
        const addon = await prisma.addon.findUnique({ where: { id: addonId } });
        if (!addon) throw new Error('Addon não encontrado');

        // Construir URL base do addon (remover manifest.json do final)
        const baseUrl = addon.manifestUrl.replace('/manifest.json', '');

        let url = `${baseUrl}/${resource}/${type}/${id}.json`;
        if (extra) {
            // Tratamento para extra args (como search) se necessário
        }

        console.log(`🔄 Proxying request to: ${url}`);

        try {
            const response = await axios.get(url);
            return response.data;
        } catch (error: any) {
            console.error(`Erro no proxy do addon ${addon.name}:`, error.message);
            throw new Error(`Erro no addon remoto: ${error.message}`);
        }
    }

    /**
     * Busca streams agregados de todos os addons instalados para um item específico
     */
    /**
     * Resolve um ID (TMDB) para IMDB ID se possível
     */
    // Cache simples de TMDB→IMDB para evitar lookups repetidos
    private static idCache = new Map<string, string>();

    private static async resolveImdbId(type: string, id: string): Promise<string> {
        // Se já for IMDB ID (começa com tt) ou for outro formato não numérico, retorna direto
        if (id.startsWith('tt') || !/^\d+$/.test(id)) {
            return id;
        }

        // Checar cache local
        const cacheKey = `${type}:${id}`;
        if (this.idCache.has(cacheKey)) {
            return this.idCache.get(cacheKey)!;
        }

        const tmdbType = type === 'series' ? 'tv' : 'movie';

        // Tentativa 1: TMDB API (se configurada)
        try {
            const apiKey = process.env.TMDB_API_KEY;
            if (apiKey) {
                const url = `https://api.themoviedb.org/3/${tmdbType}/${id}/external_ids?api_key=${apiKey}`;
                console.log(`🔄 Resolvendo ID TMDB ${id} (${tmdbType}) via TMDB API...`);
                const response = await axios.get(url, { timeout: 5000 });
                if (response.data?.imdb_id) {
                    console.log(`✅ ID Resolvido: TMDB ${id} -> IMDB ${response.data.imdb_id}`);
                    this.idCache.set(cacheKey, response.data.imdb_id);
                    return response.data.imdb_id;
                }
            }
        } catch (error: any) {
            console.warn(`⚠️ TMDB API falhou para ${type}/${id}: ${error.message}`);
        }

        // Tentativa 2: Buscar detalhes diretamente (o endpoint /movie/{id} retorna imdb_id)
        try {
            const apiKey = process.env.TMDB_API_KEY;
            if (apiKey) {
                const url = `https://api.themoviedb.org/3/${tmdbType}/${id}?api_key=${apiKey}`;
                console.log(`🔄 Tentando endpoint detalhes TMDB para ${id}...`);
                const response = await axios.get(url, { timeout: 5000 });
                if (response.data?.imdb_id) {
                    console.log(`✅ ID Resolvido via detalhes: TMDB ${id} -> IMDB ${response.data.imdb_id}`);
                    this.idCache.set(cacheKey, response.data.imdb_id);
                    return response.data.imdb_id;
                }
                // Para séries, o campo é external_ids separado
                if (tmdbType === 'tv' && response.data?.name) {
                    // Tentar external_ids (segunda chamada para séries)
                    try {
                        const extUrl = `https://api.themoviedb.org/3/tv/${id}/external_ids?api_key=${apiKey}`;
                        const extRes = await axios.get(extUrl, { timeout: 5000 });
                        if (extRes.data?.imdb_id) {
                            console.log(`✅ ID Resolvido via external_ids: TMDB ${id} -> IMDB ${extRes.data.imdb_id}`);
                            this.idCache.set(cacheKey, extRes.data.imdb_id);
                            return extRes.data.imdb_id;
                        }
                    } catch { /* ignora */ }
                }
            }
        } catch (error: any) {
            console.warn(`⚠️ TMDB detalhes falhou para ${type}/${id}: ${error.message}`);
        }

        console.warn(`⚠️ Não foi possível resolver IMDB ID para TMDB ${id}. Usando ID numérico.`);
        return id;
    }

    /**
     * Busca streams agregados de todos os addons instalados para um item específico
     */
    static async getStreamsFromAllAddons(type: string, id: string) {
        // Tentar resolver para IMDB ID primeiro
        const targetId = await this.resolveImdbId(type, id);

        const addons = await prisma.addon.findMany({ where: { enabled: true } });
        const allStreams: any[] = [];

        await Promise.all(addons.map(async (addon) => {
            try {
                // Verificar se o addon suporta streams para este tipo (simplificado)
                // Idealmente teríamos cacheado o manifesto pra checar 'resources' e 'types'
                const baseUrl = addon.manifestUrl.replace('/manifest.json', '');

                // Construir URL de stream com o ID resolvido
                const url = `${baseUrl}/stream/${type}/${targetId}.json`;
                // console.log(`Searching streams in ${addon.name} for ${targetId}`);

                const response = await axios.get(url, { timeout: 5000 }); // Timeout curto para não travar
                if (response.data && response.data.streams) {
                    // Adicionar nome do addon aos streams para identificação
                    const streams = response.data.streams.map((s: any) => ({
                        ...s,
                        addonName: addon.name,
                        _addonId: addon.id,
                        // Adicionar metadados extras se não tiverem
                        title: s.title || s.name || s.description || `Stream ${addon.name}`
                    }));
                    allStreams.push(...streams);
                }
            } catch (e) {
                // Ignorar erros de addons individuais (um falhar não deve parar tudo)
                // console.warn(`Addon ${addon.name} falhou ao retornar streams: ${e.message}`);
            }
        }));

        return allStreams;
    }
}
