# 🎬 Como Usar o Sistema em Modo Streaming

## 🚀 Início Rápido

### **Windows:**
```bash
# Clique duas vezes no arquivo:
start-streaming-mode.bat
```

### **Manual:**
```bash
# Terminal 1 - Frontend
cd frontend
npm run dev

# Terminal 2 - Gateway de Streaming
cd backend
node torrent-gateway.mjs

# Terminal 3 - Backend
cd backend
npm run dev

# Terminal 4 - Nexus Search
cd nexus
node server.js
```

Aguarde 10-15 segundos e abra: **http://localhost:5173**

---

## 📺 Como Assistir

### **Filmes:**
1. Navegue pelo catálogo
2. Clique no filme
3. Clique em **"Play"** (botão grande no centro)
4. Aguarde 2-5 segundos
5. **Streaming inicia automaticamente!**

### **Séries:**
1. Navegue pelo catálogo de séries
2. Escolha a série
3. Selecione temporada e episódio
4. Clique em **"Play"**
5. **Streaming inicia automaticamente!**

---

## ✅ O Que Mudou

### **ANTES (Modo Download):**
- 🔴 Clicava em "Play" → Sistema baixava arquivo completo (2-4 GB)
- 🔴 Esperava 10-30 minutos para começar a assistir
- 🔴 Disco ficava cheio rapidamente
- 🔴 Arconte baixava 5 filmes automaticamente por dia

### **AGORA (Modo Streaming):**
- ✅ Clica em "Play" → Streaming começa em 2-5 segundos
- ✅ Baixa **apenas o que você está assistindo** (~500 MB)
- ✅ Arquivos temporários são **deletados automaticamente**
- ✅ **Nenhum download automático** (Arconte desabilitado)

---

## 💾 Gerenciamento de Espaço

### **Arquivos Temporários:**
- **Localização**: `backend/downloads/`
- **Tempo de vida**: 2 horas sem uso
- **Limpeza**: Automática a cada 30 minutos

### **Limpeza Manual:**
```bash
cd backend
node cleanup-temp-downloads.js
```

### **Ver Espaço Usado:**
```bash
# Windows
dir backend\downloads /s

# Linux/Mac
du -sh backend/downloads/
```

---

## 🎯 Economia de Banda

| Ação | Antes | Agora | Economia |
|------|-------|-------|----------|
| Assistir filme 1080p | 2-4 GB | 500 MB - 1.5 GB | **70-80%** |
| Assistir episódio | 500 MB - 1 GB | 200-400 MB | **60-70%** |
| Downloads automáticos/dia | 10-20 GB | 0 GB | **100%** |
| **Total/dia** | **15-30 GB** | **2-5 GB** | **80-90%** |

---

## 🔧 Configurações

### **Desabilitar Limpeza Automática:**
Edite `backend/src/server-portable.ts` e comente:
```typescript
// setInterval(() => { ... }, 30 * 60 * 1000);
```

### **Ajustar Tempo de Cache:**
Edite `backend/cleanup-temp-downloads.js`:
```javascript
const MAX_AGE_HOURS = 2; // Altere para 4, 6, 12, etc.
```

### **Re-ativar Downloads Automáticos:**
Edite `backend/.env`:
```env
ARCONTE_PREDICTIVE_PREFETCH=true
MAX_CONCURRENT_DOWNLOADS=3
```

---

## 🐛 Problemas Comuns

### **"Vídeo não inicia"**
**Causa**: Gateway não está rodando ou torrent sem seeds

**Solução**:
1. Verifique se o Gateway está rodando (porta 3333)
2. Tente outro filme/episódio
3. Verifique sua internet

### **"Buffering constante"**
**Causa**: Internet lenta ou torrent com poucos seeds

**Solução**:
1. Escolha qualidade menor (720p)
2. Pause por 10 segundos para buffer
3. Tente outro torrent do mesmo filme

### **"Disco cheio"**
**Causa**: Limpeza automática não está funcionando

**Solução**:
```bash
cd backend
node cleanup-temp-downloads.js
```

### **"Gateway não conecta"**
**Causa**: Porta 3333 já está em uso

**Solução**:
```bash
# Windows
netstat -ano | findstr :3333
taskkill /PID [número] /F

# Linux/Mac
lsof -i :3333
kill -9 [PID]
```

---

## 📊 Monitoramento

### **Status do Gateway:**
```bash
curl http://localhost:3333/health
```

### **Torrents Ativos:**
```bash
curl http://localhost:3333/api/torrent/list
```

### **Verificar Todos os Serviços:**
```bash
cd backend
node check-services.js
```

---

## 🎉 Dicas de Uso

### **Melhor Experiência:**
1. ✅ Use conexão de internet estável (mínimo 5 Mbps)
2. ✅ Escolha torrents com muitos seeds (>10)
3. ✅ Aguarde 5-10 segundos no início do vídeo
4. ✅ Pause por alguns segundos se começar a bufferizar

### **Economizar Banda:**
1. ✅ Assista em 720p em vez de 1080p
2. ✅ Não pule muito no vídeo (força re-download)
3. ✅ Feche abas não utilizadas

### **Privacidade:**
1. ✅ Arquivos são deletados automaticamente
2. ✅ Nenhum histórico permanente no disco
3. ✅ Use VPN se quiser mais privacidade

---

## 🔄 Voltar ao Modo Download

Se preferir o modo antigo (download completo):

1. **Frontend** (`frontend/src/pages/VideoDetails.tsx`):
   ```typescript
   const payloadBase = { startDownload: true };
   ```

2. **Backend** (`backend/.env`):
   ```env
   ARCONTE_PREDICTIVE_PREFETCH=true
   MAX_CONCURRENT_DOWNLOADS=3
   ```

3. **Auto-Curator** (`backend/src/auto-curator.ts`):
   ```typescript
   private predictiveLimit = 5;
   private minSeedsForPredictive = 50;
   ```

---

## 📞 Suporte

### **Logs Úteis:**
- Frontend: Console do navegador (F12)
- Backend: Terminal onde rodou `npm run dev`
- Gateway: Terminal onde rodou `node torrent-gateway.mjs`

### **Arquivos de Log:**
- `backend/backend-live.log`
- `backend/backend-live.err.log`

---

**Aproveite seu Netflix/Popcorn Time pessoal! 🎬🍿**

Sistema 100% Streaming configurado e funcionando! 🚀
