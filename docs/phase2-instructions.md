
# Instruções Operacionais - Fase 2: Backend & Engine

**Destinatário:** Engenheiro Backend / DevOps
**Prioridade:** CRÍTICA

Você é responsável por dar vida à arquitetura. Siga estas etapas na ordem exata.

## 1. Fundação de Infraestrutura (Docker)
Crie um `docker-compose.yml` na raiz que suba os serviços auxiliares. Sem eles, o código é inútil.
- **PostgreSQL:** Porta 5432.
- **Redis:** Porta 6379. Obrigatório para o BullMQ.
- **MinIO:** Porta 9000 (API) e 9001 (Console). Simulará o AWS S3.
  - Crie um bucket chamado `streamforge-media` automaticamente ou manualmente no primeiro boot.
  - **CRUCIAL:** O bucket deve ter política de acesso `public` (read-only) para que o player HLS funcione depois.

## 2. Ingestão (API)
- Implemente o endpoint `POST /videos/upload` usando `multer`.
- **Validação:** Aceite apenas `video/mp4`, `video/mkv`, `video/quicktime`.
- **Ação:**
  1. Salve o arquivo em `uploads/temp`.
  2. Crie o registro no Postgres (`status: WAITING`).
  3. Despache o job para o Redis (`videoQueue.add(...)`).
  4. Retorne `202 Accepted` imediatamente.

## 3. O Motor (Worker)
- Configure o `queue/consumer.ts`.
- Use a biblioteca `fluent-ffmpeg`.
- **O Comando FFmpeg (The Recipe):**
  Não faça transcodificação simples. Você deve gerar HLS.
  ```javascript
  ffmpeg(inputPath)
    .outputOptions([
      '-profile:v baseline', // Compatibilidade
      '-level 3.0',
      '-start_number 0',
      '-hls_time 10',        // Segmentos de 10s
      '-hls_list_size 0',    // Manter todos os segmentos na playlist
      '-f hls'               // Formato de saída
    ])
    .output('output_dir/index.m3u8')
  ```
- **Pipeline de Sucesso:**
  1. FFmpeg termina -> Pasta local cheia de `.ts` e `.m3u8`.
  2. Upload recursivo da pasta para o S3/MinIO (mantendo a estrutura).
  3. Atualize DB para `READY` com o caminho do S3.
  4. `fs.rm` na pasta temporária e no arquivo original.

## 4. Segurança
- Assegure que as chaves de acesso (AWS/MinIO, DB Passwords) estejam **apenas** no `.env`.
- No controller de upload, verifique se `req.user` existe (JWT Middleware).

Execute com precisão. A latência não perdoa.
