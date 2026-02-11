# 📋 StreamForge - Documentação Técnica

## 🎯 Visão Geral do Sistema

**StreamForge** é uma plataforma de streaming de vídeo híbrida que combina tecnologias P2P (Peer-to-Peer) com streaming tradicional HLS (HTTP Live Streaming), oferecendo uma solução escalável e eficiente para distribuição de conteúdo de vídeo.

---

## 🏗️ Arquitetura do Sistema

### Componentes Principais

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND (React)                        │
│  - Interface do Usuário                                      │
│  - Player de Vídeo (P2P + HLS)                              │
│  - Gerenciamento de Estado (Zustand)                        │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ HTTP/WebSocket
                   │
┌──────────────────▼──────────────────────────────────────────┐
│                   BACKEND (Node.js)                          │
│  - API REST (Express)                                        │
│  - WebSocket (Socket.io) - Chat em tempo real               │
│  - Banco de Dados (Prisma + SQLite)                         │
│  - Sistema de Autenticação (JWT)                            │
└──────────────────┬──────────────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
┌───────▼────────┐   ┌────────▼─────────┐
│ TORRENT GATEWAY│   │  NEXUS SEARCH    │
│ (WebTorrent)   │   │  (Scraper)       │
│ - Download P2P │   │  - Busca Torrents│
│ - Streaming    │   │  - 10+ Fontes    │
└────────────────┘   └──────────────────┘
```

---

## 🔧 Stack Tecnológico

### Frontend
- **React 18** - Framework UI
- **TypeScript** - Type safety
- **Vite** - Build tool e dev server
- **TailwindCSS** - Estilização
- **Framer Motion** - Animações
- **Zustand** - State management
- **React Router** - Navegação
- **WebTorrent** - Cliente P2P no navegador

### Backend
- **Node.js** - Runtime
- **Express** - Framework web
- **TypeScript** - Type safety
- **Prisma** - ORM
- **SQLite** - Banco de dados
- **Socket.io** - WebSocket para chat
- **JWT** - Autenticação
- **WebTorrent** - Cliente P2P no servidor
- **FFmpeg** - Processamento de vídeo

### Infraestrutura
- **Concurrently** - Gerenciamento de processos
- **ts-node-dev** - Hot reload para TypeScript

---

## 🎬 Funcionalidades Implementadas

### 1. Sistema de Streaming Híbrido

#### Modo Gateway (Servidor)
- **Vantagem**: Velocidade superior (TCP/UDP vs WebRTC)
- **Funcionamento**: 
  - Servidor baixa o torrent via WebTorrent
  - Serve o conteúdo via HTTP streaming
  - Suporta Range Requests para seeking
  - Conversão automática para HLS

#### Modo P2P (Navegador)
- **Vantagem**: Descentralização e economia de banda
- **Funcionamento**:
  - WebTorrent roda diretamente no navegador
  - Conecta-se a peers via WebRTC
  - Fallback automático quando gateway falha

**Fluxo de Decisão:**
```
Usuário clica em vídeo
    ↓
Tenta Gateway HTTP (15s timeout)
    ↓
Gateway OK? → Streaming via servidor
    ↓
Gateway falhou? → Fallback para P2P direto
```

### 2. Nexus Deep Search

Motor de busca de torrents que agrega resultados de múltiplas fontes:

**Fontes Suportadas:**
- 1337x
- The Pirate Bay
- YTS (filmes)
- EZTV (séries)
- Nyaa.si (anime)
- BitSearch
- TorrentProject
- RARBG

**Modos de Busca:**
- **Ultra**: Busca rápida em 3 motores principais
- **Extended**: Busca em 4 fontes adicionais
- **Advanced**: Scraping com Puppeteer (1337x, TPB, YTS)

**Protocolo de Emergência:**
- Quando todas as fontes falham, retorna dados mock para testes

### 3. Sistema de Download para Servidor

Permite baixar torrents completos no servidor para streaming local:

**Fluxo:**
```
1. Usuário seleciona torrent
2. Backend cria registro no banco (status: PROCESSING)
3. WebTorrent baixa arquivo completo
4. FFmpeg converte para HLS
5. Atualiza banco (status: READY)
6. Vídeo disponível na biblioteca
```

**Endpoints:**
- `POST /api/v1/downloads/torrent` - Inicia download
- `GET /api/v1/downloads/:videoId` - Progresso
- `GET /api/v1/downloads` - Lista downloads ativos
- `DELETE /api/v1/downloads/:videoId` - Cancela download

### 4. Chat em Tempo Real

Sistema de chat por vídeo usando Socket.io:

**Funcionalidades:**
- Salas por vídeo (isolamento de conversas)
- Mensagens em tempo real
- Identificação de usuário
- Histórico de mensagens (últimas 50)

**Eventos Socket.io:**
- `join_room` - Entrar em sala
- `send_message` - Enviar mensagem
- `receive_message` - Receber mensagem

### 5. Histórico de Reprodução

Salva posição de reprodução para retomar depois:

**Funcionamento:**
- Salva a cada 10 segundos
- Armazena no banco de dados
- Retoma automaticamente ao abrir vídeo
- Endpoint: `POST /api/v1/videos/:id/history`

### 6. Dashboard de Estatísticas

Painel em tempo real mostrando:
- Total de dados baixados/enviados
- Velocidade atual de download/upload
- Torrents ativos e peers conectados
- Uso de disco
- Ratio de compartilhamento

**Atualização:** A cada 3 segundos via polling

---

## 📊 Modelo de Dados (Prisma Schema)

```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String
  name      String
  role      String   @default("USER")
  videos    Video[]
  comments  Comment[]
  likes     Like[]
  playbackHistory PlaybackHistory[]
}

model Video {
  id               String   @id @default(uuid())
  title            String
  description      String?
  category         String   @default("Geral")
  originalFilename String
  storageKey       String?
  hlsPath          String?
  thumbnailPath    String?
  tags             String?
  duration         Float?
  views            Int      @default(0)
  status           String   @default("WAITING")
  userId           String
  user             User     @relation(fields: [userId], references: [id])
  comments         Comment[]
  likes            Like[]
  playbackHistory  PlaybackHistory[]
}

model PlaybackHistory {
  id        String   @id @default(uuid())
  videoId   String
  userId    String
  lastTime  Float
  video     Video    @relation(fields: [videoId], references: [id])
  user      User     @relation(fields: [userId], references: [id])
  @@unique([videoId, userId])
}
```

---

## 🔐 Segurança

### Autenticação
- **JWT (JSON Web Tokens)** para sessões
- Tokens armazenados no localStorage
- Middleware de autenticação em rotas protegidas
- Bcrypt para hash de senhas

### Autorização
- Sistema de roles (USER, ADMIN)
- Rotas administrativas protegidas
- Validação de permissões no backend

### Proteção de Streams
- Tratamento de erros em streams para evitar crashes
- Limpeza de recursos quando cliente desconecta
- Timeout em requisições de torrent (15s gateway, 45s metadata)

---

## 🚀 Performance e Otimizações

### Frontend
- **Code Splitting** - Carregamento sob demanda
- **Lazy Loading** - Componentes carregados quando necessário
- **Memoization** - React.memo e useCallback
- **Debouncing** - Em buscas e inputs

### Backend
- **Connection Pooling** - Prisma gerencia conexões
- **Caching** - Torrents ativos em memória (Map)
- **Stream Processing** - Não carrega arquivo inteiro na memória
- **Range Requests** - Permite seeking eficiente

### P2P
- **DHT (Distributed Hash Table)** - Descoberta de peers
- **LSD (Local Service Discovery)** - Peers na rede local
- **UDP Trackers** - Mais rápidos que HTTP
- **Piece Selection** - Prioriza peças necessárias para playback

---

## 📈 Escalabilidade

### Horizontal
- Backend stateless (exceto WebSocket)
- Possível usar Redis para sessões compartilhadas
- Load balancer para múltiplas instâncias

### Vertical
- WebTorrent suporta múltiplos torrents simultâneos
- FFmpeg pode processar em paralelo
- SQLite pode ser migrado para PostgreSQL

### CDN
- Arquivos HLS podem ser servidos via CDN
- Reduz carga no servidor principal
- Melhora latência global

---

## 🔄 Fluxos de Dados Principais

### 1. Assistir Vídeo via Gateway

```
1. Frontend → POST /api/torrent/add (magnetURI)
2. Gateway → Adiciona torrent ao WebTorrent
3. Gateway → Aguarda metadata (45s timeout)
4. Gateway → Retorna lista de arquivos
5. Frontend → GET /api/stream/:hash/:index
6. Gateway → Stream de vídeo com Range Requests
7. Frontend → Polling de stats a cada 2s
```

### 2. Download para Servidor

```
1. Frontend → POST /api/v1/downloads/torrent
2. Backend → Cria registro no banco (PROCESSING)
3. Backend → WebTorrent baixa arquivo completo
4. Backend → FFmpeg converte para HLS
5. Backend → Atualiza banco (READY)
6. Frontend → Polling de progresso a cada 2s
7. Vídeo disponível na biblioteca
```

### 3. Busca de Torrents

```
1. Frontend → POST /api/search/ultra (query)
2. Nexus → Busca paralela em múltiplas fontes
3. Nexus → Agrega e deduplicar resultados
4. Nexus → Ordena por seeds
5. Nexus → Retorna top 10 por fonte
6. Frontend → Exibe resultados
```

---

## 🐛 Tratamento de Erros

### Gateway
- **Timeout em metadata**: 45 segundos
- **Timeout em adicionar torrent**: 30 segundos
- **Stream fechado prematuramente**: Limpa recursos
- **Torrent inválido**: Retorna erro 500 com mensagem

### Frontend
- **Gateway offline**: Fallback automático para P2P
- **Sem peers**: Exibe mensagem de erro
- **Vídeo não encontrado**: Tela de erro com retry

### Backend
- **Erro no download**: Atualiza status para FAILED
- **Erro na conversão HLS**: Log detalhado
- **Banco de dados**: Rollback automático em transações

---

## 📦 Estrutura de Diretórios

```
projeto-enterprise/
├── backend/
│   ├── src/
│   │   ├── controllers/      # Lógica de negócio
│   │   ├── middleware/       # Auth, upload, etc
│   │   ├── queue/            # Sistema de filas
│   │   ├── utils/            # Helpers
│   │   ├── routes.ts         # Definição de rotas
│   │   ├── server.ts         # Servidor principal
│   │   └── torrent-downloader.ts  # Download de torrents
│   ├── prisma/
│   │   └── schema.prisma     # Schema do banco
│   ├── uploads/              # Vídeos e HLS
│   ├── downloads/            # Torrents baixados
│   └── torrent-gateway.mjs   # Gateway P2P
├── frontend/
│   ├── src/
│   │   ├── components/       # Componentes React
│   │   ├── pages/            # Páginas
│   │   ├── stores/           # Zustand stores
│   │   ├── hooks/            # Custom hooks
│   │   └── App.tsx           # App principal
│   └── public/               # Assets estáticos
├── nexus/
│   ├── server.js             # Motor de busca
│   └── providers/            # Scrapers
└── package.json              # Scripts principais
```

---

## 🚦 Como Executar

### Desenvolvimento

```bash
# Instalar dependências
npm run install:all

# Rodar todos os serviços
npm run dev:all

# Serviços individuais
npm run dev:backend   # Backend (porta 3000)
npm run dev:frontend  # Frontend (porta 5173)
npm run dev:nexus     # Nexus (porta 3005)
npm run dev:gateway   # Gateway (porta 3333)
```

### Produção

```bash
# Build
cd backend && npm run build
cd frontend && npm run build

# Deploy
# Backend: Node.js server
# Frontend: Servir build/ via Nginx/CDN
# Gateway: PM2 ou similar
```

---

## 🔮 Roadmap Futuro

### Curto Prazo
- [ ] Sistema de recomendações com IA
- [ ] Suporte a múltiplas qualidades (360p, 720p, 1080p)
- [ ] Thumbnails automáticos com FFmpeg
- [ ] Sistema de playlists

### Médio Prazo
- [ ] Migração para PostgreSQL
- [ ] Redis para cache e sessões
- [ ] CDN para HLS
- [ ] Mobile app (React Native)

### Longo Prazo
- [ ] Blockchain para DRM descentralizado
- [ ] IPFS como storage alternativo
- [ ] Machine Learning para curadoria
- [ ] Suporte a live streaming

---

## 📊 Métricas e Monitoramento

### Métricas Coletadas
- Total de dados baixados/enviados
- Velocidade de download/upload em tempo real
- Número de peers conectados
- Torrents ativos
- Uso de disco
- Ratio de compartilhamento

### Ferramentas Sugeridas
- **Prometheus** - Coleta de métricas
- **Grafana** - Visualização
- **Sentry** - Error tracking
- **PM2** - Process management

---

## 🤝 Contribuindo

### Padrões de Código
- **ESLint** - Linting
- **Prettier** - Formatação
- **TypeScript** - Type safety obrigatório
- **Conventional Commits** - Mensagens de commit

### Testes
- **Jest** - Unit tests
- **React Testing Library** - Component tests
- **Supertest** - API tests

---

## 📝 Licença

Este projeto é proprietário e confidencial.

---

## 👥 Equipe

- **Desenvolvedor Principal**: [Seu Nome]
- **Tech Lead**: [Nome do Tech Lead]

---

## 📞 Contato

Para dúvidas técnicas ou suporte:
- Email: [seu-email]
- Slack: [canal]

---

**Última Atualização**: 08/02/2026
**Versão**: 1.0.0
