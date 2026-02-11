import axios, { AxiosError } from 'axios';
import { useAuthStore } from '@/stores/auth.store';

// MODO PORTABLE: O backend serve os arquivos estáticos em /uploads
export const API_BASE_URL = 'http://localhost:3000';
export const STORAGE_BASE_URL = 'http://localhost:3000/uploads';

const apiClient = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 60000, // 60 segundos para buscas globais
});

// Interceptores mantidos (mesmo que auth seja mockado no portable server)
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
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

export default apiClient;
