/**
 * 🔍 TORRENT EXPLORER SERVICE V2
 * 
 * Permite inspecionar o conteúdo de um torrent (magnet link)
 * sem baixar os arquivos reais.
 * 
 * V2 Improvements:
 * - Filtragem inteligente (remove samples, NFOs, legendas)
 * - Deduplicação por qualidade (mantém melhor encode)
 * - Suporte a multi-episódio (S01E01E02 expandido)
 * - Detecção de episódios especiais (S00)
 * - Detecção de season packs vs episode packs
 * - Detecção de codec/áudio
 */

import { episodeParser, ParsedEpisode } from './episode-parser';

export interface TorrentFileMetadata {
    name: string;
    path: string;
    length: number;
    index: number;
    isSeries: boolean;
    isVideo: boolean;
    isSubtitle: boolean;
    isSample: boolean;
    season?: number;
    episode?: number;
    episodeEnd?: number;
    quality?: string;
    codec?: string;
    audioCodec?: string;
    seriesName?: string;
    isSpecial?: boolean;
    isMultiEpisode?: boolean;
}

export interface TorrentMetadata {
    infoHash: string;
    name: string;
    totalFiles: number;
    totalSize: number;         // bytes
    files: TorrentFileMetadata[];
    // Resumo inteligente
    detectedSeriesName?: string;
    detectedSeasons: number[];
    episodeCount: number;
    qualityProfile?: string;   // "1080p" se todos são 1080p
    isSeasonPack: boolean;
    isCompleteSeries: boolean;
    hasSpecials: boolean;
    hasDuplicates: boolean;
    warnings: string[];
}

let client: any = null;

async function getWebTorrentClient() {
    if (!client) {
        // @ts-ignore
        const webtorrentModule = await (new Function('return import("webtorrent")')());
        const WebTorrent = webtorrentModule.default;
        client = new WebTorrent();
    }
    return client;
}

export class TorrentExplorer {
    /**
     * Explora um magnet link e retorna a lista de arquivos com análise completa
     */
    static async explore(magnetURI: string, timeoutMs: number = 30000): Promise<TorrentMetadata> {
        const wtClient = await getWebTorrentClient();

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                try { wtClient.remove(magnetURI); } catch (_) { }
                reject(new Error('Timeout ao buscar metadados do torrent. Verifique sua conexão e se há seeds.'));
            }, timeoutMs);

            // Verificar se o torrent já está ativo para evitar "duplicate torrent"
            const existingTorrent = wtClient.torrents.find((t: any) => {
                const hash = magnetURI.match(/btih:([a-fA-F0-9]{40})/)?.[1]?.toLowerCase();
                return hash && t.infoHash === hash;
            });

            if (existingTorrent) {
                clearTimeout(timeout);
                try {
                    const result = TorrentExplorer.analyzeTorrent(existingTorrent);
                    resolve(result);
                } catch (err) {
                    reject(err);
                }
                return;
            }

            wtClient.add(magnetURI, { announce: [], path: require('os').tmpdir() }, (torrent: any) => {
                clearTimeout(timeout);

                try {
                    const result = TorrentExplorer.analyzeTorrent(torrent);

                    // Remover do cliente para não gastar recursos
                    torrent.destroy();

                    resolve(result);
                } catch (err) {
                    try { torrent.destroy(); } catch (_) { }
                    reject(err);
                }
            });
        });
    }

    /**
     * Análise profunda do torrent
     */
    private static analyzeTorrent(torrent: any): TorrentMetadata {
        const warnings: string[] = [];

        // 1. Mapear TODOS os arquivos
        const allFiles: TorrentFileMetadata[] = torrent.files.map((file: any, index: number) => {
            const isVideo = episodeParser.isVideoFile(file.name);
            const isSubtitle = episodeParser.isSubtitleFile(file.name);
            const isSample = episodeParser.isSampleFile(file.name);

            const parsed = isVideo ? episodeParser.parse(file.name) : null;

            return {
                name: file.name,
                path: file.path,
                length: file.length,
                index,
                isSeries: !!parsed,
                isVideo,
                isSubtitle,
                isSample,
                season: parsed?.seasonNumber,
                episode: parsed?.episodeNumber,
                episodeEnd: parsed?.episodeEndNumber,
                quality: parsed?.quality,
                codec: parsed?.codec,
                audioCodec: parsed?.audioCodec,
                seriesName: parsed?.seriesName,
                isSpecial: parsed?.isSpecial,
                isMultiEpisode: parsed?.isMultiEpisode,
            };
        });

        // 2. Extrair episódios de vídeo válidos
        const videoFiles = allFiles.filter(f => f.isVideo && f.isSeries && !f.isSample);
        const sampleFiles = allFiles.filter(f => f.isSample);

        if (sampleFiles.length > 0) {
            warnings.push(`${sampleFiles.length} arquivo(s) sample/extra ignorado(s)`);
        }

        // 3. Detectar duplicatas (mesmo S/E, qualidades diferentes)
        const episodeMap = new Map<string, TorrentFileMetadata[]>();
        for (const file of videoFiles) {
            const key = `S${file.season ?? '?'}E${file.episode ?? '?'}`;
            if (!episodeMap.has(key)) episodeMap.set(key, []);
            episodeMap.get(key)!.push(file);
        }

        const hasDuplicates = Array.from(episodeMap.values()).some(files => files.length > 1);
        if (hasDuplicates) {
            const dupCount = Array.from(episodeMap.values()).filter(f => f.length > 1).length;
            warnings.push(`${dupCount} episódio(s) com múltiplas versões detectado(s). Melhor qualidade será selecionada.`);
        }

        // 4. Detectar multi-episódio
        const multiEpFiles = videoFiles.filter(f => f.isMultiEpisode);
        if (multiEpFiles.length > 0) {
            warnings.push(`${multiEpFiles.length} arquivo(s) multi-episódio detectado(s) (ex: E01E02 no mesmo arquivo)`);
        }

        // 5. Detectar specials
        const hasSpecials = videoFiles.some(f => f.isSpecial);
        if (hasSpecials) {
            const specialCount = videoFiles.filter(f => f.isSpecial).length;
            warnings.push(`${specialCount} episódio(s) especial(is) detectado(s) (S00)`);
        }

        // 6. Detectar nome da série (consenso entre os arquivos)
        const seriesNames = videoFiles.map(f => f.seriesName).filter(Boolean) as string[];
        const detectedSeriesName = TorrentExplorer.findConsensusName(seriesNames);

        // 7. Detectar temporadas presentes
        const seasons = [...new Set(videoFiles.map(f => f.season).filter((s): s is number => s !== undefined))].sort();

        // 8. Detectar qualidade predominante
        const qualities = videoFiles.map(f => f.quality).filter(Boolean) as string[];
        const qualityProfile = qualities.length > 0 ? TorrentExplorer.findMostCommon(qualities) : undefined;

        // 9. Detectar tipo de pack
        const isSeasonPack = seasons.length === 1 && videoFiles.length >= 3;
        const isCompleteSeries = seasons.length > 1;

        // 10. Verificar gaps (episódios faltando)
        if (isSeasonPack && seasons.length === 1) {
            const episodes = videoFiles
                .filter(f => f.season === seasons[0])
                .map(f => f.episode!)
                .sort((a, b) => a - b);

            if (episodes.length >= 2) {
                const min = episodes[0];
                const max = episodes[episodes.length - 1];
                const expected = max - min + 1;
                if (episodes.length < expected) {
                    const missing = [];
                    for (let i = min; i <= max; i++) {
                        if (!episodes.includes(i)) missing.push(i);
                    }
                    warnings.push(`Episódio(s) faltando: ${missing.map(m => `E${String(m).padStart(2, '0')}`).join(', ')}`);
                }
            }
        }

        return {
            infoHash: torrent.infoHash,
            name: torrent.name,
            totalFiles: allFiles.length,
            totalSize: torrent.length || allFiles.reduce((sum, f) => sum + f.length, 0),
            files: allFiles,
            detectedSeriesName,
            detectedSeasons: seasons,
            episodeCount: videoFiles.length,
            qualityProfile,
            isSeasonPack,
            isCompleteSeries,
            hasSpecials,
            hasDuplicates,
            warnings,
        };
    }

    /**
     * Encontra o nome mais frequente (consenso)
     */
    private static findConsensusName(names: string[]): string | undefined {
        if (names.length === 0) return undefined;

        const freq = new Map<string, number>();
        for (const name of names) {
            const normalized = name.toLowerCase().trim();
            freq.set(normalized, (freq.get(normalized) || 0) + 1);
        }

        const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
        // Retornar o original (com case preservado) mais frequente
        const winner = sorted[0][0];
        return names.find(n => n.toLowerCase().trim() === winner) || names[0];
    }

    /**
     * Encontra o valor mais frequente
     */
    private static findMostCommon(values: string[]): string {
        const freq = new Map<string, number>();
        for (const v of values) {
            freq.set(v, (freq.get(v) || 0) + 1);
        }
        return [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }
}
