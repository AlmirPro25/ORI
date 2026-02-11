# StreamForge - Industrial Media Engine

> Plataforma de streaming VOD escalável com arquitetura de microservices, transcodificação assíncrona (FFmpeg) e entrega HLS.

## 🏗 Arquitetura

1.  **Ingestão via API:** Node.js/Express recebe uploads.
2.  **Fila de Processamento:** Redis/BullMQ gerencia filas.
3.  **Worker Assíncrono:** Node.js + FFmpeg transcodifica para HLS.
4.  **Storage:** MinIO (local) ou S3 (prod) armazena pedaços de vídeo.

## 🌌 Ecossistema NEXUS (IA Admin)

Agora o sistema inclui o **Nexus Deep Search**, uma infraestrutura de busca profunda P2P.

### 🤖 Arconte - Agente de Sinergia
O Arconte é a inteligência que une os dois mundos:
- Se um usuário busca algo não catalogado, o **Arconte** é despachado.
- Ele varre o **Nexus** (Crawler Puppeteer) em busca de ativos.
- Forja automaticamente os metadados e injeta no catálogo do **StreamForge**.

### 🛠 Inicialização do Nexo
1.  **Arconte Backend (Nexus):**
    ```bash
    cd nexus
    npm install
    npm start # Roda na porta 3005
    ```
2.  **StreamForge (Portable):
    ```bash
    cd backend
    npm install
    npm run dev # Roda na porta 3000
    ```
3.  **Frontend:**
    ```bash
    cd frontend
    npm install
    npm run dev
    ```

### 🛰 Endpoints de Sinergia
- `POST /api/v1/ai/deep-search`: Despacha a IA para busca externa.
- `POST /api/v1/videos/auto-ingest`: Ingestão silenciosa via Nexus.

## 🚀 Inicialização Rápida

1.  Configure as variáveis:
    ```bash
    cp .env.example .env
    ```

2.  Inicie os containers:
    ```bash
    docker compose up --build -d
    ```

3.  Execute migrações (após API subir):
    ```bash
    docker compose exec api npx prisma migrate deploy
    ```

4.  Crie o Bucket `streamforge-media` no MinIO (http://localhost:9001) e coloque como **Public**.

5.  Acesse:
    *   Frontend: http://localhost:5173
    *   API: http://localhost:3000
