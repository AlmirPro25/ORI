import { useState, useEffect, useCallback } from 'react';
import VideoService from '@/services/api/video.service';
import { Video } from '@/types/schema';
import { UploadVideoDTO } from '@/shared/types/api';

type FeedState = {
  videos: Video[];
  loading: boolean;
  error: string | null;
};

const FEED_POLL_INTERVAL = 5000;

let sharedFeedState: FeedState = {
  videos: [],
  loading: true,
  error: null,
};

let sharedFeedPromise: Promise<Video[]> | null = null;
let sharedFeedInterval: ReturnType<typeof setInterval> | null = null;
let sharedFeedSubscribers = 0;

const listeners = new Set<(state: FeedState) => void>();

const emitFeedState = () => {
  for (const listener of listeners) {
    listener(sharedFeedState);
  }
};

const setSharedFeedState = (next: Partial<FeedState>) => {
  sharedFeedState = { ...sharedFeedState, ...next };
  emitFeedState();
};

const fetchSharedVideos = async (isSilent = false) => {
  if (sharedFeedPromise) return sharedFeedPromise;

  if (!isSilent) {
    setSharedFeedState({ loading: true });
  }

  sharedFeedPromise = VideoService.getAll()
    .then((data) => {
      setSharedFeedState({
        videos: data,
        loading: false,
        error: null,
      });
      return data;
    })
    .catch((err: any) => {
      console.error(err);
      setSharedFeedState({
        loading: false,
        error: err.message || 'Signal lost: Unable to retrieve video feed.',
      });
      throw err;
    })
    .finally(() => {
      sharedFeedPromise = null;
    });

  return sharedFeedPromise;
};

const ensureSharedFeedPolling = () => {
  if (sharedFeedInterval) return;

  sharedFeedInterval = setInterval(() => {
    void fetchSharedVideos(true);
  }, FEED_POLL_INTERVAL);
};

const teardownSharedFeedPolling = () => {
  if (!sharedFeedInterval || sharedFeedSubscribers > 0) return;
  clearInterval(sharedFeedInterval);
  sharedFeedInterval = null;
};

/**
 * Hook para o Feed Principal (Dashboard).
 * Compartilha estado e polling entre todos os consumidores para evitar rajadas de requests.
 */
export const useVideoFeed = () => {
  const [state, setState] = useState<FeedState>(sharedFeedState);

  const refresh = useCallback(async (isSilent = false) => {
    try {
      await fetchSharedVideos(isSilent);
    } catch {
      // O estado compartilhado já foi atualizado com o erro.
    }
  }, []);

  useEffect(() => {
    listeners.add(setState);
    sharedFeedSubscribers += 1;

    if (sharedFeedState.videos.length === 0 && !sharedFeedPromise) {
      void fetchSharedVideos(false);
    }

    ensureSharedFeedPolling();

    return () => {
      listeners.delete(setState);
      sharedFeedSubscribers = Math.max(0, sharedFeedSubscribers - 1);
      teardownSharedFeedPolling();
    };
  }, []);

  return {
    videos: state.videos,
    loading: state.loading,
    error: state.error,
    refresh,
  };
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
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Video signal not found.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchVideoDetails();
  }, [fetchVideoDetails]);

  useEffect(() => {
    if (!video || video.status === 'READY' || video.status === 'FAILED') return;

    const interval = setInterval(() => {
      VideoService.getById(video.id)
        .then((updated) => {
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
          console.error(`Polling error for video ${video.id}`);
        });
    }, FEED_POLL_INTERVAL);

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
      await fetchSharedVideos(true).catch(() => undefined);
      return result;
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Upload transmission interrupted.';
      setError(msg);
      throw err;
    } finally {
      setUploading(false);
    }
  };

  return { upload, uploading, progress, error };
};
