/**
 * STREAMFORGE SCHEMA DEFINITION
 * A Verdade Única compartilhada entre Frontend e Backend.
 * Baseado no Prisma Schema e OpenAPI Spec.
 */

export type Role = 'USER' | 'ADMIN';

export type VideoStatus = 'WAITING' | 'PROCESSING' | 'READY' | 'FAILED' | 'NEXUS' | 'REMOTE' | 'CATALOG';

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  createdAt: string; // ISO Date
  updatedAt: string;
}

export interface Video {
  id: string;
  title: string;
  originalTitle?: string;
  description: string | null;
  category: string;

  // State Machine
  status: VideoStatus;

  // Storage & Delivery
  originalFilename: string;
  storageKey: string;
  hlsPath: string | null;
  thumbnailPath: string | null;
  hasDubbed?: boolean;
  hasPortuguese?: boolean;
  hasPortugueseAudio?: boolean;
  hasPortugueseSubs?: boolean;
  tags?: string;

  // External Metadata
  tmdbId?: string;
  imdbId?: string;

  // Metrics
  duration: number | null;
  views: number;

  // Relations
  userId: string;
  user?: Pick<User, 'id' | 'name'>;
  comments?: Comment[];
  likes?: Like[];

  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  content: string;
  videoId: string;
  userId: string;
  user?: Pick<User, 'id' | 'name'>;
  createdAt: string;
}

export interface Like {
  id: string;
  videoId: string;
  userId: string;
  isLike: boolean;
  createdAt: string;
}
