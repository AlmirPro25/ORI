/**
 * STREAMFORGE API DTOs (Data Transfer Objects)
 * Define as interfaces para as requisições (requests) e respostas (responses) específicas da API.
 * Estas interfaces são compartilhadas entre frontend e backend para garantir coerência de tipos.
 */

import { Video } from '@/types/schema'; // Importando types base do frontend

export interface LoginDTO {
    email: string;
    password: string;
}

export interface RegisterDTO {
    name: string;
    email: string;
    password: string;
}

export interface AuthResponse {
    token: string;
    // user?: Pick<User, 'id' | 'name' | 'email' | 'role'>; // Exemplo de inclusão de user, se a API retornar
}

export interface UploadVideoDTO {
    title: string;
    description?: string;
    file: File;
}

export interface UploadResponse {
    message: string;
    video: Video;
}
