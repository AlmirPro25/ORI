# 🚀 Como Iniciar o Sistema Completo

## Problema Resolvido
O backend estava caindo porque o **Torrent Gateway** não estava rodando. Agora temos scripts para iniciar tudo corretamente.

## Início Rápido

### 1️⃣ Verificar Status dos Serviços
```bash
cd backend
npm run check
```

### 2️⃣ Iniciar Tudo (Recomendado)
```bash
cd backend
npm run dev:all
```

Isso inicia:
- ✅ Torrent Gateway (porta 3333)
- ✅ Backend Principal (porta 3000)

### 3️⃣ Iniciar Frontend
```bash
cd frontend
npm run dev
```

## Comandos Disponíveis

### Backend
```bash
npm run dev:all    # Inicia gateway + backend
npm run dev        # Apenas backend (porta 3000)
npm run gateway    # Apenas gateway (porta 3333)
npm run check      # Verifica se serviços estão online
```

### Verificação Manual
- Gateway: http://localhost:3333/health
- Backend: http://localhost:3000/health
- Frontend: http://localhost:5173

## Arquitetura

```
┌─────────────┐      ┌─────────────┐      ┌──────────────────┐
│  Frontend   │─────▶│   Backend   │─────▶│ Torrent Gateway  │
│  (5173)     │      │   (3000)    │      │     (3333)       │
└─────────────┘      └─────────────┘      └──────────────────┘
                                                    │
                                                    ▼
                                            ┌──────────────┐
                                            │  Swarm P2P   │
                                            └──────────────┘
```

## Solução de Problemas

### Erro: ERR_CONNECTION_REFUSED
**Causa**: Gateway não está rodando  
**Solução**: Execute `npm run dev:all` no backend

### Porta já em uso
```bash
# Windows
netstat -ano | findstr :3333
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:3333 | xargs kill -9
```

### Gateway não responde
1. Verificar logs: `backend/gateway.log`
2. Reiniciar: Ctrl+C e `npm run dev:all`

## Logs Esperados

### Gateway (3333)
```
╔═══════════════════════════════════════════════════════════╗
║   🚀 TORRENT GATEWAY - Streaming Server                   ║
║   Porta: 3333                                             ║
╚═══════════════════════════════════════════════════════════╝
```

### Backend (3000)
```
🚀 STREAMFORGE BACKEND ONLINE NA PORTA 3000
📺 IPTV Module: /api/iptv/*
🧠 Intelligence Engine: /api/intelligence/*
📥 Downloader V2: /api/v1/downloads/*
```

## Desenvolvimento

### Modo Debug
```bash
# Terminal 1
cd backend
npm run gateway

# Terminal 2
cd backend
npm run dev

# Terminal 3
cd frontend
npm run dev
```

### Reiniciar Apenas o Gateway
```bash
# Parar o processo atual (Ctrl+C)
cd backend
npm run gateway
```

## Próximos Passos

Após iniciar tudo:
1. Acesse http://localhost:5173
2. Faça login ou registre-se
3. Busque por conteúdo
4. Clique em um vídeo para reproduzir
5. O sistema agora deve funcionar sem crashes!
