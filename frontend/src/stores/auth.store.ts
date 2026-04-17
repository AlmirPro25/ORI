import { create } from 'zustand';
import { jwtDecode } from 'jwt-decode';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  setAuth: (token: string) => void;
  logout: () => void;
}

const STORAGE_KEY = 'streamforge-auth';

export const useAuthStore = create<AuthState>((set) => {
  // Inicialização síncrona do estado a partir do localStorage
  const token = localStorage.getItem(STORAGE_KEY);
  let user: User | null = null;
  let isAuthenticated = false;

  if (token) {
    try {
      user = jwtDecode<User>(token);
      // Validar expiração aqui se necessário
      isAuthenticated = true;
    } catch (error) {
      console.error('Invalid token in local storage:', error);
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  return {
    token,
    user,
    isAuthenticated,
    setAuth: (newToken: string) => {
      try {
        const decodedUser = jwtDecode<User>(newToken);
        localStorage.setItem(STORAGE_KEY, newToken);
        set({ token: newToken, user: decodedUser, isAuthenticated: true });
      } catch (error) {
        console.error('Failed to decode token:', error);
      }
    },
    logout: () => {
      localStorage.removeItem(STORAGE_KEY);
      set({ token: null, user: null, isAuthenticated: false });
    },
  };
});
