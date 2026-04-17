/**
 * 🏗️ BOOTSTRAP: FFmpeg Configuration
 * Inicializa FFmpeg com os binários locais do projeto.
 */
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';

export function bootstrapFFmpeg(): void {
    try {
        ffmpeg.setFfmpegPath(ffmpegInstaller.path);
        ffmpeg.setFfprobePath(ffprobeInstaller.path);
        console.log(`🎬 [Bootstrap] FFmpeg: ${ffmpegInstaller.path}`);
        console.log(`🎬 [Bootstrap] FFprobe: ${ffprobeInstaller.path}`);
    } catch (error) {
        console.warn('⚠️ [Bootstrap] FFmpeg não encontrado. Funcionalidades de transcodificação indisponíveis.');
    }
}
