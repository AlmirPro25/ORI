# 🚀 Intelligence Engine - Quick Start

## Instalação

### 1. Aplicar Migrations

```bash
cd backend
npx prisma migrate dev
npx prisma generate
```

### 2. Popular com Dados de Teste (Opcional)

```bash
node test-intelligence.js
```

Isso cria:
- 5 usuários de teste
- 20 vídeos
- ~50 sessões de visualização
- Dados de swarm simulados

## Uso

### Backend

O Intelligence Engine inicia automaticamente com o servidor:

```bash
cd backend
npm run dev
```

Você verá:
```
🚀 STREAMFORGE BACKEND ONLINE NA PORTA 3000
🧠 [Intelligence Worker] Iniciado
⏰ Intervalo: 300s
```

### Endpoints da API

**Tracking de Sessão:**
```bash
POST /api/intelligence/track
{
  "videoId": "abc123",
  "startTime": 0,
  "endTime": 120,
  "videoDuration": 3600
}
```

**Perfil do Usuário:**
```bash
GET /api/intelligence/profile
Authorization: Bearer <token>
```

**Recomendações:**
```bash
GET /api/intelligence/recommendations?limit=20&exploration=0.1
Authorization: Bearer <token>
```

**Forçar Recálculo (Admin):**
```bash
POST /api/intelligence/run-job
Authorization: Bearer <token>
```

### Frontend

#### 1. Adicionar Tracking ao Player

```tsx
import { useWatchTracking } from '../hooks/useWatchTracking';

function VideoPlayer({ videoId, duration }) {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Tracking automático
  useWatchTracking({
    videoId,
    videoDuration: duration,
    currentTime,
    isPlaying,
  });

  // ... resto do player
}
```

#### 2. Mostrar Recomendações

```tsx
import { IntelligentRecommendations } from '../components/IntelligentRecommendations';

function HomePage() {
  return <IntelligentRecommendations />;
}
```

#### 3. Dashboard de Analytics (Admin)

```tsx
import { IntelligenceDashboard } from '../components/IntelligenceDashboard';

function AdminPage() {
  return <IntelligenceDashboard />;
}
```

## Como Funciona

### 1. Coleta de Dados

Quando um usuário assiste um vídeo:
- Hook `useWatchTracking` envia dados a cada 30s
- Cria `WatchSession` no banco
- Incrementa views do vídeo

### 2. Processamento (Job a cada 5 min)

O worker executa:
```typescript
runIntelligenceJob()
  ├─ calculateContentStats() // Para cada vídeo
  │   ├─ views24h
  │   ├─ viewsTotal
  │   ├─ completionRate
  │   └─ trendingScore
  │
  └─ calculateRecommendationScore() // Score final
      ├─ userInterest × 0.6
      ├─ globalPopularity × 0.3
      └─ swarmHealth × 0.1
```

### 3. Recomendação

Quando usuário pede recomendações:
```typescript
getRecommendations(userId, limit, explorationRate)
  ├─ 90% Exploitation (alto score)
  └─ 10% Exploration (conteúdo novo)
```

## Monitoramento

### Logs do Worker

```
🧠 [Intelligence Worker] Iniciado
⏰ Intervalo: 300s
[Intelligence] Iniciando job de cálculo...
[Intelligence] Job concluído. 20 vídeos processados.
```

### Logs de Tracking

```
🎬 Sessão iniciada: 0
📊 Tracking enviado: { start: 0, end: 120, duration: 120 }
```

### Logs do Swarm

```
📊 Download abc123: 45% - 2.5 MB/s - Peers: 42
```

## Troubleshooting

### Job não está rodando

Verifique se o worker foi iniciado:
```typescript
// server-portable.ts
import { startWorker } from './intelligence-worker';

server.listen(PORT, () => {
  startWorker().catch(console.error);
});
```

### Recomendações vazias

1. Verifique se há vídeos com status `READY`
2. Execute o job manualmente: `POST /api/intelligence/run-job`
3. Popule com dados de teste: `node test-intelligence.js`

### Tracking não funciona

1. Verifique se o token está no localStorage
2. Confirme que o hook está sendo usado no player
3. Veja os logs do console do navegador

## Métricas

### Dashboard Admin

Acesse: `http://localhost:3000/intelligence-dashboard`

Mostra:
- Total de vídeos, usuários, views
- Distribuição por categoria
- Nodes ativos (simulado)
- Botão para forçar recálculo

### Perfil do Usuário

Acesse: `http://localhost:3000/recommendations`

Mostra:
- Tempo médio de sessão
- Taxa de conclusão
- Gêneros preferidos
- Controle de exploração

## Performance

### Otimizações Implementadas

✅ Pré-cálculo de scores (não em request)
✅ Índices no banco de dados
✅ Job assíncrono (não bloqueia API)
✅ Batch processing

### Para Escalar

- [ ] Cache Redis para scores
- [ ] Queue (Bull) para tracking
- [ ] Worker separado
- [ ] Sharding por região

## Próximos Passos

1. **Integrar com Player Real**
   - Adicionar `useWatchTracking` no player existente
   - Testar com vídeos reais

2. **Melhorar UI**
   - Adicionar rota `/recommendations` no frontend
   - Criar página de dashboard admin

3. **Coletar Dados Reais do Swarm**
   - Integrar com `torrent-downloader.ts`
   - Atualizar `SwarmHealth` em tempo real

4. **Machine Learning**
   - Embeddings de vídeo
   - Collaborative filtering
   - Deep learning

## Suporte

Dúvidas? Veja a documentação completa em `INTELLIGENCE_ENGINE.md`
