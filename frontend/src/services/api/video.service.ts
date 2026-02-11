import apiClient from '@/lib/axios';
import { Video } from '@/types/schema';
import { UploadVideoDTO, UploadResponse } from '@/shared/types/api';

class VideoService {
  private static ENDPOINT = '/videos';

  static async getAll(): Promise<Video[]> {
    const response = await apiClient.get<Video[]>(this.ENDPOINT);
    return response.data;
  }

  static async getById(id: string): Promise<Video> {
    const response = await apiClient.get<Video>(`${this.ENDPOINT}/${id}`);
    return response.data;
  }

  static async upload(data: UploadVideoDTO & { thumbnail?: File }, onProgress?: (percent: number) => void): Promise<Video> {
    const formData = new FormData();
    formData.append('title', data.title);
    if (data.description) formData.append('description', data.description);
    formData.append('file', data.file);
    if (data.thumbnail) formData.append('thumbnail', data.thumbnail);

    const response = await apiClient.post<UploadResponse>(`${this.ENDPOINT}/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 0,
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percentCompleted);
        }
      },
    });

    return response.data.video;
  }

  static async delete(id: string): Promise<void> {
    await apiClient.delete(`${this.ENDPOINT}/${id}`);
  }

  /**
   * 🧠 V2.5: Boost de demanda (Netflix thinking)
   */
  static async boostDemand(videoId: string, type: 'PLAY_ATTEMPT' | 'SEARCH' | 'FAVORITE' = 'PLAY_ATTEMPT'): Promise<void> {
    try {
      await apiClient.post(`/downloads/${videoId}/boost`, { type });
    } catch (err) {
      console.warn('[VideoService] Erro ao registrar boost:', err);
    }
  }
}

export default VideoService;
