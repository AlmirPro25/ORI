import apiClient from '@/lib/axios';
import { User } from '@/types/schema'; // User model is from frontend schema
import { LoginDTO, RegisterDTO, AuthResponse } from '@/shared/types/api'; // DTOs are from shared api types

class AuthService {
  private static ENDPOINT = '/auth';

  /**
   * Registra um novo usuário (Engenheiro Operacional).
   */
  static async register(data: RegisterDTO): Promise<User> {
    const response = await apiClient.post<User>(`${this.ENDPOINT}/register`, data);
    return response.data;
  }

  /**
   * Autentica um usuário e retorna o token JWT.
   */
  static async login(data: LoginDTO): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>(`${this.ENDPOINT}/login`, data);
    return response.data;
  }
}

export default AuthService;
