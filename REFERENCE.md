# StreamForge - Guia de Referência Rápida

## 🎯 Status dos Vídeos

### READY
- Vídeo transcodificado e pronto para streaming HLS
- Usa `PlayerComponent` (HLS.js)
- Arquivos armazenados em `uploads/hls/{videoId}/`

### NEXUS
- Vídeo externo via torrent (P2P)
- Usa `TorrentPlayer` (WebTorrent)
- `hlsPath` contém o magnet link
- **IMPORTANTE**: Sempre que `hlsPath` começa com `magnet:`, o status DEVE ser `NEXUS`

### PROCESSING
- Vídeo sendo transcodificado pelo FFmpeg
- Worker assíncrono processando

### WAITING
- Vídeo na fila aguardando processamento

### FAILED
- Falha no processamento
- Considere remover vídeos FAILED antigos

## 🔧 Scripts de Manutenção

### Listar Vídeos
```bash
node list-videos.js
```

### Corrigir Status de Magnet Links
```bash
node fix-magnet-status.js
```

### Manutenção Completa
```bash
node maintenance.js
```

## 🚀 Inicialização do Sistema

### Modo Desenvolvimento (Recomendado)
```bash
# Terminal 1 - Nexus Search
cd nexus
npm start

# Terminal 2 - Torrent Gateway
cd backend
node torrent-gateway.mjs

# Terminal 3 - Backend API
cd backend
npm run dev

# Terminal 4 - Frontend
cd frontend
npm run dev
```

### Modo Produção
```bash
# Use o script batch
INICIAR_SISTEMA.bat
```

## 🌐 Endpoints

### Frontend
- http://localhost:5173

### Backend API
- http://localhost:3000
- Health: http://localhost:3000/api/v1/videos

### Nexus Search
- http://localhost:3005
- Health: http://localhost:3005/api/health

### Torrent Gateway
- http://localhost:3333
- Health: http://localhost:3333/health

## 🎬 Fluxo de Vídeos

### Upload Local (HLS)
1. Upload via `/api/v1/videos/upload`
2. Status: `PROCESSING`
3. Worker FFmpeg transcodifica
4. Status: `READY`
5. Player: `PlayerComponent` (HLS)

### Busca Nexus (P2P)
1. Busca via `/api/v1/ai/deep-search`
2. Arconte varre sites de torrent
3. IA enriquece metadados (Gemini)
4. Auto-ingestão via `/api/v1/videos/auto-ingest`
5. Status: `NEXUS`
6. Player: `TorrentPlayer` (WebTorrent)

## ⚠️ Problemas Comuns

### Erro 404 ao tentar reproduzir vídeo NEXUS
**Causa**: Vídeo com magnet link mas status diferente de `NEXUS`
**Solução**: Execute `node fix-magnet-status.js`

### Gateway não conecta
**Causa**: Torrent Gateway não está rodando
**Solução**: Execute `node torrent-gateway.mjs`

### Player não carrega
**Causa**: Frontend tentando usar HLS para magnet link
**Solução**: Verifique o status do vídeo no banco

## 📊 Validações Automáticas

O sistema agora valida automaticamente:
- ✅ Vídeos com `magnet:` sempre terão status `NEXUS`
- ✅ Auto-ingestão detecta magnet links
- ✅ Script de manutenção corrige inconsistências

## 🔐 Usuários

### Admin Padrão
- Email: admin@streamforge.com
- Senha: admin

### Arconte (Sistema)
- Email: arconte@streamforge.ai
- Criado automaticamente na primeira ingestão

## 📝 Logs

### Nexus
- `nexus/nexus-combined.log`
- `nexus/nexus-error.log`

### Backend
- Console do terminal

## 🎨 Componentes Frontend

### PlayerComponent
- HLS streaming (vídeos locais)
- Controles customizados
- Suporte a fullscreen

### TorrentPlayer
- P2P streaming (vídeos NEXUS)
- Fallback Gateway → P2P direto
- Chat em tempo real (Socket.IO)
- Telemetria de download
- Seleção de legendas

### SynergyMonitor
- Telemetria P2P em tempo real
- Progress, peers, download speed
- Apenas para vídeos NEXUS
