type LogLevel = 'info' | 'warn' | 'error';

type LogContext = Record<string, unknown>;

function emit(level: LogLevel, message: string, context: LogContext = {}) {
    const payload = JSON.stringify({
        ts: new Date().toISOString(),
        level,
        message,
        ...context,
    });

    if (level === 'error') {
        console.error(payload);
        return;
    }

    if (level === 'warn') {
        console.warn(payload);
        return;
    }

    console.log(payload);
}

export const structuredLogger = {
    info(message: string, context: LogContext = {}) {
        emit('info', message, context);
    },
    warn(message: string, context: LogContext = {}) {
        emit('warn', message, context);
    },
    error(message: string, context: LogContext = {}) {
        emit('error', message, context);
    },
};
