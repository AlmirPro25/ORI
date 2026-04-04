import { useState, useEffect, useCallback } from 'react';
import VideoService from '@/services/api/video.service';
import { Video } from '@/types/schema'; // Changed import
import { UploadVideoDTO } from '@/shared/types/api'; // Changed import

/**
 * Hook para o Feed Principal (Dashboard).
 * Inclui polling para atualizar o status de vídeos em processamento.
 */
export const useVideoFeed = () => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVideos = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      // Busca a lista completa (inclusive WAITING/PROCESSING)
      const data = await VideoService.getAll();
      setVideos(data);
      setError(null);
    } catch (err: any) {
      console.error(err);
      if (!isSilent) setError(err.message || 'Signal lost: Unable to retrieve video feed.');
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVideos(false); // Carregamento inicial (não silencioso)

    const intervalId = setInterval(() => {
      // Polling silencioso a cada 5 segundos
      fetchVideos(true);
    }, 5000);

    return () => clearInterval(intervalId);
  }, [fetchVideos]);

  return { videos, loading, error, refresh: fetchVideos };
};

/**
 * Hook para Player Individual com Polling de Status.
 * Se o vídeo estiver processando, ele checa novamente a cada 5s.
 */
export const useVideo = (id: string | undefined) => {
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVideoDetails = useCallback(async () => {
    if (!id) return;
    try {
      const data = await VideoService.getById(id);
      setVideo(data);
    } catch (err: any) {
      setError(err.message || 'Video signal not found.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchVideoDetails();
  }, [fetchVideoDetails]);

  // Polling para atualização de status se estiver processando
  useEffect(() => {
    if (!video || video.status === 'READY' || video.status === 'FAILED') return;

    const interval = setInterval(() => {
      // Silent update: Não mostra loading spinner para não atrapalhar o usuário
      VideoService.getById(video.id)
        .then(updated => {
          // Apenas atualiza o estado se houver mudança de status
          const hasRelevantChange =
            updated.status !== video.status ||
            updated.hlsPath !== video.hlsPath ||
            updated.storageKey !== video.storageKey ||
            updated.thumbnailPath !== video.thumbnailPath ||
            updated.updatedAt !== video.updatedAt;

          if (hasRelevantChange) {
            setVideo(updated);
          }
        })
        .catch(() => {
          // Ignora erros de polling silenciosamente, mantendo o estado anterior
          console.error(`Polling error for video ${video.id}`);
        });
    }, 5000);

    return () => clearInterval(interval);
  }, [video]);

  return { video, loading, error };
};

/**
 * Hook para Upload com Progresso.
 * Gerencia o estado de upload (progresso, erro) e chama o serviço de API.
 */
export const useVideoUpload = () => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const upload = async (data: UploadVideoDTO): Promise<Video> => {
    setUploading(true);
    setProgress(0);
    setError(null);
    try {
      const result = await VideoService.upload(data, (percent) => {
        setProgress(percent);
      });
      return result;
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Upload transmission interrupted.';
      setError(msg);
      throw err; // Propaga o erro para o componente
    } finally {
      setUploading(false);
    }
  };

  return { upload, uploading, progress, error };
};
