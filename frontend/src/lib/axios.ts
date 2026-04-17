import axios, { AxiosError } from 'axios';
import { useAuthStore } from '@/stores/auth.store';
import { API_BASE_URL } from '@/lib/endpoints';

export { API_BASE_URL };
export const STORAGE_BASE_URL = API_BASE_URL ? `${API_BASE_URL}/uploads` : '/uploads';

const apiClient = axios.create({
  baseURL: API_BASE_URL ? `${API_BASE_URL}/api/v1` : '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 60000,
});

apiClient.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => Promise.reject(error)
);

export default apiClient;
