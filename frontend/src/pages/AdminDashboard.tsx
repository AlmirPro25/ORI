import React, { useEffect, useState } from 'react';
import './AdminDashboard.css';

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
}

const API_URL = 'http://localhost:3000/api/v1/system/telemetry';

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
