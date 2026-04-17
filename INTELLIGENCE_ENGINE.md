# 🧠 Intelligence Engine - Sistema de Recomendação Híbrido

## Visão Geral

O Intelligence Engine é um sistema de recomendação adaptativo que combina três fontes de inteligência:

1. **Comportamento do Usuário** - O que ele gosta
2. **Saúde da Rede (Swarm)** - O que funciona bem
3. **Dinâmica Temporal** - O que está crescendo

## Arquitetura

### 1. Cérebro do Usuário (User Profile)

Rastreia e aprende o comportamento individual:

- **Sessões de visualização**: Tempo assistido, taxa de conclusão, abandono
- **Preferências por gênero**: Vetor de interesse normalizado (0-1)
- **Padrões temporais**: Tempo médio de sessão, horários preferidos

```typescript
interface UserProfile {
  preferredGenres: Record<string, number>; // {"Ação": 0.8, "Sci-Fi": 0.6}
  avgSessionTime: number;
  completionRate: number;
}
```

### 2. Cérebro da Rede (Swarm Health)

Monitora a saúde do ecossistema P2P:

- **Peers/Seeds**: Quantidade de nós disponíveis
- **Velocidade média**: Performance real de download
- **Health Score**: Métrica combinada (0-100)

```typescript
interface SwarmHealth {
  contentHash: string;
  peers: number;
  seeds: number;
  avgSpeed: number; // KB/s
  healthScore: number; // 0-100
}
```

**Fórmula do Health Score:**
```
healthScore = min(100, (seeds * 10 + peers * 5 + avgSpeed / 100) / 3)
```

### 3. Cérebro do Sistema (Content Stats)

Agrega métricas de popularidade e tendências:

- **Views 24h**: Crescimento recente
- **Views Total**: Popularidade histórica
- **Completion Rate**: Qualidade percebida
- **Trending Score**: Crescimento exponencial

```typescript
interface ContentStats {
  views24h: number;
  viewsTotal: number;
  completionRate: number;
  trendingScore: number; // views24h * log(viewsTotal + 1)
  recommendScore: number; // Score final
}
```

## Fórmula de Recomendação

### Score Final

```
Score = (Interesse do Usuário × 0.6) + 
        (Popularidade Global × 0.3) + 
        (Saúde do Swarm × 0.1)
```

### Componentes

**1. Interesse do Usuário (0.6)**
- Baseado no perfil comportamental
- Match entre categoria do vídeo e preferências
- Default: 0.5 para usuários sem perfil

**2. Popularidade Global (0.3)**
```
popularityScore = (trendingScore * 0.5 + 
                   viewsTotal * 0.3 + 
                   completionRate * 100 * 0.2) / 100
```

**3. Saúde do Swarm (0.1)**
- Health score normalizado (0-1)
- Default: 0.5 para conteúdo sem torrent

## Exploração vs Exploitation

Para evitar "monocultura" de conteúdo, o sistema implementa:

- **90% Exploitation**: Conteúdo com alto score (testado)
- **10% Exploration**: Conteúdo novo ou pouco visto

```typescript
const explorationRate = 0.1; // 10%
const explorationCount = Math.ceil(limit * explorationRate);
```

Isso garante:
- Descoberta de novos hits
- Diversidade de conteúdo
- Evita efeito de reforço excessivo

## Fluxo de Dados

### 1. Coleta (Real-time)

```
Usuário assiste vídeo
    ↓
useWatchTracking hook
    ↓
POST /api/intelligence/track
    ↓
WatchSession criada no banco
```

### 2. Processamento (Job a cada 5 min)

```
Intelligence Worker
    ↓
calculateContentStats() - Para cada vídeo
    ↓
calculateRecommendationScore() - Score final
    ↓
ContentStats atualizado
```

### 3. Recomendação (On-demand)

```
GET /api/intelligence/recommendations
    ↓
calculateUserProfile() - Perfil do usuário
    ↓
getRecommendations() - Top scores + exploration
    ↓
Retorna lista personalizada
```

## Efeito de Reforço de Rede

O sistema cria um ciclo virtuoso:

```
Sistema recomenda conteúdo
    ↓
Mais pessoas assistem
    ↓
Swarm fica mais forte
    ↓
Sistema recomenda mais
    ↓
Conteúdo vira dominante
```

**Mitigação**: Taxa de exploração (10%) quebra o ciclo e dá chance para conteúdo novo.

## Implementação

### Backend

**Arquivos principais:**
- `intelligence-engine.ts` - Core do sistema
- `intelligence-routes.ts` - API endpoints
- `intelligence-worker.ts` - Job periódico
- `torrent-downloader.ts` - Coleta dados do swarm

**Endpoints:**
```
POST /api/intelligence/track - Registra sessão
GET  /api/intelligence/profile - Perfil do usuário
GET  /api/intelligence/recommendations - Recomendações
POST /api/intelligence/run-job - Força recálculo (admin)
```

### Frontend

**Componentes:**
- `IntelligentRecommendations.tsx` - UI de recomendações
- `IntelligenceDashboard.tsx` - Analytics admin
- `useWatchTracking.ts` - Hook de tracking

### Database

**Novas tabelas:**
```prisma
model WatchSession {
  userId, videoId, startTime, endTime, duration
  completed, abandoned
}

model SwarmHealth {
  contentHash, peers, seeds, avgSpeed, healthScore
}

model ContentStats {
  videoId, views24h, viewsTotal, completionRate
  trendingScore, recommendScore
}

model UserProfile {
  userId, preferredGenres, avgSessionTime, completionRate
}
```

## Performance

### Otimizações

1. **Pré-cálculo**: Scores calculados em job, não em request
2. **Cache**: ContentStats armazenado no banco
3. **Batch**: Job processa todos os vídeos de uma vez
4. **Índices**: Queries otimizadas com índices no Prisma

### Escalabilidade

Para sistemas grandes:
- Job pode rodar em worker separado
- Cache Redis para scores
- Queue (Bull/BullMQ) para tracking assíncrono
- Sharding por região geográfica

## Métricas de Sucesso

### KPIs do Sistema

1. **Engagement**
   - Taxa de clique em recomendações
   - Tempo médio de sessão
   - Taxa de conclusão

2. **Diversidade**
   - Distribuição de views por categoria
   - Quantidade de conteúdo "descoberto"
   - Índice de Gini (desigualdade)

3. **Performance da Rede**
   - Health score médio
   - Velocidade média de download
   - Disponibilidade de conteúdo

## Próximos Passos

### Melhorias Futuras

1. **Machine Learning**
   - Embeddings de vídeo (visual + texto)
   - Collaborative filtering
   - Deep learning para predição

2. **Contexto Temporal**
   - Horário do dia
   - Dia da semana
   - Sazonalidade

3. **Social**
   - Recomendações de amigos
   - Trending por comunidade
   - Influenciadores

4. **Geo-localização**
   - Swarm health por região
   - Conteúdo local
   - Latência de rede

## Conclusão

O Intelligence Engine transforma o sistema de um simples player em um **ecossistema adaptativo** que:

- Entende o usuário
- Entende a rede
- Se auto-otimiza

Quando um sistema entende o comportamento da rede, ele deixa de ser um app e vira um **organismo digital vivo**.
