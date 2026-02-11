/**
 * DUBBING SERVICE - Sistema de Dublagem AI
 * ==========================================
 * Converte legendas em áudio sincronizado usando TTS
 * Suporta múltiplos idiomas: PT-BR, EN, ES, FR, DE, IT, JA, KO
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import winston from 'winston';

const execAsync = promisify(exec);

const logger = winston.createLogger({
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
    ),
    transports: [new winston.transports.Console()]
});

// Vozes disponíveis por idioma (Microsoft Edge TTS)
const VOICE_MAP: Record<string, { voice: string, name: string }> = {
    'pt-BR': { voice: 'pt-BR-FranciscaNeural', name: 'Francisca (Brasil)' },
    'pt-PT': { voice: 'pt-PT-RaquelNeural', name: 'Raquel (Portugal)' },
    'en-US': { voice: 'en-US-JennyNeural', name: 'Jenny (US)' },
    'en-GB': { voice: 'en-GB-SoniaNeural', name: 'Sonia (UK)' },
    'es-ES': { voice: 'es-ES-ElviraNeural', name: 'Elvira (Espanha)' },
    'es-MX': { voice: 'es-MX-DaliaNeural', name: 'Dalia (México)' },
    'fr-FR': { voice: 'fr-FR-DeniseNeural', name: 'Denise (França)' },
    'de-DE': { voice: 'de-DE-KatjaNeural', name: 'Katja (Alemanha)' },
    'it-IT': { voice: 'it-IT-ElsaNeural', name: 'Elsa (Itália)' },
    'ja-JP': { voice: 'ja-JP-NanamiNeural', name: 'Nanami (Japão)' },
    'ko-KR': { voice: 'ko-KR-SunHiNeural', name: 'SunHi (Coreia)' },
    'zh-CN': { voice: 'zh-CN-XiaoxiaoNeural', name: 'Xiaoxiao (China)' },
    'ru-RU': { voice: 'ru-RU-SvetlanaNeural', name: 'Svetlana (Rússia)' },
};

interface SubtitleCue {
    startTime: number; // em segundos
    endTime: number;
    text: string;
}

interface DubbingOptions {
    targetLanguage: string;
    sourceSubtitlePath?: string;
    subtitleContent?: string;
    outputDir: string;
    videoId: string;
}

interface DubbingResult {
    success: boolean;
    audioPath?: string;
    language: string;
    duration?: number;
    error?: string;
}

export class DubbingService {
    private outputBaseDir: string;

    constructor() {
        this.outputBaseDir = path.join(__dirname, '../uploads/dubbing');
        if (!fs.existsSync(this.outputBaseDir)) {
            fs.mkdirSync(this.outputBaseDir, { recursive: true });
        }
    }

    /**
     * Lista vozes disponíveis por idioma
     */
    getAvailableVoices() {
        return Object.entries(VOICE_MAP).map(([code, info]) => ({
            code,
            voice: info.voice,
            name: info.name
        }));
    }

    /**
     * Converte tempo SRT/VTT para segundos
     */
    private parseTime(timeStr: string): number {
        // Formato: HH:MM:SS,mmm ou HH:MM:SS.mmm
        const parts = timeStr.replace(',', '.').split(':');
        const hours = parseInt(parts[0]) || 0;
        const minutes = parseInt(parts[1]) || 0;
        const seconds = parseFloat(parts[2]) || 0;
        return hours * 3600 + minutes * 60 + seconds;
    }

    /**
     * Parse de arquivo SRT/VTT para array de cues
     */
    parseSRT(content: string): SubtitleCue[] {
        const cues: SubtitleCue[] = [];
        const lines = content.split('\n').map(l => l.trim());

        let i = 0;
        while (i < lines.length) {
            // Pular linhas vazias e header WEBVTT
            if (!lines[i] || lines[i] === 'WEBVTT' || lines[i].startsWith('NOTE')) {
                i++;
                continue;
            }

            // Pular número do cue (se for número)
            if (/^\d+$/.test(lines[i])) {
                i++;
            }

            // Linha de tempo: 00:00:01,000 --> 00:00:04,000
            const timeLine = lines[i];
            if (timeLine && timeLine.includes('-->')) {
                const [startStr, endStr] = timeLine.split('-->').map(t => t.trim());
                const startTime = this.parseTime(startStr);
                const endTime = this.parseTime(endStr);
                i++;

                // Coletar texto (pode ser múltiplas linhas)
                const textLines: string[] = [];
                while (i < lines.length && lines[i] && !lines[i].includes('-->') && !/^\d+$/.test(lines[i])) {
                    // Remover tags HTML/styling
                    const cleanText = lines[i]
                        .replace(/<[^>]*>/g, '')
                        .replace(/\{[^}]*\}/g, '')
                        .trim();
                    if (cleanText) textLines.push(cleanText);
                    i++;
                }

                if (textLines.length > 0) {
                    cues.push({
                        startTime,
                        endTime,
                        text: textLines.join(' ')
                    });
                }
            } else {
                i++;
            }
        }

        return cues;
    }

    /**
     * Gera áudio para um texto usando Edge TTS (via edge-tts Python ou API)
     */
    async generateTTSAudio(text: string, language: string, outputPath: string): Promise<boolean> {
        const voiceInfo = VOICE_MAP[language] || VOICE_MAP['pt-BR'];

        try {
            // Método 1: Usar edge-tts via Python (mais confiável)
            // Requer: pip install edge-tts
            const escapedText = text.replace(/"/g, '\\"').replace(/\n/g, ' ');
            const command = `edge-tts --voice "${voiceInfo.voice}" --text "${escapedText}" --write-media "${outputPath}"`;

            await execAsync(command, { timeout: 30000 });
            return fs.existsSync(outputPath);

        } catch (edgeError) {
            logger.warn(`[DUBBING] Edge TTS falhou, tentando método alternativo...`);

            try {
                // Método 2: Google Translate TTS (fallback limitado)
                const gttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${language.split('-')[0]}&client=tw-ob`;

                const response = await axios.get(gttsUrl, {
                    responseType: 'arraybuffer',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 15000
                });

                fs.writeFileSync(outputPath, response.data);
                return true;

            } catch (gttsError: any) {
                logger.error(`[DUBBING] Todos os métodos TTS falharam: ${gttsError.message}`);
                return false;
            }
        }
    }

    /**
     * Combina múltiplos arquivos de áudio com timing correto usando FFmpeg
     */
    async combineAudioWithTiming(
        cues: SubtitleCue[],
        audioFiles: string[],
        outputPath: string,
        totalDuration: number
    ): Promise<boolean> {
        try {
            // Criar filtro complexo para posicionar áudios no tempo correto
            const filterParts: string[] = [];
            const inputs: string[] = [];

            for (let i = 0; i < audioFiles.length; i++) {
                if (!fs.existsSync(audioFiles[i])) continue;

                inputs.push(`-i "${audioFiles[i]}"`);
                const delay = Math.round(cues[i].startTime * 1000); // ms
                filterParts.push(`[${i}:a]adelay=${delay}|${delay}[a${i}]`);
            }

            if (inputs.length === 0) {
                logger.error('[DUBBING] Nenhum arquivo de áudio válido para combinar');
                return false;
            }

            // Mixar todos os áudios com volume normalizado
            const mixInputs = filterParts.map((_, i) => `[a${i}]`).join('');
            const filterComplex = `${filterParts.join(';')};${mixInputs}amix=inputs=${inputs.length}:duration=longest:normalize=0[out]`;

            const command = `ffmpeg -y ${inputs.join(' ')} -filter_complex "${filterComplex}" -map "[out]" -t ${totalDuration} "${outputPath}"`;

            await execAsync(command, { timeout: 300000 }); // 5 min timeout
            return fs.existsSync(outputPath);

        } catch (error: any) {
            logger.error(`[DUBBING] Erro ao combinar áudios: ${error.message}`);
            return false;
        }
    }

    /**
     * Processo principal de dublagem
     */
    async generateDubbing(options: DubbingOptions): Promise<DubbingResult> {
        const { targetLanguage, subtitleContent, sourceSubtitlePath, outputDir, videoId } = options;

        logger.info(`[DUBBING] 🎙️ Iniciando dublagem para ${targetLanguage} | Vídeo: ${videoId}`);

        try {
            // 1. Obter conteúdo da legenda
            let srtContent = subtitleContent;
            if (!srtContent && sourceSubtitlePath) {
                if (!fs.existsSync(sourceSubtitlePath)) {
                    return { success: false, language: targetLanguage, error: 'Arquivo de legenda não encontrado' };
                }
                srtContent = fs.readFileSync(sourceSubtitlePath, 'utf-8');
            }

            if (!srtContent) {
                return { success: false, language: targetLanguage, error: 'Conteúdo de legenda vazio' };
            }

            // 2. Parse da legenda
            const cues = this.parseSRT(srtContent);
            if (cues.length === 0) {
                return { success: false, language: targetLanguage, error: 'Nenhum texto encontrado na legenda' };
            }

            logger.info(`[DUBBING] 📝 ${cues.length} blocos de texto encontrados`);

            // 3. Criar diretório de trabalho
            const workDir = path.join(outputDir || this.outputBaseDir, videoId, targetLanguage);
            if (!fs.existsSync(workDir)) {
                fs.mkdirSync(workDir, { recursive: true });
            }

            // 4. Gerar áudio para cada cue
            const audioFiles: string[] = [];
            let successCount = 0;

            for (let i = 0; i < cues.length; i++) {
                const audioPath = path.join(workDir, `cue_${i.toString().padStart(4, '0')}.mp3`);

                // Log de progresso a cada 10 cues
                if (i % 10 === 0) {
                    logger.info(`[DUBBING] 🔊 Processando cue ${i + 1}/${cues.length}...`);
                }

                const success = await this.generateTTSAudio(cues[i].text, targetLanguage, audioPath);
                if (success) {
                    audioFiles.push(audioPath);
                    successCount++;
                } else {
                    audioFiles.push(''); // placeholder
                }
            }

            logger.info(`[DUBBING] ✅ ${successCount}/${cues.length} áudios gerados com sucesso`);

            // 5. Calcular duração total do vídeo (último cue + margem)
            const totalDuration = cues[cues.length - 1].endTime + 5;

            // 6. Combinar áudios com timing
            const finalAudioPath = path.join(workDir, `dubbing_${targetLanguage}.mp3`);
            const combined = await this.combineAudioWithTiming(cues, audioFiles, finalAudioPath, totalDuration);

            if (!combined) {
                // Fallback: sem combinação, retorna primeiro áudio como demo
                return {
                    success: false,
                    language: targetLanguage,
                    error: 'Falha ao combinar áudios. Verifique se FFmpeg está instalado.'
                };
            }

            // 7. Limpar arquivos temporários
            for (const file of audioFiles) {
                if (file && fs.existsSync(file)) {
                    fs.unlinkSync(file);
                }
            }

            logger.info(`[DUBBING] 🎬 Dublagem finalizada: ${finalAudioPath}`);

            return {
                success: true,
                audioPath: finalAudioPath,
                language: targetLanguage,
                duration: totalDuration
            };

        } catch (error: any) {
            logger.error(`[DUBBING] ❌ Erro na dublagem: ${error.message}`);
            return { success: false, language: targetLanguage, error: error.message };
        }
    }

    /**
     * Gera áudio de preview rápido (sem combinar - apenas um trecho)
     */
    async generatePreview(text: string, language: string): Promise<{ success: boolean, audioPath?: string }> {
        const previewDir = path.join(this.outputBaseDir, 'previews');
        if (!fs.existsSync(previewDir)) {
            fs.mkdirSync(previewDir, { recursive: true });
        }

        const filename = `preview_${language}_${Date.now()}.mp3`;
        const outputPath = path.join(previewDir, filename);

        const success = await this.generateTTSAudio(text, language, outputPath);

        return {
            success,
            audioPath: success ? outputPath : undefined
        };
    }
}

export const dubbingService = new DubbingService();
