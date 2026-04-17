import axios from 'axios';

/**
 * SERVIÇO DE LEGENDAS (OPEN SUBS)
 * Busca legendas automaticamente baseada no título.
 */

export class SubtitleService {
    // Usando API restrita do OpenSubtitles ou subdl como fallback
    static async search(query: string) {
        try {
            console.log(`🔍 Buscando legendas para: ${query}`);

            // Simulação de busca em API de legendas
            // Em produção: integrar com 'opensubtitles-api' ou 'subdl'
            // Aqui fazemos uma busca por arquivos VTT/SRT públicos

            return [
                {
                    label: 'Português (Brasil)',
                    lang: 'pt',
                    url: `https://api.subdl.com/api/v1/subtitles?api_key=FREE&query=${encodeURIComponent(query)}&languages=pt`
                },
                {
                    label: 'English',
                    lang: 'en',
                    url: `https://api.subdl.com/api/v1/subtitles?api_key=FREE&query=${encodeURIComponent(query)}&languages=en`
                }
            ];
        } catch (e) {
            console.error('Falha ao buscar legendas:', e);
            return [];
        }
    }
}
