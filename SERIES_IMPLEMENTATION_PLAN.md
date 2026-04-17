# 📺 PLANO DE IMPLEMENTAÇÃO: SISTEMA DE SÉRIES
## StreamForge Enterprise - Series Management System

> **Objetivo:** Transformar o sistema de "Downloader de vídeos" para "Orquestrador de séries com reprodução contínua e demanda inteligente"

---

## 🎯 VISÃO GERAL

### Estado Atual:
- ✅ Download e streaming de filmes
- ✅ Pipeline: Torrent → Download → HLS → Streaming
- ❌ Séries tratadas como arquivos independentes
- ❌ Sem organização por temporada/episódio
- ❌ Sem reprodução automática

### Estado Desejado:
- ✅ Séries como entidade nativa
- ✅ Gerenciamento de temporadas e episódios
- ✅ Auto Next (reprodução contínua)
- ✅ Download sob demanda inteligente
- ✅ UI consolidada por série

---

## 📋 FASES DE IMPLEMENTAÇÃO

### **FASE 1: MODELO DE DADOS** (Prioridade: CRÍTICA)
### **FASE 2: PARSER DE EPISÓDIOS** (Prioridade: ALTA)
### **FASE 3: API REST** (Prioridade: ALTA)
### **FASE 4: PIPELINE DE DOWNLOAD** (Prioridade: MÉDIA)
### **FASE 5: PLAYER INTELIGENTE** (Prioridade: MÉDIA)
### **FASE 6: UI/UX** (Prioridade: BAIXA)

---

## 🗄️ FASE 1: MODELO DE DADOS

### 1.1 Schema Prisma

**Arquivo:** `backend/prisma/schema.prisma`

```prisma
// Nova entidade: Series
model Series {
  id              String    @id @default(uuid())
  title           String
  overview        String?
  poster          String?
  backdrop        String?
  totalSeasons    Int       @default(0)
  totalEpisodes   Int       @default(0)
  tmdbId          Int?      @unique
  imdbId          String?
  status          String    @default("ONGOING") // ONGOING, ENDED, CANCELED
  firstAirDate    DateTime?
  lastAirDate     DateTime?
  genres          String?   // JSON array
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  seasons         Season[]
  episodes        Episode[]
}

// Nova entidade: Season
model Season {
  id              String    @id @default(uuid())
  seriesId        String
  series          Series    @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  seasonNumber    Int
  name            String?
  overview        String?
  poster          String?
  episodeCount    Int       @default(0)
  airDate         DateTime?
  createdAt       DateTime  @default(now())
  
  episodes        Episode[]
  
  @@unique([seriesId, seasonNumber])
}

// Nova entidade: Episode
model Episode {
  id              String    @id @default(uuid())
  seriesId        String
  series          Series    @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  seasonId        String
  season          Season    @relation(fields: [seasonId], references: [id], onDelete: Cascade)
  seasonNumber    Int
  episodeNumber   Int
  title           String
  overview        String?
  duration        Int?      // minutos
  airDate         DateTime?
  stillPath       String?   // thumbnail do episódio
  videoId         String?   @unique
  video           Video?    @relation(fields: [videoId], references: [id])
  status          String    @default("NOT_DOWNLOADED") // NOT_DOWNLOADED, QUEUED, DOWNLOADING, PROCESSING, READY, FAILED
  magnetLink      String?
  fileSize        Float?    // MB
  quality         String?   // 1080p, 720p, etc
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  @@unique([seriesId, seasonNumber, episodeNumber])
  @@index([seriesId, seasonNumber])
}

// Atualizar Video existente
model Video {
  // ... campos existentes ...
  episodeId       String?   @unique
  episode         Episode?
}
```

### 1.2 Migration

**Comando:**
```bash
cd backend
npx prisma migrate dev --name add_series_support
```

**Arquivo gerado:** `backend/prisma/migrations/XXXXXX_add_series_support/migration.sql`

---

## 🔍 FASE 2: PARSER DE EPISÓDIOS

### 2.1 Episode Parser Service

**Arquivo:** `backend/src/services/episode-parser.ts`

```typescript
interface ParsedEpisode {
  seriesName: string;
  seasonNumber: number;
  episodeNumber: number;
  quality?: string;
  releaseGroup?: string;
  year?: number;
}

export class EpisodeParser {
  // Padrões suportados
  private patterns = [
    /S(\d{1,2})E(\d{1,2})/i,           // S01E01
    /(\d{1,2})x(\d{1,2})/i,            // 1x01
    /Season\s*(\d+)\s*Episode\s*(\d+)/i, // Season 1 Episode 1
    /S(\d{1,2})\s*-\s*E(\d{1,2})/i,   // S01 - E01
  ];

  parse(filename: string): ParsedEpisode | null {
    // Implementação completa
  }

  isSeriesFile(filename: string): boolean {
    return this.patterns.some(p => p.test(filename));
  }

  extractSeriesName(filename: string): string {
    // Remove padrões de episódio, qualidade, etc
  }

  extractQuality(filename: string): string | undefined {
    // 1080p, 720p, 4K, etc
  }
}
```

### 2.2 Integração com Downloader

**Modificar:** `backend/src/torrent-downloader-v2.ts`

```typescript
import { EpisodeParser } from './services/episode-parser';

const parser = new EpisodeParser();

async function processTorrentFile(file: TorrentFile) {
  const parsed = parser.parse(file.name);
  
  if (parsed) {
    // É uma série!
    await handleSeriesEpisode(parsed, file);
  } else {
    // É um filme (comportamento atual)
    await handleMovie(file);
  }
}
```

---

## 🌐 FASE 3: API REST

### 3.1 Series Routes

**Arquivo:** `backend/src/routes/series-routes.ts`

```typescript
import { Router } from 'express';
import { SeriesController } from '../controllers/series-controller';

const router = Router();

// Listar todas as séries
router.get('/', SeriesController.list);

// Detalhes de uma série
router.get('/:id', SeriesController.getById);

// Temporadas de uma série
router.get('/:id/seasons', SeriesController.getSeasons);

// Episódios de uma série
router.get('/:id/episodes', SeriesController.getEpisodes);

// Episódios de uma temporada específica
router.get('/:id/seasons/:seasonNumber/episodes', SeriesController.getSeasonEpisodes);

// Baixar série completa
router.post('/:id/download', SeriesController.downloadSeries);

// Baixar temporada específica
router.post('/:id/seasons/:seasonNumber/download', SeriesController.downloadSeason);

export default router;
```

### 3.2 Episode Routes

**Arquivo:** `backend/src/routes/episode-routes.ts`

```typescript
import { Router } from 'express';
import { EpisodeController } from '../controllers/episode-controller';

const router = Router();

// Detalhes de um episódio
router.get('/:id', EpisodeController.getById);

// Baixar episódio específico
router.post('/:id/download', EpisodeController.download);

// Próximo episódio (para Auto Next)
router.get('/:id/next', EpisodeController.getNext);

// Episódio anterior
router.get('/:id/previous', EpisodeController.getPrevious);

// Marcar como assistido
router.post('/:id/watched', EpisodeController.markWatched);

export default router;
```

### 3.3 Controllers

**Arquivo:** `backend/src/controllers/series-controller.ts`

```typescript
export class SeriesController {
  static async list(req, res) {
    const series = await prisma.series.findMany({
      include: {
        _count: {
          select: { episodes: true }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });
    res.json(series);
  }

  static async getById(req, res) {
    const { id } = req.params;
    const series = await prisma.series.findUnique({
      where: { id },
      include: {
        seasons: {
          include: {
            episodes: {
              orderBy: { episodeNumber: 'asc' }
            }
          },
          orderBy: { seasonNumber: 'asc' }
        }
      }
    });
    res.json(series);
  }

  static async downloadSeason(req, res) {
    const { id, seasonNumber } = req.params;
    // Enfileirar todos os episódios da temporada
    await DownloadScheduler.queueSeason(id, parseInt(seasonNumber));
    res.json({ message: 'Season queued for download' });
  }
}
```

**Arquivo:** `backend/src/controllers/episode-controller.ts`

```typescript
export class EpisodeController {
  static async getNext(req, res) {
    const { id } = req.params;
    const episode = await prisma.episode.findUnique({ where: { id } });
    
    if (!episode) return res.status(404).json({ error: 'Episode not found' });

    // Próximo episódio na mesma temporada
    let next = await prisma.episode.findFirst({
      where: {
        seriesId: episode.seriesId,
        seasonNumber: episode.seasonNumber,
        episodeNumber: { gt: episode.episodeNumber }
      },
      orderBy: { episodeNumber: 'asc' }
    });

    // Se não encontrou, busca primeiro episódio da próxima temporada
    if (!next) {
      next = await prisma.episode.findFirst({
        where: {
          seriesId: episode.seriesId,
          seasonNumber: { gt: episode.seasonNumber }
        },
        orderBy: [
          { seasonNumber: 'asc' },
          { episodeNumber: 'asc' }
        ]
      });
    }

    res.json(next);
  }

  static async download(req, res) {
    const { id } = req.params;
    await DownloadScheduler.queueEpisode(id);
    res.json({ message: 'Episode queued' });
  }
}
```

---

## 📥 FASE 4: PIPELINE DE DOWNLOAD

### 4.1 Download Scheduler

**Arquivo:** `backend/src/services/download-scheduler.ts`

```typescript
export class DownloadScheduler {
  private static queue: Episode[] = [];
  private static processing = new Set<string>();
  private static MAX_CONCURRENT = 3;

  static async queueEpisode(episodeId: string, priority: number = 0) {
    const episode = await prisma.episode.findUnique({ where: { id: episodeId } });
    
    if (!episode || episode.status === 'READY') return;

    await prisma.episode.update({
      where: { id: episodeId },
      data: { status: 'QUEUED' }
    });

    this.queue.push({ ...episode, priority });
    this.processQueue();
  }

  static async queueSeason(seriesId: string, seasonNumber: number) {
    const episodes = await prisma.episode.findMany({
      where: {
        seriesId,
        seasonNumber,
        status: { in: ['NOT_DOWNLOADED', 'FAILED'] }
      },
      orderBy: { episodeNumber: 'asc' }
    });

    for (const episode of episodes) {
      await this.queueEpisode(episode.id);
    }
  }

  static async queueSeries(seriesId: string) {
    const episodes = await prisma.episode.findMany({
      where: {
        seriesId,
        status: { in: ['NOT_DOWNLOADED', 'FAILED'] }
      },
      orderBy: [
        { seasonNumber: 'asc' },
        { episodeNumber: 'asc' }
      ]
    });

    for (const episode of episodes) {
      await this.queueEpisode(episode.id);
    }
  }

  private static async processQueue() {
    if (this.processing.size >= this.MAX_CONCURRENT) return;

    // Ordenar por prioridade
    this.queue.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    const episode = this.queue.shift();
    if (!episode) return;

    this.processing.add(episode.id);
    
    try {
      await this.downloadEpisode(episode);
    } catch (error) {
      console.error(`Failed to download episode ${episode.id}:`, error);
      await prisma.episode.update({
        where: { id: episode.id },
        data: { status: 'FAILED' }
      });
    } finally {
      this.processing.delete(episode.id);
      this.processQueue(); // Processar próximo
    }
  }

  private static async downloadEpisode(episode: Episode) {
    // Atualizar status
    await prisma.episode.update({
      where: { id: episode.id },
      data: { status: 'DOWNLOADING' }
    });

    // Usar downloader existente
    const result = await TorrentDownloaderV2.download({
      magnetLink: episode.magnetLink,
      episodeId: episode.id
    });

    // Criar Video e associar
    const video = await prisma.video.create({
      data: {
        title: `${episode.title} - S${episode.seasonNumber}E${episode.episodeNumber}`,
        storageKey: result.path,
        status: 'PROCESSING',
        episodeId: episode.id,
        userId: 'system' // ou usuário que solicitou
      }
    });

    await prisma.episode.update({
      where: { id: episode.id },
      data: {
        videoId: video.id,
        status: 'PROCESSING'
      }
    });

    // Processar HLS (se necessário)
    await processVideoToHLS(video.id);

    // Marcar como pronto
    await prisma.episode.update({
      where: { id: episode.id },
      data: { status: 'READY' }
    });
  }

  // Auto-download do próximo episódio
  static async autoQueueNext(currentEpisodeId: string) {
    const current = await prisma.episode.findUnique({
      where: { id: currentEpisodeId }
    });

    if (!current) return;

    // Buscar próximo
    const next = await prisma.episode.findFirst({
      where: {
        seriesId: current.seriesId,
        seasonNumber: current.seasonNumber,
        episodeNumber: { gt: current.episodeNumber },
        status: 'NOT_DOWNLOADED'
      },
      orderBy: { episodeNumber: 'asc' }
    });

    if (next) {
      await this.queueEpisode(next.id, 100); // Alta prioridade
    }
  }
}
```

---

## 🎬 FASE 5: PLAYER INTELIGENTE

### 5.1 Auto Next Hook

**Arquivo:** `frontend/src/hooks/useAutoNext.ts`

```typescript
import { useState, useEffect } from 'react';
import { Episode } from '@/types';
import axios from 'axios';

export const useAutoNext = (currentEpisodeId: string | null) => {
  const [nextEpisode, setNextEpisode] = useState<Episode | null>(null);
  const [countdown, setCountdown] = useState(10);
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(true);

  useEffect(() => {
    if (!currentEpisodeId) return;

    // Buscar próximo episódio
    axios.get(`/api/v1/episodes/${currentEpisodeId}/next`)
      .then(res => setNextEpisode(res.data))
      .catch(() => setNextEpisode(null));
  }, [currentEpisodeId]);

  const startCountdown = () => {
    let timer = 10;
    const interval = setInterval(() => {
      timer--;
      setCountdown(timer);
      
      if (timer === 0) {
        clearInterval(interval);
        if (autoPlayEnabled && nextEpisode?.status === 'READY') {
          playNext();
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  };

  const playNext = () => {
    if (nextEpisode) {
      window.location.href = `/episodes/${nextEpisode.id}`;
    }
  };

  const cancelAutoPlay = () => {
    setAutoPlayEnabled(false);
    setCountdown(0);
  };

  return {
    nextEpisode,
    countdown,
    autoPlayEnabled,
    startCountdown,
    playNext,
    cancelAutoPlay
  };
};
```

### 5.2 Episode Player Component

**Arquivo:** `frontend/src/components/EpisodePlayer.tsx`

```typescript
export const EpisodePlayer: React.FC<{ episodeId: string }> = ({ episodeId }) => {
  const { episode, loading } = useEpisode(episodeId);
  const { nextEpisode, countdown, startCountdown, cancelAutoPlay } = useAutoNext(episodeId);
  const [showAutoNext, setShowAutoNext] = useState(false);

  const handleVideoEnd = () => {
    if (nextEpisode) {
      setShowAutoNext(true);
      startCountdown();
      
      // Auto-queue próximo episódio para download
      if (nextEpisode.status === 'NOT_DOWNLOADED') {
        axios.post(`/api/v1/episodes/${nextEpisode.id}/download`);
      }
    }
  };

  return (
    <div className="relative">
      <video
        src={`/api/v1/videos/${episode.videoId}/stream`}
        controls
        onEnded={handleVideoEnd}
        className="w-full"
      />

      {/* Auto Next Overlay */}
      {showAutoNext && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
          <div className="text-center space-y-4">
            <h3 className="text-2xl font-bold">Próximo Episódio</h3>
            <p className="text-lg">{nextEpisode.title}</p>
            <p className="text-4xl font-mono">{countdown}s</p>
            
            {nextEpisode.status === 'READY' ? (
              <button onClick={cancelAutoPlay} className="btn-secondary">
                Cancelar
              </button>
            ) : (
              <div>
                <p className="text-yellow-500">Baixando episódio...</p>
                <button onClick={cancelAutoPlay} className="btn-secondary">
                  Fechar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
```

---

## 🎨 FASE 6: UI/UX

### 6.1 Series List Page

**Arquivo:** `frontend/src/pages/SeriesList.tsx`

```typescript
export const SeriesListPage: React.FC = () => {
  const { series, loading } = useSeries();

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold mb-8">Séries</h1>
      
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
        {series.map(s => (
          <SeriesCard key={s.id} series={s} />
        ))}
      </div>
    </div>
  );
};
```

### 6.2 Series Details Page

**Arquivo:** `frontend/src/pages/SeriesDetails.tsx`

```typescript
export const SeriesDetailsPage: React.FC = () => {
  const { id } = useParams();
  const { series, loading } = useSeries(id);
  const [selectedSeason, setSelectedSeason] = useState(1);

  const currentSeasonEpisodes = series?.seasons
    ?.find(s => s.seasonNumber === selectedSeason)
    ?.episodes || [];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <div className="relative h-[60vh]">
        <img src={series.backdrop} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
        
        <div className="absolute bottom-0 left-0 p-12">
          <h1 className="text-6xl font-black">{series.title}</h1>
          <p className="text-xl text-white/70 mt-4">{series.overview}</p>
          
          <div className="flex gap-4 mt-6">
            <button onClick={() => downloadSeason(selectedSeason)} className="btn-primary">
              Baixar Temporada {selectedSeason}
            </button>
            <button onClick={() => downloadSeries()} className="btn-secondary">
              Baixar Série Completa
            </button>
          </div>
        </div>
      </div>

      {/* Season Selector */}
      <div className="container mx-auto px-12 py-8">
        <div className="flex gap-2 mb-8">
          {series.seasons?.map(season => (
            <button
              key={season.id}
              onClick={() => setSelectedSeason(season.seasonNumber)}
              className={cn(
                "px-6 py-3 rounded-xl font-bold",
                selectedSeason === season.seasonNumber
                  ? "bg-primary text-black"
                  : "bg-white/5 text-white"
              )}
            >
              Temporada {season.seasonNumber}
            </button>
          ))}
        </div>

        {/* Episodes Grid */}
        <div className="space-y-4">
          {currentSeasonEpisodes.map(episode => (
            <EpisodeCard key={episode.id} episode={episode} />
          ))}
        </div>
      </div>
    </div>
  );
};
```

### 6.3 Episode Card Component

```typescript
export const EpisodeCard: React.FC<{ episode: Episode }> = ({ episode }) => {
  const statusConfig = {
    READY: { color: 'green', icon: CheckCircle, label: 'Assistir' },
    DOWNLOADING: { color: 'blue', icon: Download, label: 'Baixando...' },
    QUEUED: { color: 'yellow', icon: Clock, label: 'Na fila' },
    NOT_DOWNLOADED: { color: 'gray', icon: Download, label: 'Baixar' },
    FAILED: { color: 'red', icon: AlertCircle, label: 'Erro' }
  };

  const config = statusConfig[episode.status];
  const Icon = config.icon;

  return (
    <div className="glass-card p-6 flex gap-6 hover:bg-white/10 transition">
      {/* Thumbnail */}
      <div className="w-48 aspect-video rounded-lg overflow-hidden bg-black/40">
        {episode.stillPath ? (
          <img src={episode.stillPath} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/20">
            <Film size={48} />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-xl font-bold">
              {episode.episodeNumber}. {episode.title}
            </h3>
            <p className="text-white/50 text-sm mt-1">
              {episode.duration} min • {episode.quality}
            </p>
          </div>

          {/* Status Badge */}
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full bg-${config.color}-500/20`}>
            <Icon size={16} className={`text-${config.color}-500`} />
            <span className="text-xs font-bold uppercase">{config.label}</span>
          </div>
        </div>

        <p className="text-white/70 mt-4 line-clamp-2">{episode.overview}</p>

        {/* Actions */}
        <div className="flex gap-3 mt-4">
          {episode.status === 'READY' && (
            <Link to={`/episodes/${episode.id}`} className="btn-primary">
              Assistir
            </Link>
          )}
          
          {episode.status === 'NOT_DOWNLOADED' && (
            <button onClick={() => downloadEpisode(episode.id)} className="btn-secondary">
              Baixar Episódio
            </button>
          )}

          {episode.status === 'DOWNLOADING' && (
            <div className="flex items-center gap-2">
              <Loader2 className="animate-spin" size={16} />
              <span className="text-sm">Baixando... 45%</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
```

---

## 🔧 REGRAS DE EDGE CASES

### 7.1 Episódios Duplicados

```typescript
async function handleDuplicateEpisode(parsed: ParsedEpisode) {
  const existing = await prisma.episode.findUnique({
    where: {
      seriesId_seasonNumber_episodeNumber: {
        seriesId: series.id,
        seasonNumber: parsed.seasonNumber,
        episodeNumber: parsed.episodeNumber
      }
    }
  });

  if (existing) {
    // Verificar se a nova versão tem melhor qualidade
    const newQuality = parseQuality(parsed.quality);
    const oldQuality = parseQuality(existing.quality);

    if (newQuality > oldQuality) {
      // Atualizar com melhor qualidade
      await prisma.episode.update({
        where: { id: existing.id },
        data: {
          magnetLink: parsed.magnetLink,
          quality: parsed.quality,
          status: 'NOT_DOWNLOADED'
        }
      });
    } else {
      // Ignorar duplicata
      console.log(`Duplicate episode ignored: ${parsed.seriesName} S${parsed.seasonNumber}E${parsed.episodeNumber}`);
    }
  }
}
```

### 7.2 Torrent com Temporada Completa

```typescript
async function handleSeasonPack(torrent: Torrent) {
  const files = torrent.files.filter(f => isVideoFile(f.name));
  
  for (const file of files) {
    const parsed = parser.parse(file.name);
    
    if (parsed) {
      await createOrUpdateEpisode({
        seriesId: series.id,
        seasonNumber: parsed.seasonNumber,
        episodeNumber: parsed.episodeNumber,
        magnetLink: torrent.magnetURI,
        fileIndex: files.indexOf(file) // Para selecionar arquivo específico
      });
    }
  }
}
```

### 7.3 Falha em Episódio

```typescript
async function handleEpisodeFailure(episodeId: string, error: Error) {
  await prisma.episode.update({
    where: { id: episodeId },
    data: {
      status: 'FAILED',
      errorMessage: error.message
    }
  });

  // Não bloquear outros episódios
  DownloadScheduler.processQueue();

  // Notificar usuário
  await notifyUser({
    type: 'DOWNLOAD_FAILED',
    episodeId,
    message: `Falha ao baixar episódio: ${error.message}`
  });
}
```

### 7.4 Reutilizar HLS Existente

```typescript
async function processEpisodeVideo(episodeId: string) {
  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    include: { video: true }
  });

  if (!episode.video) return;

  // Verificar se já existe HLS
  if (episode.video.hlsPath && fs.existsSync(episode.video.hlsPath)) {
    console.log(`Reusing existing HLS for episode ${episodeId}`);
    
    await prisma.episode.update({
      where: { id: episodeId },
      data: { status: 'READY' }
    });
    
    return;
  }

  // Processar novo HLS
  await convertToHLS(episode.video.storageKey, episodeId);
}
```

---

## 📊 CRONOGRAMA DE IMPLEMENTAÇÃO

### Sprint 1 (Semana 1): Fundação
- ✅ Criar schema Prisma (Series, Season, Episode)
- ✅ Rodar migration
- ✅ Implementar EpisodeParser
- ✅ Testes unitários do parser

**Entregável:** Schema + Parser funcionando

### Sprint 2 (Semana 2): API
- ✅ Criar routes (series-routes, episode-routes)
- ✅ Implementar controllers
- ✅ Integrar com downloader existente
- ✅ Testes de integração

**Entregável:** API REST completa

### Sprint 3 (Semana 3): Download Pipeline
- ✅ Implementar DownloadScheduler
- ✅ Fila de prioridades
- ✅ Auto-queue do próximo episódio
- ✅ Tratamento de erros

**Entregável:** Sistema de download inteligente

### Sprint 4 (Semana 4): Frontend Básico
- ✅ Página de listagem de séries
- ✅ Página de detalhes da série
- ✅ EpisodeCard component
- ✅ Integração com API

**Entregável:** UI básica funcional

### Sprint 5 (Semana 5): Player Inteligente
- ✅ Implementar useAutoNext hook
- ✅ EpisodePlayer component
- ✅ Overlay de Auto Next
- ✅ Integração com download scheduler

**Entregável:** Auto Next funcionando

### Sprint 6 (Semana 6): Polish & Edge Cases
- ✅ Tratamento de duplicatas
- ✅ Season packs
- ✅ Retry logic
- ✅ Notificações
- ✅ Testes E2E

**Entregável:** Sistema production-ready

---

## 🧪 TESTES

### Unit Tests

```typescript
// episode-parser.test.ts
describe('EpisodeParser', () => {
  it('should parse S01E01 format', () => {
    const result = parser.parse('Breaking.Bad.S01E01.1080p.mkv');
    expect(result).toEqual({
      seriesName: 'Breaking Bad',
      seasonNumber: 1,
      episodeNumber: 1,
      quality: '1080p'
    });
  });

  it('should parse 1x01 format', () => {
    const result = parser.parse('Game.of.Thrones.1x01.720p.mp4');
    expect(result).toEqual({
      seriesName: 'Game of Thrones',
      seasonNumber: 1,
      episodeNumber: 1,
      quality: '720p'
    });
  });

  it('should return null for movies', () => {
    const result = parser.parse('Inception.2010.1080p.mkv');
    expect(result).toBeNull();
  });
});
```

### Integration Tests

```typescript
// series-api.test.ts
describe('Series API', () => {
  it('should create series and episodes from torrent', async () => {
    const response = await request(app)
      .post('/api/v1/series/ingest')
      .send({
        magnetLink: 'magnet:?xt=urn:btih:...',
        title: 'Breaking Bad S01'
      });

    expect(response.status).toBe(200);
    
    const series = await prisma.series.findFirst({
      where: { title: { contains: 'Breaking Bad' } }
    });
    
    expect(series).toBeDefined();
    expect(series.totalSeasons).toBeGreaterThan(0);
  });

  it('should return next episode', async () => {
    const episode = await createTestEpisode({ seasonNumber: 1, episodeNumber: 1 });
    const nextEpisode = await createTestEpisode({ seasonNumber: 1, episodeNumber: 2 });

    const response = await request(app)
      .get(`/api/v1/episodes/${episode.id}/next`);

    expect(response.body.id).toBe(nextEpisode.id);
  });
});
```

---

## 🚀 DEPLOYMENT

### Migrations

```bash
# 1. Backup do banco atual
cp backend/prisma/dev.db backend/prisma/dev.db.backup

# 2. Rodar migration
cd backend
npx prisma migrate dev --name add_series_support

# 3. Gerar Prisma Client
npx prisma generate

# 4. Reiniciar backend
npm run dev
```

### Environment Variables

```env
# .env
MAX_CONCURRENT_DOWNLOADS=3
AUTO_QUEUE_NEXT_EPISODE=true
AUTO_NEXT_COUNTDOWN=10
SERIES_DOWNLOAD_PATH=/downloads/series
```

### Rollback Plan

Se algo der errado:

```bash
# 1. Restaurar backup
cp backend/prisma/dev.db.backup backend/prisma/dev.db

# 2. Reverter migration
npx prisma migrate resolve --rolled-back XXXXXX_add_series_support

# 3. Reiniciar sistema
npm run dev
```

---

## 📈 MÉTRICAS DE SUCESSO

### KPIs

1. **Tempo de Identificação**
   - Meta: < 100ms para parser identificar episódio
   - Medição: Log de performance no parser

2. **Taxa de Sucesso de Download**
   - Meta: > 95% de episódios baixados com sucesso
   - Medição: (READY / TOTAL) * 100

3. **Uso de Auto Next**
   - Meta: > 70% dos usuários usam auto next
   - Medição: Analytics de reprodução contínua

4. **Tempo de Resposta da API**
   - Meta: < 200ms para endpoints de série
   - Medição: Middleware de logging

5. **Satisfação do Usuário**
   - Meta: > 4.5/5 em pesquisa de UX
   - Medição: Feedback in-app

---

## 🎯 RESULTADO FINAL

### Antes:
```
Usuário baixa: "Breaking.Bad.S01E01.mkv"
Sistema: Trata como vídeo único
Problema: Sem organização, sem auto next
```

### Depois:
```
Usuário baixa: "Breaking.Bad.S01E01.mkv"
Sistema:
  1. Identifica: Breaking Bad, T1E1
  2. Cria série se não existe
  3. Cria temporada 1
  4. Cria episódio 1
  5. Baixa e processa
  6. Ao terminar: Auto-queue E02
  7. Reprodução: Auto next para E02
```

### Benefícios:
- ✅ Organização automática
- ✅ Reprodução contínua
- ✅ Download inteligente
- ✅ UX nível Netflix
- ✅ Escalável para milhares de séries

---

## 📝 CHECKLIST DE IMPLEMENTAÇÃO

### Fase 1: Modelo de Dados
- [ ] Criar models no schema.prisma
- [ ] Rodar migration
- [ ] Testar relacionamentos
- [ ] Atualizar Video model

### Fase 2: Parser
- [ ] Implementar EpisodeParser
- [ ] Adicionar padrões de regex
- [ ] Testes unitários
- [ ] Integrar com downloader

### Fase 3: API
- [ ] Criar series-routes.ts
- [ ] Criar episode-routes.ts
- [ ] Implementar controllers
- [ ] Documentar endpoints

### Fase 4: Download Pipeline
- [ ] Implementar DownloadScheduler
- [ ] Fila de prioridades
- [ ] Auto-queue logic
- [ ] Error handling

### Fase 5: Player
- [ ] Criar useAutoNext hook
- [ ] Implementar EpisodePlayer
- [ ] Overlay de countdown
- [ ] Integração com API

### Fase 6: UI
- [ ] SeriesListPage
- [ ] SeriesDetailsPage
- [ ] EpisodeCard component
- [ ] Responsividade

### Fase 7: Polish
- [ ] Tratamento de edge cases
- [ ] Testes E2E
- [ ] Performance optimization
- [ ] Documentação

---

## 🎉 CONCLUSÃO

Este plano transforma o StreamForge de um **downloader de vídeos** para um **orquestrador de séries enterprise-grade** com:

- 🧠 Inteligência automática (parser + scheduler)
- 🎬 UX premium (auto next + organização)
- 📊 Escalabilidade (fila + prioridades)
- 🔄 Demanda inteligente (auto-queue)

**Tempo estimado:** 6 semanas  
**Complexidade:** Alta  
**Impacto:** Transformacional  

**Status:** Pronto para implementação! 🚀
