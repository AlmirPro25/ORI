import axios from 'axios';
import { SystemTelemetry } from '../services/system-telemetry';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type CircuitState = {
    consecutiveFailures: number;
    openedUntil: number;
};

type BasicAxiosError = {
    response?: {
        status?: number;
        statusText?: string;
    };
    code?: string;
    message?: string;
};

type BasicAxiosRequestConfig = {
    data?: any;
    headers?: Record<string, string>;
    params?: Record<string, unknown>;
    timeout?: number;
    method?: string;
    [key: string]: any;
};

type BasicAxiosResponse = {
    data: any;
    status: number;
};

export type ResilientRequestConfig = BasicAxiosRequestConfig & {
    serviceName?: string;
    retryAttempts?: number;
    retryDelayMs?: number;
    circuitBreakerThreshold?: number;
    circuitBreakerCooldownMs?: number;
    timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = Number(process.env.HTTP_TIMEOUT_MS || 8000);
const DEFAULT_RETRY_ATTEMPTS = Number(process.env.HTTP_RETRY_ATTEMPTS || 2);
const DEFAULT_RETRY_DELAY_MS = Number(process.env.HTTP_RETRY_DELAY_MS || 350);
const DEFAULT_CIRCUIT_BREAKER_THRESHOLD = Number(process.env.HTTP_CIRCUIT_BREAKER_THRESHOLD || 4);
const DEFAULT_CIRCUIT_BREAKER_COOLDOWN_MS = Number(process.env.HTTP_CIRCUIT_BREAKER_COOLDOWN_MS || 20000);

const circuitRegistry = new Map<string, CircuitState>();

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function inferServiceName(url?: string, explicitName?: string) {
    if (explicitName) return explicitName;

    try {
        const parsed = new URL(String(url || ''));
        return parsed.hostname || 'unknown-service';
    } catch {
        return 'unknown-service';
    }
}

function getCircuitState(serviceName: string): CircuitState {
    const existing = circuitRegistry.get(serviceName);
    if (existing) return existing;

    const initialState: CircuitState = {
        consecutiveFailures: 0,
        openedUntil: 0,
    };
    circuitRegistry.set(serviceName, initialState);
    return initialState;
}

function isRetryableError(error: unknown) {
    const axiosError = error as BasicAxiosError;
    const status = axiosError.response?.status;
    const code = axiosError.code || '';

    if (!axiosError.response) {
        return [
            'ECONNABORTED',
            'ECONNRESET',
            'ENOTFOUND',
            'EAI_AGAIN',
            'ETIMEDOUT',
            'ERR_NETWORK',
        ].includes(code);
    }

    return status === 408 || status === 425 || status === 429 || (typeof status === 'number' && status >= 500);
}

function normalizeErrorMessage(error: unknown) {
    const axiosError = error as BasicAxiosError;
    const status = axiosError.response?.status;
    const statusText = axiosError.response?.statusText;
    const code = axiosError.code;
    const message = axiosError.message || 'Unknown HTTP error';

    if (status) {
        return `${status}${statusText ? ` ${statusText}` : ''}: ${message}`;
    }

    if (code) {
        return `${code}: ${message}`;
    }

    return message;
}

async function executeRequest(method: HttpMethod, url: string, config: ResilientRequestConfig = {}): Promise<BasicAxiosResponse> {
    const serviceName = inferServiceName(url, config.serviceName);
    const retryAttempts = config.retryAttempts ?? DEFAULT_RETRY_ATTEMPTS;
    const retryDelayMs = config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    const breakerThreshold = config.circuitBreakerThreshold ?? DEFAULT_CIRCUIT_BREAKER_THRESHOLD;
    const breakerCooldownMs = config.circuitBreakerCooldownMs ?? DEFAULT_CIRCUIT_BREAKER_COOLDOWN_MS;
    const timeout = config.timeoutMs ?? config.timeout ?? DEFAULT_TIMEOUT_MS;
    const circuitState = getCircuitState(serviceName);

    if (circuitState.openedUntil > Date.now()) {
        const waitMs = circuitState.openedUntil - Date.now();
        SystemTelemetry.trackCircuitOpen(serviceName, waitMs);
        throw new Error(`Circuito aberto para ${serviceName}. Tente novamente em ${waitMs}ms.`);
    }

    let lastError: unknown = null;

    for (let attempt = 0; attempt <= retryAttempts; attempt++) {
        const startedAt = Date.now();

        try {
            SystemTelemetry.trackExternalRequestStart(serviceName, method);

            const response = await axios.request({
                ...config,
                method,
                url,
                timeout,
            });

            circuitState.consecutiveFailures = 0;
            circuitState.openedUntil = 0;
            SystemTelemetry.trackExternalRequestSuccess(serviceName, Date.now() - startedAt, response.status);
            return response;
        } catch (error) {
            lastError = error;
            const durationMs = Date.now() - startedAt;
            const willRetry = attempt < retryAttempts && isRetryableError(error);
            const failureMessage = normalizeErrorMessage(error);

            circuitState.consecutiveFailures += 1;
            SystemTelemetry.trackExternalRequestFailure(serviceName, durationMs, failureMessage, willRetry);

            if (circuitState.consecutiveFailures >= breakerThreshold) {
                circuitState.openedUntil = Date.now() + breakerCooldownMs;
            }

            if (!willRetry) {
                break;
            }

            SystemTelemetry.trackRetry();
            await sleep(retryDelayMs * Math.max(1, attempt + 1));
        }
    }

    throw lastError;
}

export async function resilientGet(url: string, config: ResilientRequestConfig = {}) {
    return executeRequest('GET', url, config);
}

export async function resilientPost(url: string, data?: unknown, config: ResilientRequestConfig = {}) {
    return executeRequest('POST', url, {
        ...config,
        data,
    });
}

export async function resilientPut(url: string, data?: unknown, config: ResilientRequestConfig = {}) {
    return executeRequest('PUT', url, {
        ...config,
        data,
    });
}
