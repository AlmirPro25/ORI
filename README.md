# 🌌 StreamForge: Orion Edition

> Industrial Media Engine com protocolo de distribuição federado e inteligência soberana.

## 🏗️ O Ecossistema

Esta plataforma não é apenas um VOD. É um ecossistema de três camadas integradas:

1.  **🚀 StreamForge Core**: Engine de streaming HLS, gerenciamento de bibliotecas e transcodificação.
2.  **🛰️ Orion Protocol**: Camada de federação P2P (Gossip Protocol) para descoberta e anúncio de conteúdo sem servidores centrais.
3.  **🤖 Arconte Intelligence**: Agente autônomo de busca profunda (Nexus Fleet) que forja metadados a partir de fontes externas.

## ⚡ Inicialização Rápida (v1.0 Stable)

O sistema agora é **Portable**. Não é necessário configurar Docker para o desenvolvimento local.

### 1-Click Launch (Windows)
```powershell
./launch_orion.ps1
```

### Inicialização Manual
1.  **Backend & Orion Node**:
    ```bash
    cd backend
    npm install
    npm run dev # Porta 3000 (API) e 4000 (Orion)
    ```
2.  **Frontend & Dashboard**:
    ```bash
    cd frontend
    npm install
    npm run dev # Porta 5173
    ```

## 🌌 Orion Core Dashboard
Acesse `/orion` na interface para gerenciar seu **Node ID**, visualizar peers federados e publicar conteúdos na rede global.

## 🛠️ Stack Técnica
- **Backend**: Node.js, Express, Prisma, SQLite.
- **P2P/Federation**: WebTorrent (DHT), Gossip Protocol (Custom Orion), Ed25519 Signatures.
- **Frontend**: React, Vite, Framer Motion, TailwindCSS (for primitives).
- **IA**: Puppeteer (Deep Search), Arconte Engine.

---
*Status: v1.0 Stable Release. Desenvolvido para soberania digital.*
