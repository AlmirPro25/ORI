
# Estrutura do Projeto StreamForge

Esta estrutura foi desenhada para suportar uma arquitetura de Monolito Modular, permitindo que a API e o Worker compartilhem código (Models, Utils) mas rodem como processos distintos.

```
stream-forge/
├── docker-compose.yml       # Orquestração local (App, DB, Redis, MinIO)
├── .env.example             # Template de variáveis de ambiente
├── backend/                 # Backend Monorepo
│   ├── src/
│   │   ├── config/          # Env vars, S3 config, Redis config
│   │   ├── controllers/     # Handlers de rota (Apenas HTTP logic)
│   │   ├── middlewares/     # Auth, Upload (Multer), Validation
│   │   ├── routes/          # Definição de endpoints
│   │   ├── services/        # Lógica de negócio pura
│   │   ├── queue/           # Lógica de Filas
│   │   │   ├── producer.ts  # Adiciona jobs (usado pela API)
│   │   │   └── consumer.ts  # Processa jobs (usado pelo Worker)
│   │   ├── lib/             # Wrappers (FFmpeg, S3 Client)
│   │   ├── utils/           # Helpers genéricos
│   │   ├── app.ts           # Entrypoint: API SERVER
│   │   └── worker.ts        # Entrypoint: PROCESSING WORKER
│   ├── prisma/              # Schema e Migrations
│   ├── uploads/             # Área de Staging (Temporária)
│   │   ├── temp/            # Uploads brutos
│   │   └── hls/             # Saída do transcodificador (antes do upload S3)
│   └── package.json
└── docs/                    # Documentação de Arquitetura
```

## Regras de Diretório
1.  **`src/queue/consumer.ts`**: Este arquivo é **sagrado**. É onde o FFmpeg é invocado. Se este arquivo falhar, o vídeo morre. Ele deve ter tratamento de erro robusto.
2.  **`src/app.ts`** vs **`src/worker.ts`**:
    *   `app.ts` sobe o servidor HTTP (Express/Fastify). **NÃO** processa vídeo.
    *   `worker.ts` sobe a conexão com o Redis e aguarda jobs. **NÃO** atende requisições HTTP.
