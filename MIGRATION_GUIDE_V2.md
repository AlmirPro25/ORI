# 🔄 Guia de Migração - Downloader V1 → V2

## 📋 Checklist de Migração

### 1. Aplicar Migration do Banco

```bash
cd backend
npx prisma migrate dev --name add_download_queue
npx prisma generate
```

### 2. Atualizar server.ts

```typescript
// Adicionar imports
import { startQueueProcessor } from './torrent-downloader-v2';
import downloaderRoutes from './routes-downloader-v2';

// Iniciar processador de fila (após iniciar servidor)
app.listen(PORT, () => {
    console.log(`🚀 STREAMFORGE BACKEND ONLINE NA PORTA ${PORT}`);
    
    // 🔥 INICIAR PROCESSADOR DE FILA
    startQueueProcessor();
});

// Adicionar rotas
app.use('/api/v1/downloads', downloaderRoutes);
```

### 3. Atualizar Frontend

**Antes:**
```typescript
// POST /api/v1/downloads/torrent
const response = await axios.post('/api/v1/downloads/torrent', {
    magnetURI,
    title
});
```

**Depois:**
```typescript
// POST /api/v1/downloads/queue
const response = await axios.post('/api/v1/downloads/queue', {
    magnetURI,
    title,
    priority: 10 // Opcional
});

// Retorna: { videoId, position }
console.log(`Adicionado à fila (posição ${response.data.position})`);
```

### 4. Atualizar Componente de Download

```typescript
// Antes: Polling simples
const checkProgress = async () => {
    const response = await axios.get(`/api/v1/downloads/${videoId}`);
    setProgress(response.data.progress);
};

// Depois: Polling com mais dados
const checkProgress = async () => {
    const response = await axios.get(`/api/v1/downloads/${videoId}`);
    
    setProgress(response.data.progress);
    setStatus(response.data.status); // QUEUED, DOWNLOADING, PROCESSING, COMPLETED
    setEta(response.data.eta); // Tempo estimado
    setPeers(response.data.peers);
    setSpeed(response.data.downloadSpeed);
};
```

---

## 🆕 Novos Endpoints

### POST /api/v1/downloads/queue
Adiciona download à fila (substitui `/torrent`)

**Request:**
```json
{
  "magnetURI": "magnet:?xt=...",
  "title": "Matrix",
  "description": "Filme de ficção científica",
  "category": "Filmes",
  "priority": 10
}
```

**Response:**
```json
{
  "success": true,
  "message": "Download adicionado à fila (posição 3)",
  "videoId": "uuid",
  "position": 3
}
```

### GET /api/v1/downloads/:videoId
Status detalhado (substitui `/downloads/:videoId`)

**Response:**
```json
{
  "videoId": "uuid",
  "title": "Matrix",
  "status": "DOWNLOADING",
  "progress": 45.2,
  "downloadSpeed": 5120,
  "uploadSpeed": 1024,
  "peers": 12,
  "seeds": 45,
  "eta": 180,
  "queuedAt": "2026-02-09T10:00:00Z",
  "startedAt": "2026-02-09T10:05:00Z",
  "completedAt": null,
  "processingTime": null
}
```

### GET /api/v1/downloads
Lista todos os downloads

**Query Params:**
- `status` (opcional): QUEUED, DOWNLOADING, PROCESSING, COMPLETED, FAILED

**Response:**
```json
{
  "total": 5,
  "downloads": [
    {
      "videoId": "uuid",
      "title": "Matrix",
      "status": "DOWNLOADING",
      "progress": 45.2,
      "priority": 10,
      "queuedAt": "2026-02-09T10:00:00Z",
      "eta": 180
    }
  ]
}
```

### POST /api/v1/downloads/:videoId/prioritize
Prioriza download na fila

**Request:**
```json
{
  "priority": 100
}
```

### GET /api/v1/downloads/stats/system
Estatísticas do sistema

**Response:**
```json
{
  "queue": {
    "queued": 5,
    "downloading": 3,
    "processing": 1,
    "completed": 42,
    "failed": 2,
    "total": 53
  },
  "performance": {
    "avgProcessingTime": 320,
    "maxConcurrent": 3,
    "activeSlots": 3
  }
}
```

---

## 🎨 Componente React Atualizado

```typescript
import { useState, useEffect } from 'react';
import axios from './lib/axios';

interface DownloadStatus {
    videoId: string;
    title: string;
    status: 'QUEUED' | 'DOWNLOADING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    progress: number;
    downloadSpeed?: number;
    uploadSpeed?: number;
    peers?: number;
    seeds?: number;
    eta?: number;
    error?: string;
}

export function DownloadManager() {
    const [downloads, setDownloads] = useState<DownloadStatus[]>([]);
    const [stats, setStats] = useState<any>(null);

    useEffect(() => {
        const interval = setInterval(async () => {
            // Listar downloads
            const response = await axios.get('/api/v1/downloads');
            setDownloads(response.data.downloads);

            // Stats do sistema
            const statsResponse = await axios.get('/api/v1/downloads/stats/system');
            setStats(statsResponse.data);
        }, 3000);

        return () => clearInterval(interval);
    }, []);

    const addDownload = async (magnetURI: string, title: string) => {
        try {
            const response = await axios.post('/api/v1/downloads/queue', {
                magnetURI,
                title,
                priority: 10
            });

            alert(`Adicionado à fila (posição ${response.data.position})`);
        } catch (err: any) {
            alert(`Erro: ${err.response?.data?.error || err.message}`);
        }
    };

    const prioritize = async (videoId: string) => {
        await axios.post(`/api/v1/downloads/${videoId}/prioritize`, {
            priority: 100
        });
    };

    const cancel = async (videoId: string) => {
        if (confirm('Cancelar download?')) {
            await axios.delete(`/api/v1/downloads/${videoId}`);
        }
    };

    return (
        <div className="p-4">
            <h1 className="text-2xl font-bold mb-4">Download Manager V2</h1>

            {/* Stats */}
            {stats && (
                <div className="bg-gray-800 p-4 rounded mb-4">
                    <h2 className="font-bold mb-2">Sistema</h2>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                            <div className="text-gray-400">Fila</div>
                            <div className="text-xl">{stats.queue.queued}</div>
                        </div>
                        <div>
                            <div className="text-gray-400">Baixando</div>
                            <div className="text-xl">{stats.queue.downloading}/{stats.performance.maxConcurrent}</div>
                        </div>
                        <div>
                            <div className="text-gray-400">Tempo Médio</div>
                            <div className="text-xl">{Math.round(stats.performance.avgProcessingTime)}s</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Lista de downloads */}
            <div className="space-y-2">
                {downloads.map(download => (
                    <div key={download.videoId} className="bg-gray-800 p-4 rounded">
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <h3 className="font-bold">{download.title}</h3>
                                <div className="text-sm text-gray-400">{download.status}</div>
                            </div>
                            <div className="flex gap-2">
                                {download.status === 'QUEUED' && (
                                    <button
                                        onClick={() => prioritize(download.videoId)}
                                        className="px-2 py-1 bg-blue-600 rounded text-sm"
                                    >
                                        Priorizar
                                    </button>
                                )}
                                {download.status !== 'COMPLETED' && (
                                    <button
                                        onClick={() => cancel(download.videoId)}
                                        className="px-2 py-1 bg-red-600 rounded text-sm"
                                    >
                                        Cancelar
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Progress bar */}
                        <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
                            <div
                                className="bg-cyan-500 h-2 rounded-full transition-all"
                                style={{ width: `${download.progress}%` }}
                            />
                        </div>

                        {/* Detalhes */}
                        <div className="grid grid-cols-4 gap-2 text-xs text-gray-400">
                            <div>Progress: {download.progress.toFixed(1)}%</div>
                            {download.downloadSpeed && (
                                <div>↓ {(download.downloadSpeed / 1024).toFixed(2)} MB/s</div>
                            )}
                            {download.peers && (
                                <div>Peers: {download.peers}</div>
                            )}
                            {download.eta && (
                                <div>ETA: {download.eta}s</div>
                            )}
                        </div>

                        {download.error && (
                            <div className="mt-2 text-red-500 text-sm">{download.error}</div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
```

---

## 🧪 Testar Migração

```bash
# 1. Aplicar migration
cd backend
npx prisma migrate dev
npx prisma generate

# 2. Reiniciar servidor
npm run dev

# 3. Rodar teste
node test-downloader-v2.js

# 4. Verificar logs
# Você deve ver:
# 🚀 [Queue] Processador iniciado
# 📋 [Queue] Adicionado: Matrix (posição 1)
# 🚀 [Queue] Iniciando: uuid
# 📥 [Download] Iniciando: uuid
# 📊 [Progress] uuid: 45% | ↓5.2 MB/s | Peers: 12
```

---

## ⚠️ Breaking Changes

### 1. Endpoint Mudou
- ❌ `POST /api/v1/downloads/torrent`
- ✅ `POST /api/v1/downloads/queue`

### 2. Response Mudou
```typescript
// Antes
{ videoId, message }

// Depois
{ videoId, position, message }
```

### 3. Status Mudou
```typescript
// Antes: Video.status
'PROCESSING' | 'READY' | 'FAILED'

// Depois: DownloadQueue.status
'QUEUED' | 'DOWNLOADING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
```

---

## 🎯 Rollback (se necessário)

Se algo der errado, você pode voltar:

```bash
# 1. Reverter migration
npx prisma migrate resolve --rolled-back 20260209_add_download_queue

# 2. Usar V1 novamente
# Comentar imports do V2 no server.ts
# Descomentar imports do V1
```

---

## ✅ Checklist Final

- [ ] Migration aplicada
- [ ] Prisma generate executado
- [ ] server.ts atualizado
- [ ] Processador de fila iniciado
- [ ] Rotas V2 adicionadas
- [ ] Frontend atualizado
- [ ] Teste executado com sucesso
- [ ] Logs mostrando fila funcionando
- [ ] Downloads completando corretamente

---

**Status:** PRONTO PARA MIGRAÇÃO 🚀
