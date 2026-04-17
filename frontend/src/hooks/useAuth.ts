import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthService from '@/services/api/auth.service';
import { useAuthStore } from '@/stores/auth.store';
import { LoginDTO, RegisterDTO } from '@/shared/types/api'; // Import from shared types

const normalizeAuthError = (fallback: string, err: any) => {
  const rawMessage = err?.response?.data?.error || err?.message || fallback;
  const normalized = String(rawMessage).toLowerCase();

  if (normalized.includes('credenciais invalidas') || normalized.includes('invalid credentials')) {
    return 'Email ou senha incorretos.';
  }

  if (normalized.includes('email ja cadastrado') || normalized.includes('email already')) {
    return 'Este email ja esta em uso.';
  }

  if (normalized.includes('email invalido')) {
    return 'Digite um email valido.';
  }

  if (normalized.includes('senha deve ter')) {
    return 'A senha precisa ter pelo menos 4 caracteres.';
  }

  if (normalized.includes('nome deve ter')) {
    return 'Seu nome precisa ter pelo menos 2 caracteres.';
  }

  if (normalized.includes('network error')) {
    return 'Nao foi possivel falar com o servidor agora. Tente de novo em instantes.';
  }

  if (
    normalized.includes('failed to fetch') ||
    normalized.includes('load failed') ||
    normalized.includes('timeout') ||
    normalized.includes('econnrefused') ||
    normalized.includes('impossivel conectar-se ao servidor remoto') ||
    normalized.includes('nao foi possivel falar com o servidor')
  ) {
    return 'O celular nao conseguiu alcancar o backend. Abra pelo IP do PC e confirme as portas 3000 e 3333 liberadas na rede local.';
  }

  return rawMessage;
};

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
      const message = normalizeAuthError('Nao foi possivel entrar agora.', err);
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
      navigate(`/login?success=true&email=${encodeURIComponent(credentials.email)}`);
    } catch (err: any) {
      const message = normalizeAuthError('Nao foi possivel criar sua conta agora.', err);
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
