// @ts-nocheck
import { Queue } from 'bullmq';
import env from '../config/env';

// Definição da Fila
export const videoQueue = new Queue('video-transcoding', {
  connection: {
    host: env.REDIS_HOST,
    port: parseInt(env.REDIS_PORT),
  },
});

interface VideoJobData {
  videoId: string;
  filePath: string;
  originalName: string;
}

export const addVideoJob = async (data: VideoJobData) => {
  await videoQueue.add('transcode', data, {
    attempts: 3, // Tenta 3 vezes se falhar
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: true,
  });
};
