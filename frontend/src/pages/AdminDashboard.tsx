import React, { useEffect, useState } from 'react';
import './AdminDashboard.css';
import { BACKEND_URL } from '@/lib/endpoints';

interface TelemetrySnapshot {
    uptime: number;
    activeDownloads: number;
    totalSuccess: number;
    totalFailures: number;
    totalRetries: number;
    zombiesRecovered: number;
    avgDownloadTimeMs: number;
    healthScore: number;
    status: 'EXCELLENT' | 'GOOD' | 'DEGRADED' | 'CRITICAL';
    queueProtection?: {
        busyBackoffs: number;
        serializedSkips: number;
        rarityBoostsApplied: number;
        lastBusyBackoffAt: number | null;
        lastSerializedSkipAt: number | null;
        lastRarityBoostAt: number | null;
        recentWindowMs?: number;
        recent?: {
            busyBackoffs: number;
            serializedSkips: number;
            rarityBoostsApplied: number;
        };
    };
}

const API_URL = `${BACKEND_URL}/api/v1/system/telemetry`;

export const AdminDashboard: React.FC = () => {
    const [telemetry, setTelemetry] = useState<TelemetrySnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
    const [error, setError] = useState<string | null>(null);

    const fetchTelemetry = async () => {
        try {
            const response = await fetch(API_URL);
            if (!response.ok) throw new Error('Falha na conexão com Telemetry Engine');
            const data = await response.json();
            setTelemetry(data);
            setLastUpdate(new Date());
            setError(null);
            setLoading(false);
        } catch (err) {
            setError('Telemetry Offline');
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTelemetry();
        const interval = setInterval(fetchTelemetry, 3000); // 3s polling (Real-time feel)
        return () => clearInterval(interval);
    }, []);

    const formatUptime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return `${h}h ${m}m ${s}s`;
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'EXCELLENT': return 'var(--cyber-green)';
            case 'GOOD': return 'var(--cyber-blue)';
            case 'DEGRADED': return 'var(--cyber-orange)';
            case 'CRITICAL': return 'var(--cyber-red)';
            default: return '#fff';
        }
    };

    const formatRelativeTime = (timestamp?: number | null) => {
        if (!timestamp) return 'never';
        const diffSec = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
        if (diffSec < 60) return `${diffSec}s ago`;
        if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
        return `${Math.floor(diffSec / 3600)}h ago`;
    };

    const queueProtection = telemetry?.queueProtection;
    const queueProtectionRecent = queueProtection?.recent || queueProtection;
    const queueProtectionActive = !!queueProtectionRecent && (
        (queueProtectionRecent.busyBackoffs || 0) > 0
        || (queueProtectionRecent.serializedSkips || 0) > 0
        || (queueProtectionRecent.rarityBoostsApplied || 0) > 0
    );
    const queueProtectionSeverity = !queueProtectionRecent
        ? 'normal'
        : (queueProtectionRecent.busyBackoffs || 0) >= 3 || (queueProtectionRecent.serializedSkips || 0) >= 12
            ? 'critical'
            : (queueProtectionRecent.busyBackoffs || 0) >= 1 || (queueProtectionRecent.serializedSkips || 0) >= 4 || (queueProtectionRecent.rarityBoostsApplied || 0) >= 6
                ? 'warning'
                : 'normal';
    const queueProtectionColor = queueProtectionSeverity === 'critical'
        ? 'var(--cyber-red)'
        : queueProtectionSeverity === 'warning'
            ? 'var(--cyber-orange)'
            : 'var(--cyber-blue)';
    const queueProtectionLabel = queueProtectionSeverity === 'critical'
        ? 'PROTEGENDO FORTE'
        : queueProtectionSeverity === 'warning'
            ? 'ALERTA'
            : 'NORMAL';

    if (loading && !telemetry) {
        return (
            <div className="orion-dashboard">
                <div className="orion-header">
                    <h1>INICIALIZANDO TELEMETRY LINK...</h1>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="orion-dashboard">
                <div className="orion-header">
                    <h1 style={{ color: 'var(--cyber-red)' }}>⚠ CONEXÃO PERDIDA</h1>
                </div>
                <p>{error}</p>
                <button onClick={fetchTelemetry}>RECONECTAR</button>
            </div>
        );
    }

    return (
        <div className="orion-dashboard">
            <div className="orion-header">
                <div className="orion-title">
                    <h1>ORION COMMAND INTERFACE</h1>
                    <div className="orion-subtitle">SYSTEM TELEMETRY // REAL-TIME MONITORING</div>
                </div>

                <div className={`orion-status-pill ${telemetry?.status === 'DEGRADED' ? 'degraded' : ''} ${telemetry?.status === 'CRITICAL' ? 'critical' : ''}`}>
                    <div className="orion-status-indicator"></div>
                    {telemetry?.status} • {telemetry?.healthScore}% HEALTH
                </div>
            </div>

            <div className="orion-grid">
                {/* HEALTH CORE */}
                <div className="orion-card health" style={{ borderColor: getStatusColor(telemetry?.status || 'GOOD') }}>
                    <div className="card-header">SYSTEM HEALTH INDEX</div>
                    <div className="card-value" style={{ color: getStatusColor(telemetry?.status || 'GOOD') }}>
                        {telemetry?.healthScore}
                        <span className="value-unit">/100</span>
                    </div>
                    <div className="card-subtext">UPTIME: {formatUptime(telemetry?.uptime || 0)}</div>
                    <div className="sparkline-mock">
                        {/* Fake wave visualizer */}
                        {[...Array(20)].map((_, i) => (
                            <div
                                key={i}
                                className="spark-bar"
                                style={{
                                    height: `${Math.random() * 100}%`,
                                    background: getStatusColor(telemetry?.status || 'GOOD'),
                                    opacity: 0.3 + (i / 20)
                                }}
                            ></div>
                        ))}
                    </div>
                </div>

                {/* ACTIVE OPERATIONS */}
                <div className="orion-card">
                    <div className="card-header">ACTIVE OPERATIONS</div>
                    <div className="card-value" style={{ color: 'var(--cyber-blue)' }}>
                        {telemetry?.activeDownloads}
                    </div>
                    <div className="card-subtext">CONCURRENT DOWNLOADS</div>
                </div>

                {/* RESILIENCE METRICS */}
                <div className="orion-card error" style={{ borderColor: telemetry?.zombiesRecovered ? 'var(--cyber-orange)' : 'var(--cyber-border)' }}>
                    <div className="card-header">RESILIENCE METRICS</div>
                    <div className="system-details">
                        <div className="stat-row">
                            <span className="stat-label">RETRIES EVITADOS</span>
                            <span className="stat-val" style={{ color: 'var(--cyber-green)' }}>{telemetry?.totalRetries}</span>
                        </div>
                        <div className="stat-row">
                            <span className="stat-label">ZOMBIES RECOVERED</span>
                            <span className="stat-val" style={{ color: 'var(--cyber-orange)' }}>{telemetry?.zombiesRecovered}</span>
                        </div>
                        <div className="stat-row">
                            <span className="stat-label">FALHAS CRÍTICAS</span>
                            <span className="stat-val" style={{ color: 'var(--cyber-red)' }}>{telemetry?.totalFailures}</span>
                        </div>
                    </div>
                </div>

                <div
                    className={`orion-card queue-protection ${queueProtectionActive ? 'active' : ''} ${queueProtectionSeverity}`}
                    style={{ borderColor: queueProtectionActive ? queueProtectionColor : 'var(--cyber-border)' }}
                >
                    <div className="card-header">
                        <span>QUEUE PROTECTION</span>
                        <span className={`queue-severity-pill ${queueProtectionSeverity}`}>{queueProtectionLabel}</span>
                    </div>
                    <div className="card-value" style={{ color: queueProtectionActive ? queueProtectionColor : 'var(--cyber-blue)' }}>
                        {queueProtectionRecent?.busyBackoffs || 0}
                        <span className="value-unit">BACKOFFS</span>
                    </div>
                    <div className="card-subtext">
                        LAST {Math.max(1, Math.round((queueProtection?.recentWindowMs || 300000) / 60000))}M: SERIALIZED SKIPS {queueProtectionRecent?.serializedSkips || 0} | RARITY BOOSTS {queueProtectionRecent?.rarityBoostsApplied || 0}
                    </div>
                    <div className="queue-timestamps">
                        <div className="stat-row">
                            <span className="stat-label">LAST BACKOFF</span>
                            <span className="stat-val">{formatRelativeTime(queueProtection?.lastBusyBackoffAt)}</span>
                        </div>
                        <div className="stat-row">
                            <span className="stat-label">LAST SERIALIZED SKIP</span>
                            <span className="stat-val">{formatRelativeTime(queueProtection?.lastSerializedSkipAt)}</span>
                        </div>
                        <div className="stat-row">
                            <span className="stat-label">LAST RARITY BOOST</span>
                            <span className="stat-val">{formatRelativeTime(queueProtection?.lastRarityBoostAt)}</span>
                        </div>
                    </div>
                </div>

                {/* PERFORMANCE */}
                <div className="orion-card">
                    <div className="card-header">PERFORMANCE ENGINE</div>
                    <div className="card-value">
                        {telemetry?.totalSuccess}
                        <span className="value-unit">JOBS DONE</span>
                    </div>
                    <div className="card-subtext">
                        AVG PROCESS TIME: {telemetry?.avgDownloadTimeMs ? (telemetry.avgDownloadTimeMs / 1000).toFixed(1) : 0}s
                    </div>
                </div>
            </div>

            <div className="orion-footer">
                LAST SYNC: {lastUpdate.toLocaleTimeString()} // NODE: INDUSTRIAL-V2
            </div>
        </div>
    );
};
