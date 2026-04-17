// @ts-nocheck
import { Worker } from 'bullmq';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import prisma from '../utils/prisma';
import { uploadDirectoryToS3 } from '../utils/s3';
import env from '../config/env';

// Configuração do Worker
const worker = new Worker('video-transcoding', async (job) => {
  const { videoId, filePath } = job.data;

  console.log(`[Worker] 🏭 Processing Job ${job.id}: Video ${videoId}`);

  try {
    // 1. Atualiza Status para PROCESSING
    await prisma.video.update({
      where: { id: videoId },
      data: { status: 'PROCESSING', jobId: job.id },
    });

    // 2. Preparar diretórios
    const outputDir = path.resolve(__dirname, `../../uploads/hls/${videoId}`);
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
    fs.mkdirSync(outputDir, { recursive: true });

    // Definição das qualidades (Ladder de Encoding)
    const renditions = [
      { name: '360p', resolution: '640x360', bitrate: '800k', audioRate: '96k' },
      { name: '720p', resolution: '1280x720', bitrate: '2500k', audioRate: '128k' }
    ];

    const masterPlaylistPath = path.join(outputDir, 'index.m3u8');
    let masterPlaylistContent = '#EXTM3U\n#EXT-X-VERSION:3\n';

    // 3. Transcodificação FFmpeg (Multi-bitrate)
    for (const rendition of renditions) {
      console.log(`[Worker] Rendering ${rendition.name}...`);

      const renditionDir = path.join(outputDir, rendition.name);
      fs.mkdirSync(renditionDir);

      await new Promise<void>((resolve, reject) => {
        ffmpeg(filePath)
          .outputOptions([
            `-vf scale=${rendition.resolution}`,
            `-b:v ${rendition.bitrate}`,
            `-maxrate ${rendition.bitrate}`,
            '-bufsize 1000k',
            `-b:a ${rendition.audioRate}`,
            '-hls_time 10',
            '-hls_playlist_type VOD',
            '-hls_segment_filename', path.join(renditionDir, 'segment_%03d.ts')
          ])
          .output(path.join(renditionDir, 'index.m3u8'))
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run();
      });

      // Adiciona entrada na Master Playlist
      masterPlaylistContent += `#EXT-X-STREAM-INF:BANDWIDTH=${parseInt(rendition.bitrate) * 1000},RESOLUTION=${rendition.resolution}\n`;
      masterPlaylistContent += `${rendition.name}/index.m3u8\n`;
    }

    // Escreve a Master Playlist
    fs.writeFileSync(masterPlaylistPath, masterPlaylistContent);

    console.log(`[Worker] FFmpeg finished for ${videoId}. Uploading structure to S3...`);

    // 4. Upload Recursivo para S3/MinIO
    const s3Folder = `videos/${videoId}`;
    await uploadDirectoryToS3(outputDir, s3Folder);

    // 5. Cleanup
    fs.rmSync(outputDir, { recursive: true, force: true });
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    // 6. Atualiza Status para READY
    await prisma.video.update({
      where: { id: videoId },
      data: {
        status: 'READY',
        storageKey: s3Folder,
        hlsPath: `${s3Folder}/index.m3u8` // Aponta para a master playlist
      },
    });

    console.log(`[Worker] Job ${job.id} Completed.`);

  } catch (error) {
    console.error(`[Worker] Job ${job.id} Failed:`, error);
    await prisma.video.update({
      where: { id: videoId },
      data: { status: 'FAILED' },
    });
    throw error;
  }
}, {
  connection: {
    host: env.REDIS_HOST,
    port: parseInt(env.REDIS_PORT),
  }
});

export default worker;
