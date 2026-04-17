# 🎬 Configuração do TMDB para Metadados Enriquecidos

## 📋 O que é TMDB?

O **TMDB (The Movie Database)** é uma base de dados de filmes e séries que fornece:
- ✅ Posters em alta qualidade
- ✅ Backgrounds/Fanarts
- ✅ Sinopses detalhadas
- ✅ Avaliações (ratings)
- ✅ Gêneros, elenco, etc

## 🔑 Como Obter uma API Key (GRÁTIS)

### Passo 1: Criar Conta
1. Acesse: https://www.themoviedb.org/signup
2. Preencha o formulário
3. Confirme seu email

### Passo 2: Solicitar API Key
1. Faça login no TMDB
2. Vá para: https://www.themoviedb.org/settings/api
3. Clique em "Request an API Key"
4. Escolha "Developer"
5. Preencha o formulário:
   - **Application Name**: Nexus Deep Search
   - **Application URL**: http://localhost:7000
   - **Application Summary**: Personal streaming addon
6. Aceite os termos
7. Copie sua **API Key (v3 auth)**

### Passo 3: Configurar no Nexus

#### Windows (PowerShell)
```powershell
# Temporário (apenas sessão atual)
$env:TMDB_API_KEY="sua_chave_aqui"
node stremio-server.js

# Permanente (adicionar ao perfil)
[System.Environment]::SetEnvironmentVariable('TMDB_API_KEY', 'sua_chave_aqui', 'User')
```

#### Linux/Mac (Bash)
```bash
# Temporário
export TMDB_API_KEY="sua_chave_aqui"
node stremio-server.js

# Permanente (adicionar ao ~/.bashrc ou ~/.zshrc)
echo 'export TMDB_API_KEY="sua_chave_aqui"' >> ~/.bashrc
source ~/.bashrc
```

#### Arquivo .env (Recomendado)
```bash
# Criar arquivo .env no diretório nexus
echo "TMDB_API_KEY=sua_chave_aqui" > .env

# Instalar dotenv
npm install dotenv

# Adicionar no início do stremio-server.js:
require('dotenv').config();
```

## ✨ Benefícios com TMDB Configurado

### Sem TMDB:
```
┌─────────────────────────────────┐
│  Matrix (1999)                  │
│  [Poster Placeholder]           │
│  Descrição: Conteúdo disponível │
│  via Nexus Deep Search          │
└─────────────────────────────────┘
```

### Com TMDB:
```
┌─────────────────────────────────┐
│  The Matrix (1999)              │
│  [Poster Real em HD]            │
│  ⭐ 8.7/10                       │
│                                 │
│  Descrição: Thomas Anderson é  │
│  um programador que descobre... │
│                                 │
│  Gêneros: Action, Sci-Fi        │
│  Background: [Fanart Real]      │
└─────────────────────────────────┘
```

## 🎯 Recursos Habilitados com TMDB

### 1. Metadados Completos
- ✅ Posters oficiais em alta resolução
- ✅ Backgrounds/Fanarts
- ✅ Sinopses detalhadas
- ✅ Avaliações IMDB
- ✅ Data de lançamento
- ✅ Gêneros

### 2. Catálogos Populares
```
Sem TMDB:
- Catálogos vazios (apenas busca funciona)

Com TMDB:
- Filmes Populares (atualizados diariamente)
- Séries Populares (atualizadas diariamente)
- Top Rated
- Lançamentos
```

### 3. Busca Melhorada
```
Sem TMDB:
- Busca apenas por nome do torrent

Com TMDB:
- Busca com título oficial
- Busca com títulos alternativos
- Busca com ano correto
```

## 🧪 Testar Configuração

```bash
# Testar se a API key está funcionando
curl "https://api.themoviedb.org/3/movie/550?api_key=SUA_CHAVE_AQUI"

# Deve retornar dados do filme "Fight Club"
```

## 📊 Comparação: Com vs Sem TMDB

| Recurso | Sem TMDB | Com TMDB |
|---------|----------|----------|
| **Posters** | Placeholder | HD Oficial |
| **Backgrounds** | Placeholder | Fanart HD |
| **Sinopses** | Genérica | Detalhada |
| **Ratings** | ❌ | ⭐ IMDB |
| **Gêneros** | ❌ | ✅ |
| **Catálogos Populares** | ❌ | ✅ |
| **Busca Precisa** | ⚠️ | ✅ |

## 🚀 Exemplo de Uso

### Iniciar com TMDB
```bash
# Windows
$env:TMDB_API_KEY="abc123xyz"
node stremio-server.js

# Linux/Mac
TMDB_API_KEY="abc123xyz" node stremio-server.js
```

### Verificar no Log
```
═══════════════════════════════════════════════════════════
🎬 NEXUS STREMIO ADDON PRO - VERSÃO REFINADA
═══════════════════════════════════════════════════════════

📡 Addon rodando em: http://localhost:7000
🔗 URL de instalação: http://localhost:7000/manifest.json

✨ Recursos Avançados:
   ✅ Cache inteligente (1h streams, 24h metadados)
   ✅ Metadados enriquecidos (TMDB/IMDB)  ← ATIVO!
   ✅ Detecção de qualidade (4K, 1080p, 720p, etc)
   ...
```

## 🔒 Segurança

### ⚠️ IMPORTANTE:
- ❌ **NÃO** compartilhe sua API key publicamente
- ❌ **NÃO** commite a key no Git
- ✅ Use variáveis de ambiente
- ✅ Use arquivo .env (e adicione ao .gitignore)

### .gitignore
```
# Adicionar ao .gitignore
.env
.env.local
```

## 🐛 Troubleshooting

### Problema: "Invalid API key"
**Solução:**
- Verifique se copiou a key corretamente
- Certifique-se de usar a API Key v3 (não v4)
- Aguarde alguns minutos após criar a key

### Problema: "Request limit exceeded"
**Solução:**
- TMDB tem limite de 40 requisições/10 segundos
- O addon tem cache para evitar isso
- Se exceder, aguarde 10 segundos

### Problema: Metadados não aparecem
**Solução:**
```bash
# Verificar se a variável está definida
# Windows
echo $env:TMDB_API_KEY

# Linux/Mac
echo $TMDB_API_KEY

# Se vazio, configurar novamente
```

## 💡 Dicas

### 1. Cache Automático
O addon cacheia metadados por 24 horas, então:
- ✅ Menos requisições ao TMDB
- ✅ Mais rápido
- ✅ Não excede limites

### 2. Fallback Inteligente
Se TMDB falhar:
- ✅ Addon continua funcionando
- ✅ Usa placeholders
- ✅ Streams continuam disponíveis

### 3. Atualização Automática
Metadados são atualizados automaticamente:
- Streams: 1 hora
- Metadados: 24 horas
- Catálogos: Sempre atualizados

## 🎉 Conclusão

Com TMDB configurado, seu addon fica **MUITO mais profissional**:
- ✅ Visual igual ao Netflix/Prime
- ✅ Informações completas
- ✅ Experiência premium
- ✅ **100% GRÁTIS!**

**Tempo para configurar: 5 minutos**
**Benefício: ENORME!**

Configure agora! 🚀
