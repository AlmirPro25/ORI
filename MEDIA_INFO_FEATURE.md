# 🎬 Sistema de Informações de Mídia

## Visão Geral

Sistema transparente que exibe informações sobre áudios e legendas disponíveis **antes** do usuário entrar no vídeo, diretamente na tela de busca/listagem.

## ✨ Funcionalidades

### 1. Extração Automática
- Detecta todas as faixas de áudio (idiomas, codec, canais)
- Detecta todas as legendas (idiomas, codec)
- Identifica legendas externas (.srt)
- Marca vídeos com português (áudio ou legenda)
- Identifica vídeos dublados em PT-BR

### 2. Badges Visuais
Exibidas nos cards de vídeo:
- 🎙️ **Dublado PT-BR** (verde) - Tem áudio em português
- 📝 **Legendas PT-BR** (azul) - Tem legendas em português
- 🔊 **X áudios** - Múltiplas faixas de áudio
- 📝 **X legendas** - Múltiplas legendas disponíveis

### 3. Filtros de Busca
- Filtrar por vídeos dublados
- Filtrar por vídeos com português
- Filtrar por idioma específico

## 🚀 Como Usar

### Atualizar Vídeos Existentes

```bash
cd backend
node update-media-info.js
```

Isso vai processar todos os vídeos e extrair as informações de mídia.

### Atualizar Vídeo Específico

```bash
curl -X POST http://localhost:3000/api/v1/media-info/videos/{VIDEO_ID}/update-media-info
```

### Buscar com Filtros

```bash
# Apenas dublados em PT-BR
GET /api/v1/media-info/videos/search?dubbed=true

# Com português (áudio ou legenda)
GET /api/v1/media-info/videos/search?portuguese=true

# Idioma específico
GET /api/v1/media-info/videos/search?language=en
```

## 📊 Campos no Banco de Dados

```prisma
model Video {
  // ... campos existentes
  audioTracks      String?   // JSON com faixas de áudio
  subtitleTracks   String?   // JSON com legendas
  hasPortuguese    Boolean   // Tem PT-BR (áudio ou legenda)
  hasDubbed        Boolean   // Tem áudio em PT-BR
}
```

## 🎨 Interface

### VideoCard
As badges aparecem automaticamente abaixo do título do vídeo:

```tsx
<MediaBadges
    audioTracks={video.audioTracks}
    subtitleTracks={video.subtitleTracks}
    hasPortuguese={video.hasPortuguese}
    hasDubbed={video.hasDubbed}
/>
```

### Detalhes Completos
Para exibir todas as faixas em uma página de detalhes:

```tsx
<MediaTracksDetail
    audioTracks={video.audioTracks}
    subtitleTracks={video.subtitleTracks}
/>
```

## 🔧 Integração Automática

O sistema extrai informações automaticamente quando:
1. Um vídeo é enviado via upload
2. Um vídeo é baixado via torrent
3. Um administrador executa o script de atualização

## 📝 Exemplo de Dados

```json
{
  "audioTracks": [
    {
      "index": 0,
      "language": "en",
      "codec": "aac",
      "channels": 2,
      "title": "English"
    },
    {
      "index": 1,
      "language": "pt-BR",
      "codec": "aac",
      "channels": 2,
      "title": "Português"
    }
  ],
  "subtitleTracks": [
    {
      "index": 2,
      "language": "pt-BR",
      "codec": "srt",
      "title": "Portuguese"
    },
    {
      "index": 3,
      "language": "en",
      "codec": "srt",
      "title": "English"
    }
  ],
  "hasPortuguese": true,
  "hasDubbed": true
}
```

## 🎯 Benefícios

1. **Transparência Total** - Usuário sabe exatamente o que vai encontrar
2. **Melhor UX** - Não precisa abrir o vídeo para descobrir
3. **Filtros Inteligentes** - Busca apenas o que interessa
4. **Priorização** - Vídeos dublados aparecem destacados
5. **Informação Completa** - Todos os idiomas e formatos visíveis

## 🔄 Manutenção

### Reprocessar Todos os Vídeos
```bash
node backend/update-media-info.js
```

### Verificar Status
```bash
# Ver quantos vídeos têm info de mídia
SELECT COUNT(*) FROM Video WHERE audioTracks IS NOT NULL;

# Ver vídeos dublados
SELECT title FROM Video WHERE hasDubbed = 1;

# Ver vídeos com português
SELECT title FROM Video WHERE hasPortuguese = 1;
```

## 🚀 Próximos Passos

- [ ] Adicionar filtro na UI de busca
- [ ] Ordenar por "Dublados primeiro"
- [ ] Notificar quando novo conteúdo dublado chegar
- [ ] Preferências de idioma por usuário
- [ ] Auto-seleção de faixa baseada em preferência
