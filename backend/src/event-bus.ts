import { EventEmitter } from 'events';

class GlobalEventBus extends EventEmitter {}

export const eventBus = new GlobalEventBus();

export enum SystemEvents {
    // Materialization lifecycle
    MATERIALIZATION_STARTED = 'materialization:started',
    MATERIALIZATION_PROGRESS = 'materialization:progress',
    MATERIALIZATION_COMPLETED = 'materialization:completed',
    MATERIALIZATION_FAILED = 'materialization:failed',

    // Arconte scan/curator
    ARCONTE_SCAN_COMPLETED = 'arconte:scan_completed',

    // 🧬 ORGANISMO VIVO: Novos eventos de proatividade
    FAVORITE_ADDED = 'favorite:added',
    ARCONTE_INSIGHT = 'arconte:insight',
    SYSTEM_ACTIVITY = 'system:activity',
}

/**
 * Tipos de atividade do sistema (para o ArcontePulse no frontend)
 */
export enum ActivityType {
    IDLE = 'idle',
    SCANNING = 'scanning',
    DOWNLOADING = 'downloading',
    ENCODING = 'encoding',
    READY = 'ready',
}
