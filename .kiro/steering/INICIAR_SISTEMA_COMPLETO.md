---
inclusion: always
---

# ⚠️ ATENÇÃO: PROCEDIMENTO OBRIGATÓRIO PARA INICIAR SISTEMA

## REGRA CRÍTICA

Quando o usuário disser **"RODA O SISTEMA"** ou **"INICIA O SISTEMA"** ou **"START"**, você DEVE iniciar TODOS os 4 serviços na seguinte ordem:

## COMANDO EXATO A EXECUTAR

```javascript
// 1. Frontend (porta 5173)
controlPwshProcess({
    action: "start",
    command: "npm run dev",
    cwd: "frontend"
})

// 2. Torrent Gateway (porta 3333)
controlPwshProcess({
    action: "start",
    command: "node torrent-gateway.mjs",
    cwd: "backend"
})

// 3. Backend Principal (porta 3000)
controlPwshProcess({
    action: "start",
    command: "npm run dev",
    cwd: "backend"
})

// 4. Nexus Search Engine (porta 3005)
controlPwshProcess({
    action: "start",
    command: "node server.js",
    cwd: "nexus"
})
```

## ARQUITETURA DO SISTEMA

```
┌─────────────────┐
│   Frontend      │ → http://localhost:5173
│   (React/Vite)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Backend       │ → http://localhost:3000
│   (Express)     │
└────┬────────┬───┘
     │        │
     ▼        ▼
┌─────────┐  ┌──────────────┐
│ Gateway │  │    Nexus     │
│ (3333)  │  │    (3005)    │
└─────────┘  └──────────────┘
```

## SERVIÇOS OBRIGATÓRIOS

| # | Serviço | Porta | Comando | Diretório |
|---|---------|-------|---------|-----------|
| 1 | Frontend | 5173 | `npm run dev` | `frontend` |
| 2 | Gateway | 3333 | `node torrent-gateway.mjs` | `backend` |
| 3 | Backend | 3000 | `npm run dev` | `backend` |
| 4 | Nexus | 3005 | `node server.js` | `nexus` |

## ❌ ERROS COMUNS A EVITAR

1. **NÃO iniciar apenas 3 serviços** - São 4 obrigatórios!
2. **NÃO esquecer o Nexus** - Ele é essencial para busca de torrents
3. **NÃO usar `torrent-gateway.js`** - Usar `torrent-gateway.mjs` (ESM)
4. **NÃO criar documentos** - Apenas iniciar os serviços

## VERIFICAÇÃO

Após iniciar, você pode verificar com:
```bash
node check-services.js
```

Todos devem estar ONLINE:
- ✅ Frontend (5173)
- ✅ Backend (3000)
- ✅ Gateway (3333)
- ✅ Nexus (3005)

## PALAVRAS-CHAVE QUE ACIONAM ESTE PROCEDIMENTO

- "roda o sistema"
- "inicia o sistema"
- "start sistema"
- "liga tudo"
- "sobe os servidores"
- "roda tudo"

## RESPOSTA PADRÃO

Após iniciar os 4 serviços, responda apenas:

```
✅ Sistema completo rodando:
- Frontend (5173)
- Backend (3000)
- Gateway (3333)
- Nexus (3005)
```

**SEM CRIAR DOCUMENTOS. SEM EXPLICAÇÕES LONGAS.**
