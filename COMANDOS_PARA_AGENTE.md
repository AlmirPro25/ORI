# 🎯 COMANDOS PARA O AGENTE TERMINAR

## 📋 CONTEXTO

O sistema StreamForge tem:
- ✅ Downloader V1 funcionando (com 4 bombas)
- ⚠️ Downloader V2 criado mas não testado
- ⚠️ Intelligence Engine com erros TypeScript
- ✅ Prisma regenerado com novos modelos

## 🚀 MISSÃO: FAZER V2 FUNCIONAR

### PASSO 1: Verificar Prisma Client
```bash
cd backend
npx prisma generate --force
```

**Objetivo:** Garantir que DownloadQueue, WatchSession, UserProfile, ContentStats, SwarmHealth existem no Prisma Client

### PASSO 2: Compilar TypeScript
```bash
cd backend
npm run build
```

**Se der erro:** Anotar quais arquivos têm erro e corrigir um por um

### PASSO 3: Testar Servidor
```bash
cd backend
npm run dev
```

**Verificar logs:**
- ✅ "🚀 STREAMFORGE BACKEND ONLINE NA PORTA 3000"
- ✅ "🚀 [Queue] Processador iniciado"
- ✅ "🧠 [Intelligence Worker] Iniciado"

### PASSO 4: Testar Endpoints

**Teste 1: Health Check**
```bash
curl http://localhost:3000/api/v1
```
Esperado: `{"message": "StreamForge API is running..."}`

**Teste 2: Login**
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@streamforge.com","password":"admin123"}'
```
Esperado: `{"token":"...","user":{...}}`

**Teste 3: Stats do Sistema**
```bash
curl http://localhost:3000/api/v1/downloads/stats/system \
  -H "Authorization: Bearer SEU_TOKEN"
```
Esperado: `{"queue":{...},"performance":{...}}`

### PASSO 5: Testar Download V2
```bash
node backend/test-downloader-v2.js
```

**Verificar:**
- ✅ Login funciona
- ✅ Adiciona à fila
- ✅ Mostra posição na fila
- ✅ Progresso atualiza
- ✅ Download completa

---

## 🔧 SE DER ERRO

### Erro: "Property 'downloadQueue' does not exist"
**Causa:** Prisma Client não atualizou

**Solução:**
```bash
cd backend
rm -rf node_modules/.prisma
npx prisma generate
```

### Erro: "Could not find module 'webtorrent'"
**Causa:** TypeScript não reconhece módulo

**Solução:** Já tem `@ts-ignore` no código, mas se persistir:
```bash
cd backend
npm install --save-dev @types/node
```

### Erro: "ERR_REQUIRE_ASYNC_MODULE"
**Causa:** Módulo ESM sendo importado como CommonJS

**Solução:** Verificar qual módulo e adicionar `await import()` ou converter para ESM

### Erro: Intelligence Engine com 23 erros
**Causa:** Modelos não reconhecidos

**Solução Temporária:** Comentar import do intelligence-engine no server-portable.ts:
```typescript
// import { startWorker } from './intelligence-worker';
// ...
// startWorker().catch(console.error);
```

---

## 🎯 CRITÉRIOS DE SUCESSO

### Mínimo Viável (V1 Funcionando)
- [x] Servidor inicia sem erros
- [x] Login funciona
- [x] Download V1 funciona
- [x] Streaming P2P funciona

### V2 Funcionando (Objetivo)
- [ ] Servidor inicia com V2
- [ ] Fila de downloads funciona
- [ ] Priorização funciona
- [ ] ETA é calculado
- [ ] Stats do sistema retornam dados

### Intelligence Engine (Bônus)
- [ ] Worker inicia sem erros
- [ ] Jobs rodam a cada 5 minutos
- [ ] Recomendações funcionam
- [ ] Watch tracking funciona

---

## 📊 CHECKLIST DE VERIFICAÇÃO

```bash
# 1. Prisma OK?
cd backend && npx prisma validate
# Esperado: "The schema is valid"

# 2. TypeScript compila?
cd backend && npx tsc --noEmit
# Esperado: Exit code 0

# 3. Servidor inicia?
cd backend && npm run dev
# Esperado: Porta 3000 online

# 4. Endpoints respondem?
curl http://localhost:3000/api/v1
# Esperado: JSON response

# 5. V2 integrado?
curl http://localhost:3000/api/v1/downloads/stats/system
# Esperado: Stats do sistema
```

---

## 🚨 SE NADA FUNCIONAR

### Plano B: Reverter para V1
```bash
# 1. Comentar imports do V2 no server-portable.ts
# 2. Remover rotas do V2
# 3. Usar apenas downloader V1 (que funciona)
```

### Plano C: Rebuild do Zero
```bash
cd backend
rm -rf node_modules
rm -rf dist
npm install
npx prisma generate
npm run build
npm run dev
```

---

## 📝 RELATÓRIO FINAL

Após executar, criar arquivo `STATUS_FINAL_AGENTE.md` com:

```markdown
# Status Final - Agente

## O Que Funcionou
- [ ] Prisma regenerado
- [ ] TypeScript compilou
- [ ] Servidor iniciou
- [ ] V2 integrado
- [ ] Testes passaram

## O Que Não Funcionou
- [ ] Erro X em arquivo Y
- [ ] Erro Z em módulo W

## Próximos Passos
1. ...
2. ...
3. ...

## Valor Real do Sistema
- Funcional: R$ X
- Potencial: R$ Y
```

---

## 🎓 NOTAS IMPORTANTES

1. **V1 JÁ FUNCIONA** - Não quebrar o que está funcionando
2. **V2 É MELHORIA** - Não é crítico para o sistema rodar
3. **Intelligence Engine** - Pode ser desabilitado temporariamente
4. **Foco em fazer funcionar** - Não em fazer perfeito

---

## 🔥 COMANDO ÚNICO (Se tiver pressa)

```bash
cd backend && \
npx prisma generate --force && \
npm run build && \
npm run dev
```

Se isso funcionar, o sistema está pronto.
Se não funcionar, seguir passos detalhados acima.

---

**BOA SORTE, AGENTE! 🚀**
