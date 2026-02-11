# 📚 ARQUITETURA DO SISTEMA - StreamForge Enterprise

> **Documentação Técnica Completa**  
> Plataforma de Streaming Híbrido P2P/HLS com IA Integrada  
> Versão: 2.0 | Data: 09/02/2026

---

## 🎯 VISÃO GERAL

O **StreamForge Enterprise** (também conhecido como **ORION Protocol**) é uma plataforma de streaming de mídia que combina múltiplas fontes de conteúdo em uma interface unificada. O sistema integra:

- **Streaming P2P via Torrents** (WebTorrent + Gateway HTTP)
- **IPTV/Live TV** (M3U playlists)
- **YouTube Proxy** (busca e reprodução)
- **TMDB Integration** (metadados oficiais)
- **AI Dubbing** (dublagem automática com TTS)
- **Subtitle Search** (legendas reais de múltiplas fontes)
- **Arconte AI** (agente autônomo de descoberta de conteúdo)

---

## 🏗️ ARQUITETURA GERAL

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React + Vite)                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Search  │  │ Torrent  │  │ Live TV  │  │  Player  │   │
│  │   Page   │  │  Player  │  │  (IPTV)  │  │   HLS    │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│         │              │              │              │      │
│         └──────────────┴──────────────┴──────────────┘      │
│                         │                                    │
│                    API Client (Axios)                        │
│                    baseURL: /api/v1                          │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTP/WebSocket
┌─────────────────────────▼───────────────────────────────────┐
│              BACKEND (Express + TypeScript)                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Server Portable (server-portable.ts)               │   │
│  │  - Rotas de busca global (/api/v1/search)           │   │
│  │  - Rotas de autenticação                            │   │
│  │  - Rotas de vídeos (CRUD)                           │   │
│  │  - Rotas de dublagem e legendas                     │   │
│  │  - Arconte AI Deep Search                           │   │
│  └──────────────────────────────────────────────────────┘   │
│                          │                                    │
│  ┌──────────┬────────────┼────────────┬──────────────┐      │
│  │          │            │            │              │      │
│  ▼          ▼            ▼            ▼              ▼      │
│ Prisma   YouTube    TMDB API    Dubbing      OpenSubtitles │
│  (DB)    Service               Service         Service      │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│              NEXUS SCRAPER (Node.js)                         │
│  - Porta: 3005                                               │
│  - Scraping de torrents (1337x, TPB, YTS)                   │
│  - Priorização PT-BR                                         │
│  - Cache de resultados                                       │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│         TORRENT GATEWAY (torrent-gateway.mjs)                │
│  - Porta: 8888                                               │
│  - WebTorrent para streaming direto                          │
│  - Serve arquivos via HTTP Range Requests                    │
└──────────────────────────────────────────────────────────────┘
```

---

## 📦 COMPONENTES PRINCIPAIS

### 1. **FRONTEND (React + TypeScript)**

**Localização:** `/frontend/src`

#### Páginas Principais:

**`Search.tsx`** - Busca Global Híbrida
- Orquestra buscas em: Local DB, TMDB, YouTube, Nexus P2P
- Exibe resultados categorizados por fonte
- Botão "Initialize Deep-Search Arconte" para varredura profunda
- Indicadores visuais para conteúdo PT-BR

**`TorrentPlayer.tsx`** - Player P2P
- Reproduz torrents via Gateway HTTP ou WebTorrent direto
- Suporte a múltiplos arquivos no torrent
- Controles de áudio/legendas
- Resume automático da posição

**`LiveTV.tsx`** - IPTV Player
- Importação de playlists M3U
- HLS.js para streaming
- Categorização por grupos
- Busca de canais

**`Discovery.tsx`** - Página Inicial
- Recomendações personalizadas
- Seções por categoria
- Hero banner com destaque

#### Componentes Reutilizáveis:

**`VideoCard.tsx`** - Card de vídeo
- Thumbnail com lazy loading
- Badges de qualidade/status
- Hover effects premium

**`SubtitleSearch.tsx`** - Busca de Legendas
- Integração com OpenSubtitles, Subdl, YIFY
- Download e conversão SRT→VTT
- Botão de dublagem AI

**`ArcontePanel.tsx`** - Painel de Controle do Arconte
- Toggle de foco PT-BR
- Histórico de buscas
- Status de jobs

#### Serviços:

**`axios.ts`** - Cliente HTTP
```typescript
baseURL: 'http://localhost:3000/api/v1'
```

**`auth.store.ts`** - Gerenciamento de autenticação (Zustand)

---

### 2. **BACKEND (Express + Prisma)**

**Localização:** `/backend/src`

#### Arquivo Principal:

**`server-portable.ts`** - Servidor Express
- Porta: 3000
- Rotas versionadas (`/api/v1`)
- Middleware de autenticação JWT
- CORS habilitado

#### Rotas Principais:

```typescript
// BUSCA GLOBAL
GET /api/v1/search?q=termo
// Retorna: { local, youtube, tmdb, nexus, iptv }

// ARCONTE AI DEEP SEARCH
POST /api/v1/ai/deep-search
Body: { query, prioritizePTBR?, ptbrOnly? }

// LEGENDAS
POST /api/v1/subtitles/search
Body: { videoId, title, year?, imdbId?, languageCode }

POST /api/v1/subtitles/download
Body: { downloadUrl, videoId, languageCode }

// DUBLAGEM
GET /api/v1/dubbing/voices
// Lista vozes TTS disponíveis

POST /api/v1/dubbing/generate
Body: { videoId, subtitlePath, targetLanguage, voiceId }

GET /api/v1/dubbing/status/:videoId
// Verifica status da dublagem

// VÍDEOS
GET /api/v1/videos
POST /api/v1/videos/auto-ingest
GET /api/v1/videos/:id
DELETE /api/v1/videos/:id
```

#### Serviços Backend:

**`youtube-service.ts`** - Integração YouTube
```typescript
searchVideos(query: string): Promise<YouTubeVideo[]>
getVideoDetails(id: string): Promise<YouTubeVideo>
```
- Usa API pública do YouTube
- Cache de resultados

**`tmdb-service.ts`** - Integração TMDB
```typescript
search(query: string): Promise<TMDBMedia[]>
getDetails(id: number, type: 'movie'|'tv')
```
- Requer `TMDB_API_KEY` no `.env`
- Cache de 24h

**`opensubtitles-service.ts`** - Busca de Legendas
```typescript
search(options: SearchOptions): Promise<SubtitleResult[]>
downloadSubtitle(url, videoId, lang): Promise<{success, localPath}>
convertSRTtoVTT(srtContent: string): string
```
- Integra: OpenSubtitles API, Subdl, YIFY
- Prioriza PT-BR automaticamente
- Salva em `/uploads/subtitles/`

**`dubbing-service.ts`** - Dublagem AI
```typescript
generateDubbing(options: DubbingOptions): Promise<DubbingResult>
listVoices(language: string): Promise<Voice[]>
generatePreview(text, voiceId, language): Promise<string>
```
- TTS: Microsoft Edge TTS (via `edge-tts` Python)
- Fallback: Google Translate TTS
- Sincronização com timing de legendas
- Combina áudios com FFmpeg
- Salva em `/uploads/dubbing/`

**`nexus-bridge.ts`** - Ponte com Nexus Scraper
```typescript
class ArconteAdmin {
  processDemand(term: string): Promise<any[]>
  ingestToStreamForge(videoData): Promise<Video>
  discoverRelatedContent(term, category)
}
```
- Chama Nexus para buscar torrents
- Enriquece metadados com AI (Gemini)
- Auto-ingere os 3 melhores resultados
- Busca conteúdo relacionado (sequências)

**`torrent-downloader.ts`** - Download de Torrents
```typescript
downloadTorrentToServer(magnetURI, userId, title): Promise<{videoId}>
getDownloadProgress(videoId): DownloadProgress
cancelDownload(videoId): Promise<void>
```
- WebTorrent para download completo
- Conversão automática para HLS
- Progresso em tempo real

#### Banco de Dados (Prisma + SQLite):

**Schema Principal:**
```prisma
model User {
  id       String   @id @default(uuid())
  email    String   @unique
  name     String
  password String
  role     Role     @default(USER)
  videos   Video[]
}

model Video {
  id               String   @id @default(uuid())
  title            String
  description      String?
  category         String?
  status           Status   @default(PROCESSING)
  storageKey       String?  // Caminho do arquivo
  hlsPath          String?  // Caminho do HLS
  thumbnailPath    String?
  originalFilename String?
  userId           String
  user             User     @relation(...)
  createdAt        DateTime @default(now())
}

enum Status {
  WAITING
  PROCESSING
  READY
  FAILED
  NEXUS  // Vídeo vindo do Nexus (torrent)
}
```

---

### 3. **NEXUS SCRAPER (Node.js)**

**Localização:** `/nexus/`

**Arquivo Principal:** `server.js`
- Porta: 3005
- Express server standalone

#### Funcionalidades:

**Scraping Multi-Site:**
```javascript
// Scrapers disponíveis:
- scrape1337x(query)
- scrapeTPB(query)
- scrapeYTS(query)
```

**Priorização PT-BR:**
```javascript
// ptbr-priority.js
prioritizePTBRResults(results)
filterPTBROnly(results, includeSubsOnly)
enhanceQueryForPTBR(query)
```

**Análise de Qualidade:**
- Detecta resolução (4K, 1080p, 720p, etc)
- Identifica áudio PT-BR vs legendas PT-BR
- Calcula score de prioridade
- Agrupa por título e pega o melhor de cada

**Rotas:**
```javascript
POST /api/search
Body: { query, prioritizePTBR?, ptbrOnly? }
// Retorna: { results: [...], stats: {...} }
```

---

### 4. **TORRENT GATEWAY (WebTorrent)**

**Localização:** `/backend/torrent-gateway.mjs`

**Porta:** 8888

#### Funcionalidades:

**Streaming HTTP:**
```javascript
GET /stream/:infoHash/:fileIndex
// Serve arquivo do torrent via HTTP Range Requests
```

**Gerenciamento de Torrents:**
```javascript
POST /add
Body: { magnetURI }
// Adiciona torrent ao cliente

GET /torrents
// Lista torrents ativos

GET /files/:infoHash
// Lista arquivos de um torrent
```

**Características:**
- Mantém torrents ativos em memória
- Suporta Range Requests (seek no vídeo)
- Auto-cleanup de torrents inativos
- Limite de torrents simultâneos

---

## 🔄 FLUXOS DE OPERAÇÃO

### Fluxo 1: Busca Global

```
1. Usuário digita termo na barra de busca
   ↓
2. Frontend chama GET /api/v1/search?q=termo
   ↓
3. Backend executa 4 buscas em paralelo:
   - Prisma.video.findMany() → Local DB
   - YouTubeService.searchVideos() → YouTube
   - TMDBService.search() → TMDB
   - axios.post('http://localhost:3005/api/search') → Nexus
   ↓
4. Backend retorna JSON:
   {
     local: [...],
     youtube: [...],
     tmdb: [...],
     nexus: [...],
     iptv: []
   }
   ↓
5. Frontend renderiza resultados em seções separadas
```

### Fluxo 2: Arconte AI Deep Search

```
1. Usuário clica "Initialize Deep-Search Arconte"
   ↓
2. Frontend chama POST /api/v1/ai/deep-search
   Body: { query: "Matrix", prioritizePTBR: true }
   ↓
3. Backend dispara ArconteAdmin.processDemand()
   ↓
4. Arconte chama Nexus para buscar torrents
   ↓
5. Arconte pega os top 3 resultados (por seeds)
   ↓
6. Para cada resultado:
   - Enriquece metadados com Gemini AI
   - Cria registro no banco (status: NEXUS)
   - Salva magnet link
   ↓
7. Arconte busca conteúdo relacionado (sequências)
   ↓
8. Frontend recebe confirmação e recarrega resultados
```

### Fluxo 3: Reprodução de Torrent

```
1. Usuário clica em card de vídeo do Nexus
   ↓
2. Frontend navega para /torrent-player?magnet=...&title=...
   ↓
3. TorrentPlayer tenta Gateway HTTP primeiro:
   - POST http://localhost:8888/add { magnetURI }
   - Aguarda torrent ficar pronto
   - GET http://localhost:8888/files/:infoHash
   - Identifica arquivo de vídeo
   - Monta URL: http://localhost:8888/stream/:hash/:index
   ↓
4. Se Gateway falhar, usa WebTorrent direto no browser
   ↓
5. Player carrega vídeo via <video src="...">
   ↓
6. Salva progresso no localStorage
```

### Fluxo 4: Dublagem AI

```
1. Usuário busca legendas no SubtitleSearch
   ↓
2. Clica em "Gerar Dublagem AI"
   ↓
3. Frontend chama:
   POST /api/v1/subtitles/download { downloadUrl, videoId, lang }
   ↓
4. Backend baixa legenda e converte SRT→VTT
   ↓
5. Frontend chama:
   POST /api/v1/dubbing/generate {
     videoId,
     subtitlePath,
     targetLanguage: 'pt-BR',
     voiceId: 'pt-BR-FranciscaNeural'
   }
   ↓
6. DubbingService (background):
   - Parseia VTT/SRT
   - Para cada cue:
     * Gera áudio com Edge TTS
     * Salva clip temporário
   - Combina todos os clips com FFmpeg
   - Aplica timing correto
   - Salva MP3 final em /uploads/dubbing/
   ↓
7. Frontend mostra alerta: "Dublagem em processamento"
   ↓
8. Usuário pode verificar status:
   GET /api/v1/dubbing/status/:videoId
```

---

## 🔐 AUTENTICAÇÃO E SEGURANÇA

### JWT Authentication

**Geração de Token:**
```typescript
const token = jwt.sign(
  { id, email, name, role },
  JWT_SECRET,
  { expiresIn: '7d' }
);
```

**Middleware de Proteção:**
```typescript
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({...});
  
  const decoded = jwt.verify(token, JWT_SECRET);
  req.user = decoded;
  next();
};
```

**Roles:**
- `USER` - Usuário padrão
- `ADMIN` - Acesso total

---

## 🎨 DESIGN SYSTEM

### Paleta de Cores

```css
--background: 220 13% 5%;      /* #0a0a0f */
--foreground: 0 0% 98%;        /* #fafafa */
--primary: 180 100% 50%;       /* #00d9ff - Cyan */
--accent: 280 100% 70%;        /* #b366ff - Purple */
--destructive: 0 84% 60%;      /* #ef4444 - Red */
```

### Tipografia

```css
font-family: 'Inter', sans-serif;
```

**Hierarquia:**
- Títulos: `font-black uppercase italic tracking-tight`
- Subtítulos: `font-bold uppercase tracking-wider`
- Corpo: `font-medium`
- Labels: `text-xs uppercase tracking-widest`

### Componentes UI (shadcn/ui)

- Button
- Input
- Card
- Dialog
- Skeleton
- Tabs
- Select

---

## 🚀 COMO EXECUTAR

### Pré-requisitos

```bash
Node.js 18+
Python 3.8+ (para edge-tts)
FFmpeg
```

### Instalação

```bash
# Instalar dependências de todos os módulos
npm run install:all

# Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas API keys
```

### Executar Tudo

```bash
# Modo desenvolvimento (todos os serviços)
npm run dev:all

# Ou separadamente:
npm run dev:backend   # Porta 3000
npm run dev:frontend  # Porta 5173
npm run dev:nexus     # Porta 3005
npm run dev:gateway   # Porta 8888
```

### Build para Produção

```bash
cd frontend && npm run build
cd backend && npm run build
```

---

## 📊 MONITORAMENTO E LOGS

### Logs do Backend

```typescript
// Winston logger configurado
logger.info('[ORION] Mensagem informativa');
logger.warn('[ORION] Aviso');
logger.error('[ORION] Erro crítico');
```

### Logs do Nexus

```javascript
console.log('[NEXUS] Scraping iniciado');
console.log('[PTBR] Conteúdo brasileiro detectado');
```

### Métricas

- Downloads ativos: `GET /api/v1/downloads`
- Status do sistema: `GET /api/v1/stats`
- Torrents ativos: `GET http://localhost:8888/torrents`

---

## 🔧 TROUBLESHOOTING

### Problema: Busca não retorna resultados

**Causa:** Nexus não está rodando ou TMDB_API_KEY não configurada

**Solução:**
```bash
# Verificar se Nexus está online
curl http://localhost:3005/api/search -d '{"query":"test"}'

# Verificar .env
cat .env | grep TMDB_API_KEY
```

### Problema: Torrent não reproduz

**Causa:** Gateway não está rodando ou magnet inválido

**Solução:**
```bash
# Verificar gateway
curl http://localhost:8888/torrents

# Reiniciar gateway
npm run dev:gateway
```

### Problema: Dublagem falha

**Causa:** edge-tts não instalado ou FFmpeg não encontrado

**Solução:**
```bash
# Instalar edge-tts
pip install edge-tts

# Verificar FFmpeg
ffmpeg -version
```

---

## 🎯 ROADMAP

### Implementado ✅
- [x] Busca global híbrida
- [x] Streaming P2P via torrents
- [x] IPTV/Live TV
- [x] Dublagem AI com TTS
- [x] Busca de legendas multi-fonte
- [x] Arconte AI para descoberta
- [x] Priorização PT-BR

### Em Desenvolvimento 🚧
- [ ] Notificações em tempo real (Socket.IO)
- [ ] Sistema de favoritos
- [ ] Histórico de visualização
- [ ] Recomendações personalizadas com ML
- [ ] Upload direto de vídeos
- [ ] Transcodificação adaptativa

### Planejado 📋
- [ ] Mobile app (React Native)
- [ ] Chromecast support
- [ ] Download offline
- [ ] Compartilhamento social
- [ ] Sistema de comentários
- [ ] Playlists personalizadas

---

## 📝 CONVENÇÕES DE CÓDIGO

### TypeScript

```typescript
// Interfaces com I prefix
interface IVideoData {
  title: string;
  url: string;
}

// Tipos com T prefix
type TStatus = 'READY' | 'PROCESSING' | 'FAILED';

// Enums em PascalCase
enum VideoStatus {
  Ready = 'READY',
  Processing = 'PROCESSING'
}
```

### React Components

```tsx
// Functional components com arrow function
export const VideoCard: React.FC<Props> = ({ video }) => {
  // Hooks no topo
  const [state, setState] = useState();
  
  // Handlers
  const handleClick = () => {...};
  
  // Render
  return <div>...</div>;
};
```

### Commits

```
feat: adiciona busca de legendas
fix: corrige erro no player
docs: atualiza README
refactor: reorganiza serviços
perf: otimiza cache do TMDB
```

---

## 🤝 CONTRIBUINDO

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/nova-feature`)
3. Commit suas mudanças (`git commit -m 'feat: adiciona nova feature'`)
4. Push para a branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request

---

## 📄 LICENÇA

MIT License - Veja LICENSE para detalhes

---

## 👥 AUTORES

- **Desenvolvedor Principal** - Arquitetura e implementação
- **Arconte AI** - Agente autônomo de descoberta

---

## 🙏 AGRADECIMENTOS

- WebTorrent - Streaming P2P
- HLS.js - Reprodução HLS
- Prisma - ORM
- shadcn/ui - Componentes UI
- Framer Motion - Animações
- Edge TTS - Text-to-Speech

---

**Última Atualização:** 09/02/2026  
**Versão do Documento:** 1.0
