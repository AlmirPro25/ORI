# 🚀 QUICK START: Implementação de Séries

## Começar AGORA (30 minutos)

### 1. Schema Prisma (5 min)

Adicione ao `backend/prisma/schema.prisma`:

```prisma
model Series {
  id            String    @id @default(uuid())
  title         String
  overview      String?
  poster        String?
  totalSeasons  Int       @default(0)
  totalEpisodes Int       @default(0)
  createdAt     DateTime  @default(now())
  seasons       Season[]
  episodes      Episode[]
}

model Season {
  id           String    @id @default(uuid())
  seriesId     String
  series       Series    @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  seasonNumber Int
  episodeCount Int       @default(0)
  episodes     Episode[]
  @@unique([seriesId, seasonNumber])
}

model Episode {
  id            String    @id @default(uuid())
  seriesId      String
  series        Series    @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  seasonId      String
  season        Season    @relation(fields: [seasonId], references: [id], onDelete: Cascade)
  seasonNumber  Int
  episodeNumber Int
  title         String
  overview      String?
  videoId       String?   @unique
  video         Video?    @relation(fields: [videoId], references: [id])
  status        String    @default("NOT_DOWNLOADED")
  createdAt     DateTime  @default(now())
  @@unique([seriesId, seasonNumber, episodeNumber])
}
```

Adicione ao model Video:
```prisma
model Video {
  // ... campos existentes ...
  episodeId String?  @unique
  episode   Episode?
}
```

### 2. Rodar Migration (2 min)

```bash
cd backend
npx prisma migrate dev --name add_series_support
npx prisma generate
```

### 3. Parser Básico (10 min)

Crie `backend/src/services/episode-parser.ts`:

```typescript
export class EpisodeParser {
  parse(filename: string) {
    // S01E01
    const match1 = filename.match(/S(\d{1,2})E(\d{1,2})/i);
    if (match1) {
      return {
        seasonNumber: parseInt(match1[1]),
        episodeNumber: parseInt(match1[2])
      };
    }
    
    // 1x01
    const match2 = filename.match(/(\d{1,2})x(\d{1,2})/i);
    if (match2) {
      return {
        seasonNumber: parseInt(match2[1]),
        episodeNumber: parseInt(match2[2])
      };
    }
    
    return null;
  }
}
```

### 4. API Básica (10 min)

Crie `backend/src/routes/series-routes.ts`:

```typescript
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
  const series = await prisma.series.findMany({
    include: { _count: { select: { episodes: true } } }
  });
  res.json(series);
});

router.get('/:id', async (req, res) => {
  const series = await prisma.series.findUnique({
    where: { id: req.params.id },
    include: {
      seasons: {
        include: { episodes: true },
        orderBy: { seasonNumber: 'asc' }
      }
    }
  });
  res.json(series);
});

export default router;
```

Adicione ao `server-portable.ts`:
```typescript
import seriesRoutes from './routes/series-routes';
app.use('/api/v1/series', seriesRoutes);
```

### 5. Testar (3 min)

```bash
# Reiniciar backend
npm run dev

# Testar API
curl http://localhost:3000/api/v1/series
```

## ✅ Pronto!

Você agora tem:
- ✅ Schema de séries no banco
- ✅ Parser básico funcionando
- ✅ API REST básica

**Próximos passos:** Ver `SERIES_IMPLEMENTATION_PLAN.md` para implementação completa.
