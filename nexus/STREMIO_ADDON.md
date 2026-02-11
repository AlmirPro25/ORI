# 🎬 Nexus Stremio Addon - Guia Completo

## 📋 O que é?

O **Nexus Stremio Addon** transforma todo o poder do Nexus Deep Search em um addon para o Stremio, permitindo que você acesse **10+ fontes de torrents** diretamente no player do Stremio!

### ✨ Características

- ✅ **10+ fontes de torrents** (YTS, EZTV, Nyaa, 1337x, TPB, etc)
- ✅ **Busca automática** em múltiplas fontes
- ✅ **Remoção de duplicatas** automática
- ✅ **Ordenação por seeds** (mais popular primeiro)
- ✅ **Suporte a Filmes, Séries e Anime**
- ✅ **Integração nativa** com Stremio
- ✅ **P2P streaming** via WebTorrent

## 🚀 Instalação Rápida

### 1. Iniciar o Addon

```bash
cd nexus
node stremio-server.js
```

Você verá:
```
═══════════════════════════════════════════════════════════
🎬 NEXUS STREMIO ADDON
═══════════════════════════════════════════════════════════

📡 Addon rodando em: http://localhost:7000

🔗 URL de instalação:
   http://localhost:7000/manifest.json

📝 Para instalar no Stremio:
   1. Abra o Stremio
   2. Vá em Addons > Community Addons
   3. Cole a URL acima

✨ Fontes disponíveis: 10+
   - YTS (Filmes HD)
   - EZTV (Séries)
   - Nyaa.si (Anime)
   - BitSearch, 1337x, TPB e mais
═══════════════════════════════════════════════════════════
```

### 2. Instalar no Stremio

#### Desktop (Windows, Mac, Linux)
1. Baixe o Stremio: https://www.stremio.com/downloads
2. Abra o Stremio
3. Clique no ícone de **puzzle** (Addons) no canto superior direito
4. Vá em **Community Addons**
5. Cole a URL: `http://localhost:7000/manifest.json`
6. Clique em **Install**

#### Web
1. Acesse: https://web.stremio.com
2. Faça login
3. Clique em **Addons**
4. Cole a URL: `http://localhost:7000/manifest.json`
5. Clique em **Install**

## 📺 Como Usar

### Buscar Filmes
1. No Stremio, vá para **Discover** > **Movies**
2. Use a barra de busca
3. Clique em um filme
4. Você verá streams do **Nexus** com informações de seeds e tamanho

### Buscar Séries
1. Vá para **Discover** > **Series**
2. Busque sua série favorita
3. Selecione temporada e episódio
4. Streams do Nexus aparecerão automaticamente

### Buscar Anime
1. Vá para **Discover** > **Anime**
2. Busque seu anime
3. Streams do Nyaa.si e outras fontes aparecerão

## 🎯 Fontes Disponíveis

O addon busca automaticamente em:

### Filmes (Movies)
- ✅ **YTS** - Filmes em 720p, 1080p, 4K
- ✅ **1337x** - Variedade geral
- ✅ **ThePirateBay** - Maior biblioteca
- ✅ **BitSearch** - Indexador
- ✅ **TorrentProject** - Indexador

### Séries (TV Shows)
- ✅ **EZTV** - Especializado em séries
- ✅ **1337x** - Variedade geral
- ✅ **ThePirateBay** - Maior biblioteca

### Anime
- ✅ **Nyaa.si** - Maior fonte de anime
- ✅ **1337x** - Variedade geral

## ⚙️ Configuração Avançada

### Mudar Porta
```bash
# Linux/Mac
ADDON_PORT=8000 node stremio-server.js

# Windows PowerShell
$env:ADDON_PORT=8000; node stremio-server.js
```

### Configurar Fontes
Edite `stremio-addon.js` para personalizar quais fontes usar:

```javascript
// Desabilitar uma fonte
extendedSources.toggleSource('bitsearch', false);

// Habilitar novamente
extendedSources.toggleSource('bitsearch', true);
```

## 🔧 Troubleshooting

### Problema: "Addon não aparece no Stremio"
**Solução:**
1. Verifique se o servidor está rodando: `http://localhost:7000/manifest.json`
2. Certifique-se de estar usando a URL correta
3. Tente reinstalar o addon

### Problema: "Nenhum stream encontrado"
**Solução:**
1. Verifique se as fontes estão funcionando: `node test-extended-sources.js`
2. Tente buscar com termos diferentes
3. Alguns conteúdos podem não estar disponíveis

### Problema: "Streams lentos"
**Solução:**
- Escolha streams com mais seeds (👥 número maior)
- Use uma VPN se necessário
- Verifique sua conexão de internet

## 📊 Formato dos Streams

Os streams aparecem no Stremio com este formato:

```
Nexus - YTS 👥 150 📦 1.2 GB
Nexus - EZTV 👥 89 📦 800 MB
Nexus - Nyaa.si 👥 234 📦 1.5 GB
```

Onde:
- **Nexus - [Fonte]** = Provedor do stream
- **👥 [número]** = Quantidade de seeds (quanto mais, melhor)
- **📦 [tamanho]** = Tamanho do arquivo

## 🌐 Acesso Remoto

Para acessar o addon de outros dispositivos na rede:

### 1. Descobrir seu IP local
```bash
# Windows
ipconfig

# Linux/Mac
ifconfig
```

### 2. Usar o IP na URL
Ao invés de `localhost`, use seu IP:
```
http://192.168.1.100:7000/manifest.json
```

### 3. Configurar Firewall
Certifique-se de que a porta 7000 está aberta no firewall.

## 🚀 Deploy em Produção

### Heroku
```bash
# Criar Procfile
echo "web: node nexus/stremio-server.js" > Procfile

# Deploy
heroku create nexus-addon
git push heroku main
```

### Render.com
1. Conecte seu repositório
2. Configure:
   - Build Command: `npm install`
   - Start Command: `node nexus/stremio-server.js`
3. Deploy!

### Glitch
1. Importe o projeto
2. Configure `start` script no package.json
3. Seu addon estará em: `https://seu-projeto.glitch.me/manifest.json`

## 📱 Dispositivos Suportados

O addon funciona em:
- ✅ **Windows** (Desktop)
- ✅ **macOS** (Desktop)
- ✅ **Linux** (Desktop)
- ✅ **Android** (App)
- ✅ **iOS** (App)
- ✅ **Web** (Navegador)
- ✅ **Android TV**
- ✅ **Apple TV**

## 🎨 Personalização

### Mudar Nome do Addon
Edite `stremio-addon.js`:
```javascript
const manifest = {
    name: 'Meu Addon Personalizado',
    description: 'Descrição personalizada'
}
```

### Adicionar Logo
```javascript
const manifest = {
    logo: 'https://url-do-seu-logo.png',
    background: 'https://url-do-background.png'
}
```

### Filtrar por Qualidade
```javascript
builder.defineStreamHandler(async (args) => {
    // ... busca ...
    
    // Filtrar apenas 1080p
    const filtered = streams.filter(s => 
        s.title.includes('1080p')
    );
    
    return { streams: filtered };
});
```

## 📚 Recursos Adicionais

### Documentação Oficial
- Stremio Addon SDK: https://github.com/Stremio/stremio-addon-sdk
- Stremio Protocol: https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/protocol.md

### Exemplos
- Addon Simples: https://github.com/Stremio/addon-helloworld
- Addon com Catálogo: https://github.com/Stremio/addon-catalog-example

### Comunidade
- Discord: https://discord.gg/stremio
- Reddit: https://reddit.com/r/StremioAddons
- Forum: https://www.reddit.com/r/StremioAddons/

## 🔐 Segurança

### Boas Práticas
- ✅ Use HTTPS em produção
- ✅ Implemente rate limiting
- ✅ Valide inputs
- ✅ Não exponha APIs keys
- ✅ Use variáveis de ambiente

### Exemplo com HTTPS
```javascript
const https = require('https');
const fs = require('fs');

const options = {
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem')
};

https.createServer(options, app).listen(7000);
```

## 📈 Monitoramento

### Logs
Os logs aparecem no console:
```
[STREMIO] 🎬 Buscando streams para: movie tt1234567
[STREMIO] 🔍 Buscando: "Matrix" | Categoria: Movies
[STREMIO] ✅ Retornando 15 streams
```

### Estatísticas
Adicione um endpoint de stats:
```javascript
app.get('/stats', (req, res) => {
    res.json({
        totalRequests: requestCount,
        activeSources: sources.length,
        uptime: process.uptime()
    });
});
```

## 🎉 Conclusão

O Nexus Stremio Addon transforma o Stremio em uma **máquina de busca P2P** com acesso a **10+ fontes** de torrents!

**Principais vantagens:**
- ✅ Busca automática em múltiplas fontes
- ✅ Interface nativa do Stremio
- ✅ Suporte a todos os dispositivos
- ✅ Streaming P2P otimizado
- ✅ Fácil de instalar e usar

**Aproveite!** 🚀
