# 🚀 Sistema de Busca Avançado - Nexus Deep Search

## 📋 Visão Geral

O sistema agora possui **3 motores de busca** que trabalham em conjunto:

### 1. **Motor API (Novo!)** - `torrent-search-api`
- ✅ Múltiplos providers simultâneos
- ✅ Mais rápido (sem Puppeteer)
- ✅ Menor uso de recursos
- ⚠️  Depende de APIs públicas (podem estar offline)

### 2. **Motor Puppeteer (Original)**
- ✅ Scraping direto dos sites
- ✅ Funciona mesmo se APIs estão offline
- ⚠️  Mais lento e consome mais recursos

### 3. **Motor Híbrido (Recomendado)**
- ✅ Tenta API primeiro
- ✅ Fallback automático para Puppeteer
- ✅ Melhor taxa de sucesso

## 🌐 Providers Disponíveis

### Ativos
- ✅ **1337x** - Geral, boa variedade
- ✅ **ThePirateBay** - Maior biblioteca
- ✅ **Yts** - Filmes em alta qualidade
- ✅ **TorrentProject** - Indexador
- ✅ **Eztv** - Séries de TV
- ✅ **Rarbg** - Qualidade premium

### Indisponíveis
- ❌ **TorrentGalaxy** - API offline
- ❌ **Torlock** - API offline

## 📡 Endpoints da API

### 1. Busca Avançada (Híbrida)
```http
POST http://localhost:3005/api/search/advanced
Content-Type: application/json

{
  "query": "Big Buck Bunny",
  "category": "Movies",  // Movies, TV, All
  "limit": 5,            // Resultados por provider
  "mode": "auto"         // auto, api, puppeteer
}
```

**Modos:**
- `auto`: Tenta API → Fallback Puppeteer (recomendado)
- `api`: Apenas API multi-provider
- `puppeteer`: Apenas scraping Puppeteer

**Resposta:**
```json
{
  "source": "advanced_api",
  "providers": ["1337x", "ThePirateBay", "Yts", ...],
  "results": [
    {
      "title": "Big Buck Bunny (2008) 1080p",
      "magnetLink": "magnet:?xt=urn:btih:...",
      "size": "1.2 GB",
      "seeds": 150,
      "peers": 30,
      "provider": "Yts"
    }
  ]
}
```

### 2. Busca Paralela (Mais Rápida)
```http
POST http://localhost:3005/api/search/parallel
Content-Type: application/json

{
  "query": "Matrix",
  "category": "Movies",
  "limit": 3
}
```

Busca em **todos os providers simultaneamente** e remove duplicatas.

### 3. Listar Providers
```http
GET http://localhost:3005/api/providers
```

**Resposta:**
```json
{
  "available": true,
  "all": ["1337x", "ThePirateBay", "Yts", ...],
  "active": ["1337x", "ThePirateBay", "Yts", ...],
  "total": 8,
  "activeCount": 6
}
```

### 4. Busca Original (Puppeteer)
```http
POST http://localhost:3005/api/search
Content-Type: application/json

{
  "query": "Sintel",
  "category": "all",
  "forceRefresh": false
}
```

## 🔧 Uso Programático

### JavaScript/Node.js
```javascript
const NexusAdvancedSearch = require('./advanced-search');

const search = new NexusAdvancedSearch();

// Busca simples
const results = await search.search('Big Buck Bunny', 'Movies', 5);

// Busca paralela (mais rápida)
const parallel = await search.parallelSearch('Matrix', 'Movies', 3);

// Provider específico
const yts = await search.searchProvider('Inception', 'Yts', 'Movies', 10);

// Listar providers
const providers = search.listProviders();
console.log(providers.active);
```

### cURL
```bash
# Busca avançada
curl -X POST http://localhost:3005/api/search/advanced \
  -H "Content-Type: application/json" \
  -d '{"query":"Big Buck Bunny","category":"Movies","limit":5,"mode":"auto"}'

# Busca paralela
curl -X POST http://localhost:3005/api/search/parallel \
  -H "Content-Type: application/json" \
  -d '{"query":"Matrix","category":"Movies","limit":3}'

# Listar providers
curl http://localhost:3005/api/providers
```

## 📊 Comparação de Métodos

| Método | Velocidade | Taxa de Sucesso | Uso de Recursos |
|--------|------------|-----------------|-----------------|
| API Multi-Provider | ⚡⚡⚡ Muito Rápido | 🟡 Média (depende de APIs) | 🟢 Baixo |
| Puppeteer Scraping | 🐌 Lento | 🟢 Alta | 🔴 Alto |
| Híbrido (Auto) | ⚡⚡ Rápido | 🟢 Muito Alta | 🟡 Médio |
| Busca Paralela | ⚡⚡⚡ Muito Rápido | 🟢 Alta | 🟡 Médio |

## 🎯 Quando Usar Cada Método

### Use **API Multi-Provider** quando:
- ✅ Precisa de velocidade
- ✅ Quer resultados de múltiplas fontes
- ✅ Não importa se alguns providers estão offline

### Use **Puppeteer** quando:
- ✅ APIs estão todas offline
- ✅ Precisa de máxima confiabilidade
- ✅ Não se importa com velocidade

### Use **Híbrido (Auto)** quando:
- ✅ Quer o melhor dos dois mundos
- ✅ Precisa de confiabilidade E velocidade
- ✅ **Recomendado para produção**

### Use **Busca Paralela** quando:
- ✅ Precisa de máxima cobertura
- ✅ Quer remover duplicatas automaticamente
- ✅ Tem recursos de servidor disponíveis

## 🔍 Exemplos de Uso

### Exemplo 1: Busca Simples
```bash
curl -X POST http://localhost:3005/api/search/advanced \
  -H "Content-Type: application/json" \
  -d '{"query":"Big Buck Bunny","mode":"auto"}'
```

### Exemplo 2: Busca com Filtros
```bash
curl -X POST http://localhost:3005/api/search/advanced \
  -H "Content-Type: application/json" \
  -d '{
    "query":"Matrix 1080p",
    "category":"Movies",
    "limit":10,
    "mode":"api"
  }'
```

### Exemplo 3: Busca Paralela
```bash
curl -X POST http://localhost:3005/api/search/parallel \
  -H "Content-Type: application/json" \
  -d '{
    "query":"Inception",
    "category":"Movies",
    "limit":5
  }'
```

## ⚙️ Configuração

### Habilitar/Desabilitar Providers
```javascript
const search = new NexusAdvancedSearch();

// Desabilitar um provider
search.api.disableProvider('ThePirateBay');

// Habilitar novamente
search.api.enableProvider('ThePirateBay');

// Listar ativos
console.log(search.api.getActiveProviders());
```

### Timeout e Limites
```javascript
// Configurar timeout (ms)
search.api.setTimeout(30000); // 30 segundos

// Configurar limite de resultados
const results = await search.search('Matrix', 'Movies', 20); // 20 por provider
```

## 🐛 Troubleshooting

### Problema: "Nenhum resultado encontrado"
**Solução:**
1. Verifique se os providers estão ativos: `GET /api/providers`
2. Tente modo `puppeteer` se API falhar
3. Use busca paralela para maior cobertura

### Problema: "Provider não disponível"
**Solução:**
- Alguns providers podem estar offline temporariamente
- Use modo `auto` para fallback automático
- Verifique logs do servidor

### Problema: "Timeout"
**Solução:**
```javascript
// Aumentar timeout
search.api.setTimeout(60000); // 60 segundos
```

### Problema: "getaddrinfo ENOTFOUND"
**Solução:**
- Provider está bloqueado ou offline
- Use outros providers
- Tente modo `puppeteer` como fallback

## 📈 Performance

### Benchmarks (aproximados)
- **API Single Provider**: ~2-5 segundos
- **API Multi-Provider**: ~3-8 segundos
- **Puppeteer**: ~15-45 segundos
- **Busca Paralela**: ~5-10 segundos

### Otimizações
1. Use cache quando possível
2. Limite o número de providers ativos
3. Ajuste `limit` baseado em necessidade
4. Use busca paralela apenas quando necessário

## 🔐 Rate Limiting

O servidor tem rate limiting configurado:
- **10 requisições por minuto** por IP
- Aplica-se a todas as rotas de busca
- Retorna erro 429 se excedido

## 📝 Logs

Os logs mostram:
- Providers habilitados/desabilitados
- Resultados encontrados por provider
- Erros de conexão
- Performance de cada busca

Exemplo:
```
info: ✅ Provider habilitado: 1337x
info: 🔍 Buscando: "Matrix" | Categoria: Movies
info: 📦 Encontrados 15 resultados brutos
info: ✅ Retornando 12 resultados processados
```

## 🚀 Próximos Passos

1. Integrar com frontend (página de busca)
2. Adicionar mais providers conforme disponibilidade
3. Implementar cache inteligente
4. Adicionar filtros avançados (ano, qualidade, etc.)

## 📚 Referências

- [torrent-search-api](https://www.npmjs.com/package/torrent-search-api)
- [Documentação Nexus Original](../README.md)
- [API Reference](./REFERENCE.md)
