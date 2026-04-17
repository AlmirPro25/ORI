import { NextFunction, Request, Response } from 'express';
import { SystemTelemetry } from '../services/system-telemetry';

type Bucket = {
    count: number;
    resetAt: number;
};

type RateLimitOptions = {
    keyPrefix: string;
    limit: number;
    windowMs: number;
};

const buckets = new Map<string, Bucket>();

function getClientId(req: Request) {
    const forwarded = req.headers['x-forwarded-for'];
    if (Array.isArray(forwarded) && forwarded.length > 0) {
        return forwarded[0];
    }

    return String(forwarded || req.ip || req.socket.remoteAddress || 'unknown');
}

export function createRateLimit(options: RateLimitOptions) {
    return (req: Request, res: Response, next: NextFunction) => {
        const now = Date.now();
        const key = `${options.keyPrefix}:${getClientId(req)}`;
        const current = buckets.get(key);

        if (!current || current.resetAt <= now) {
            buckets.set(key, {
                count: 1,
                resetAt: now + options.windowMs,
            });
            next();
            return;
        }

        if (current.count >= options.limit) {
            const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
            SystemTelemetry.trackRateLimitBlock(options.keyPrefix);
            res.setHeader('retry-after', retryAfterSeconds);
            res.status(429).json({
                error: 'Too many requests',
                retryAfterSeconds,
            });
            return;
        }

        current.count += 1;
        next();
    };
}
