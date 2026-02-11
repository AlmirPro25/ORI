# 🚀 StreamForge Pro - Guia de Início Rápido

Bem-vindo à plataforma de streaming mais avançada e automatizada. Este guia ajudará você a colocar tudo no ar em minutos.

## 🛠 Pré-requisitos
- **Node.js v18+** instalado
- **PostgreSQL** ou **SQLite** (configurado no backend)
- **VLC Media Player** (opcional, para testes externos)

---

## ⚡ Como rodar (Modo Automático)

1. **Instalação Integrada:**
   Abra o terminal na raiz do projeto e rode:
   ```bash
   npm run install:all
   ```

2. **Iniciar Ecossistema:**
   ```bash
   npm run start:all
   ```

Isso iniciará:
- 🖥️ **Frontend:** `http://localhost:5173`
- ⚙️ **Backend:** `http://localhost:3000`
- 🔍 **Nexus Engine:** `http://localhost:3005`
- 🌐 **P2P Gateway:** `http://localhost:3333`

---

## 🤖 Operação do Arconte (IA)
O Arconte rodará silenciosamente no backend. Você verá notificações no canto inferior direito do navegador sempre que ele encontrar novos conteúdos e adicioná-los automaticamente ao seu catálogo.

## 🔍 Como buscar novos filmes
1. Faça login na plataforma.
2. Clique na aba **"Torrents"** no menu superior.
3. Digite o nome do filme (ex: "Avatar").
4. Clique em **"Assistir agora"** para streaming P2P instantâneo ou **"Adicionar"** para salvar no banco de dados.

## 🍿 Dicas de Uso
- **PWA:** No navegador, clique no ícone de instalar (geralmente uma setinha na barra de URL) para ter o StreamForge como um App no seu desktop.
- **Legendas:** Dentro do player, você pode carregar qualquer arquivo `.srt` arrastando-o ou selecionando no ícone de chat/lista.

---

## 📁 Estrutura do Sistema
- `/frontend`: Interface React + Framer Motion (UX Premium)
- `/backend`: API Server com Arconte Curator e Analytics
- `/nexus`: Motor de busca multi-diretório (10+ fontes)
- `/backend/torrent-gateway.mjs`: Bridge HTTP-to-P2P para compatibilidade total com navegadores.

---
**Status do Sistema:** 🟢 PRONTO PARA USO INDUSTRIAL
