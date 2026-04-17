# 🔧 Solução: Crash do Backend Durante Reprodução

## Problema Identificado

O backend estava caindo com `ERR_CONNECTION_REFUSED` porque o **Torrent Gateway** (porta 3333) não estava rodando. O frontend tenta se conectar a este serviço separado para fazer streaming de torrents, mas ele não estava ativo.

## Arquitetura

```
Frontend (5173) → Backend (3000) → Torrent Gateway (3333) → Swarm P2P
```

O sistema usa 2 servidores:
- **Backend Principal** (porta 3000): API REST, banco de dados, lógica de negócio
- **Torrent Gateway** (porta 3333): Streaming de torrents via WebTorrent

## Correções Aplicadas

### 1. Adicionado endpoint `/api/metadata` faltante
O frontend estava chamando este endpoint que não existia no gateway.

### 2. Criado script `start-all.js`
Inicia ambos os servidores automaticamente na ordem correta.

### 3. Adicionados scripts npm
- `npm run gateway` - Inicia apenas o gateway
- `npm run dev:all` - Inicia tudo (gateway + backend)

## Como Usar

### Opção 1: Iniciar Tudo de Uma Vez (Recomendado)
```bash
cd backend
npm run dev:all
```

### Opção 2: Iniciar Separadamente
```bash
# Terminal 1 - Gateway
cd backend
npm run gateway

# Terminal 2 - Backend
cd backend
npm run dev
```

## Verificação

1. Gateway rodando: `http://localhost:3333/health`
2. Backend rodando: `http://localhost:3000/health`

## Logs Esperados

```
🚀 TORRENT GATEWAY - Streaming Server
   Porta: 3333
   
🚀 STREAMFORGE BACKEND ONLINE NA PORTA 3000
```

## Próximos Passos

Se o problema persistir:
1. Verificar se as portas 3000 e 3333 estão livres
2. Verificar logs em `backend/gateway.log` e `backend/gateway-error.log`
3. Reiniciar ambos os servidores
