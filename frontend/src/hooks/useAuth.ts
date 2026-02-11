import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthService from '@/services/api/auth.service';
import { useAuthStore } from '@/stores/auth.store';
import { LoginDTO, RegisterDTO } from '@/shared/types/api'; // Import from shared types

export const useAuth = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const logoutStore = useAuthStore((state) => state.logout);

  /**
   * Lógica de login: envia credenciais, armazena token, navega.
   */
  const login = async (credentials: LoginDTO) => {
    setIsLoading(true);
    setError(null);
    try {
      const { token } = await AuthService.login(credentials);
      setAuth(token); // Armazena token e decodifica user info
      navigate('/');
    } catch (err: any) {
      const message = err.response?.data?.error || 'Authentication failed. Invalid credentials.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Lógica de registro: cria usuário, navega para login.
   */
  const register = async (credentials: RegisterDTO) => {
    setIsLoading(true);
    setError(null);
    try {
      await AuthService.register(credentials);
      navigate('/login?success=true');
    } catch (err: any) {
      const message = err.response?.data?.error || 'Registration failed. Check email or try again.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Lógica de logout: limpa o estado global e redireciona.
   */
  const logout = () => {
    logoutStore();
    navigate('/login');
  };

  return {
    login,
    register,
    logout,
    isLoading,
    error,
  };
};
