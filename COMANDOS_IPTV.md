# 🎬 Comandos Úteis - Sistema IPTV

## 🚀 Inicialização

### Iniciar Sistema Completo

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

### Acesso Rápido

```
Frontend: http://localhost:5173
Backend API: http://localhost:3000
TV ao Vivo: http://localhost:5173/tv
```

---

## 🧪 Testes

### Testar Integração IPTV

```bash
cd backend
node test-iptv.js
```

**Saída esperada:**
```
✅ Arquivo de dados carregado com sucesso!
📺 Total de canais: 55
✅ Canais com logo: 55/55
✅ Canais com URL: 55/55
```

### Testar API Manualmente

```bash
# Listar todos os canais
curl http://localhost:3000/api/iptv/channels

# Listar grupos
curl http://localhost:3000/api/iptv/groups

# Buscar canal
curl "http://localhost:3000/api/iptv/channels/search?q=globo"

# Filtrar por grupo
curl http://localhost:3000/api/iptv/channels/group/CANAIS%20ESPORTE

# Estatísticas
curl http://localhost:3000/api/iptv/stats

# Canais populares
curl http://localhost:3000/api/iptv/stats/popular

# Exportar M3U
curl http://localhost:3000/api/iptv/export/m3u -o playlist.m3u
```

---

## 📝 Gerenciamento de Canais

### Adicionar Novo Canal

Edite `backend/data/iptv-brasil.json`:

```json
{
  "name": "Nome do Canal",
  "logo": "https://exemplo.com/logo.png",
  "group": "CATEGORIA",
  "url": "https://exemplo.com/stream.m3u8"
}
```

### Categorias Disponíveis

```
CANAIS ABERTOS
CANAIS NOTICIAS
CANAIS ESPORTE
FILMES/SERIES
CANAIS INFANTIL
DOCUMENTARIOS
VARIEDADES
```

### Validar JSON

```bash
cd backend
node -e "console.log(JSON.parse(require('fs').readFileSync('data/iptv-brasil.json')))"
```

---

## 🔧 Manutenção

### Limpar Cache

```bash
# Frontend
cd frontend
rm -rf node_modules/.vite
npm run dev

# Backend
cd backend
rm -rf dist
npm run build
```

### Reiniciar Serviços

```bash
# Parar todos os processos Node
# Windows
taskkill /F /IM node.exe

# Linux/Mac
killall node

# Reiniciar
npm run dev
```

### Verificar Logs

```bash
# Backend logs
cd backend
npm run dev 2>&1 | tee logs.txt

# Frontend logs
cd frontend
npm run dev 2>&1 | tee logs.txt
```

---

## 📊 Monitoramento

### Ver Estatísticas em Tempo Real

```bash
# Loop de estatísticas
while true; do
  curl -s http://localhost:3000/api/iptv/stats | jq
  sleep 5
done
```

### Monitorar Canais Populares

```bash
# Ver top 10 canais
curl -s http://localhost:3000/api/iptv/stats/popular | jq '.popular[:10]'
```

### Contar Canais por Categoria

```bash
curl -s http://localhost:3000/api/iptv/channels | jq '[.[] | .group] | group_by(.) | map({group: .[0], count: length})'
```

---

## 🔍 Debug

### Verificar Estrutura de Dados

```bash
cd backend
node -e "
const data = require('./data/iptv-brasil.json');
console.log('Total:', data.channels.length);
console.log('Grupos:', [...new Set(data.channels.map(c => c.group))]);
console.log('Sem logo:', data.channels.filter(c => !c.logo).length);
console.log('Sem URL:', data.channels.filter(c => !c.url).length);
"
```

### Testar Stream Específico

```bash
# Testar se URL está acessível
curl -I "URL_DO_STREAM"

# Baixar primeiros bytes
curl -r 0-1000 "URL_DO_STREAM" -o test.ts
```

### Verificar CORS

```bash
curl -H "Origin: http://localhost:5173" \
     -H "Access-Control-Request-Method: GET" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS \
     http://localhost:3000/api/iptv/channels
```

---

## 📦 Backup e Restore

### Backup de Canais

```bash
# Criar backup
cp backend/data/iptv-brasil.json backend/data/iptv-brasil.backup.json

# Com timestamp
cp backend/data/iptv-brasil.json "backend/data/iptv-brasil.$(date +%Y%m%d_%H%M%S).json"
```

### Restore de Backup

```bash
# Restaurar último backup
cp backend/data/iptv-brasil.backup.json backend/data/iptv-brasil.json
```

### Export Completo

```bash
# Exportar tudo
cd backend
tar -czf iptv-backup.tar.gz data/iptv-brasil.json src/iptv-routes.ts

# Importar
tar -xzf iptv-backup.tar.gz
```

---

## 🌐 Importação de Playlists

### Via API

```bash
# Importar playlist M3U
curl -X POST http://localhost:3000/api/iptv/playlist/upload \
  -H "Content-Type: application/json" \
  -d '{"playlistUrl": "https://exemplo.com/playlist.m3u"}'
```

### Via Interface

1. Acesse `http://localhost:5173/tv`
2. Clique em "IMPORTAR M3U"
3. Cole a URL
4. Clique em "Importar"

### Playlists Públicas Recomendadas

```bash
# IPTV-ORG (Global)
https://iptv-org.github.io/iptv/index.m3u

# IPTV-ORG (Brasil)
https://iptv-org.github.io/iptv/countries/br.m3u

# Free-IPTV
https://raw.githubusercontent.com/Free-IPTV/Countries/master/BR_Brazil.m3u
```

---

## 🔄 Atualização

### Atualizar Dependências

```bash
# Backend
cd backend
npm update

# Frontend
cd frontend
npm update
```

### Atualizar HLS.js

```bash
cd frontend
npm install hls.js@latest
```

### Verificar Versões

```bash
# Node.js
node --version

# NPM
npm --version

# Dependências
npm list hls.js
npm list express
```

---

## 📈 Performance

### Medir Tempo de Carregamento

```bash
# Tempo de resposta da API
time curl -s http://localhost:3000/api/iptv/channels > /dev/null

# Com detalhes
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:3000/api/iptv/channels
```

**curl-format.txt:**
```
time_namelookup:  %{time_namelookup}\n
time_connect:     %{time_connect}\n
time_starttransfer: %{time_starttransfer}\n
time_total:       %{time_total}\n
```

### Benchmark de API

```bash
# Apache Bench (se instalado)
ab -n 100 -c 10 http://localhost:3000/api/iptv/channels

# Ou com curl em loop
for i in {1..100}; do
  curl -s -o /dev/null -w "%{time_total}\n" http://localhost:3000/api/iptv/channels
done | awk '{sum+=$1} END {print "Média:", sum/NR, "s"}'
```

---

## 🐛 Troubleshooting

### Problema: Canais não carregam

```bash
# Verificar se backend está rodando
curl http://localhost:3000/api/iptv/channels

# Verificar logs
cd backend
npm run dev

# Verificar arquivo de dados
cat data/iptv-brasil.json | jq
```

### Problema: CORS Error

```bash
# Verificar headers CORS
curl -I http://localhost:3000/api/iptv/channels

# Deve ter:
# Access-Control-Allow-Origin: *
```

### Problema: Stream não reproduz

```bash
# Testar URL diretamente
curl -I "URL_DO_STREAM"

# Usar proxy
curl http://localhost:3000/api/iptv/stream/proxy?url=URL_ENCODED
```

### Problema: Performance ruim

```bash
# Verificar uso de CPU/RAM
top -p $(pgrep -f "node.*backend")

# Verificar conexões
netstat -an | grep 3000

# Limpar cache
rm -rf node_modules/.cache
```

---

## 📱 Mobile Testing

### Testar em Dispositivo Móvel

```bash
# Descobrir IP local
# Windows
ipconfig

# Linux/Mac
ifconfig

# Acessar de outro dispositivo
http://SEU_IP:5173/tv
```

### Simular Mobile no Chrome

1. Abra DevTools (F12)
2. Clique no ícone de dispositivo móvel
3. Escolha um dispositivo
4. Teste a interface

---

## 🔐 Segurança

### Verificar Vulnerabilidades

```bash
# Backend
cd backend
npm audit

# Frontend
cd frontend
npm audit

# Corrigir automaticamente
npm audit fix
```

### Atualizar Pacotes de Segurança

```bash
npm audit fix --force
```

---

## 📊 Relatórios

### Gerar Relatório de Canais

```bash
cd backend
node -e "
const data = require('./data/iptv-brasil.json');
const groups = {};
data.channels.forEach(c => {
  groups[c.group] = (groups[c.group] || 0) + 1;
});
console.log('RELATÓRIO DE CANAIS');
console.log('===================');
console.log('Total:', data.channels.length);
console.log('\nPor Categoria:');
Object.entries(groups).sort((a,b) => b[1] - a[1]).forEach(([g, c]) => {
  console.log(\`  \${g}: \${c}\`);
});
"
```

### Exportar Relatório JSON

```bash
curl -s http://localhost:3000/api/iptv/stats | jq > relatorio-iptv.json
```

---

## 🎯 Atalhos Úteis

### Aliases (Adicione ao .bashrc ou .zshrc)

```bash
# Atalhos IPTV
alias iptv-start="cd backend && npm run dev"
alias iptv-test="cd backend && node test-iptv.js"
alias iptv-logs="cd backend && tail -f logs.txt"
alias iptv-stats="curl -s http://localhost:3000/api/iptv/stats | jq"
alias iptv-channels="curl -s http://localhost:3000/api/iptv/channels | jq"
```

### Scripts NPM Customizados

Adicione ao `package.json`:

```json
{
  "scripts": {
    "iptv:test": "node test-iptv.js",
    "iptv:validate": "node -e \"JSON.parse(require('fs').readFileSync('data/iptv-brasil.json'))\"",
    "iptv:backup": "cp data/iptv-brasil.json data/iptv-brasil.backup.json",
    "iptv:stats": "curl -s http://localhost:3000/api/iptv/stats"
  }
}
```

---

## 📚 Documentação Relacionada

- **Técnica**: `IPTV_SISTEMA_COMPLETO.md`
- **Usuário**: `GUIA_USUARIO_IPTV.md`
- **Integração**: `IPTV_INTEGRATION.md`
- **Resumo**: `RESUMO_IPTV.md`

---

## 🎉 Quick Start

```bash
# 1. Testar sistema
cd backend && node test-iptv.js

# 2. Iniciar backend
cd backend && npm run dev

# 3. Iniciar frontend (novo terminal)
cd frontend && npm run dev

# 4. Acessar
# http://localhost:5173/tv

# 5. Testar API
curl http://localhost:3000/api/iptv/channels | jq
```

---

**Comandos atualizados em: Fevereiro 2026**  
**Sistema: Arconte Enterprise - IPTV Module**  
**Versão: 1.0.0**
