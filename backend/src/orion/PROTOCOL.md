# 🌌 PROTOCOLO ORION - Especificação Técnica v1.0

> "Não somos um site. Somos uma engine de distribuição audiovisual descentralizada."

## 1. Visão Geral
O Protocolo Orion é uma arquitetura de orquestração de mídia distribuída que combina redes P2P (BitTorrent/WebTorrent) com uma camada de federação leve e descoberta via DHT.

O objetivo é criar uma infraestrutura resiliente onde cada nó (servidor) atua como um peer autônomo, capaz de indexar, distribuir e transmitir conteúdo sem dependência central.

## 2. Arquitetura em Camadas

### 🔵 Camada 1: Mídia (Data Plane)
- Responsável pelo transporte de bytes.
- **Tecnologia**: WebTorrent / LibTorrent.
- **Identificador**: InfoHash (Magnet Link).
- **Estratégia**: Streaming sequencial (prioridade em chunks iniciais).

### 🟣 Camada 2: Metadados (Control Plane / Federation)
- Responsável pela indexação e descoberta de conteúdo rico.
- **Estrutura**: Grafo distribuído de nós federados.
- **Comunicação**: Gossip Protocol sobre WebSocket/HTTP.
- **Dados**: Catálogo, Posters, Sinopses, Ratings, Seed Status.

### 🟢 Camada 3: Descoberta (Discovery)
- Responsável por encontrar nós e peers.
- **Mechanismo**: DHT (Distributed Hash Table) + Bootstrap Nodes.
- **Fluxo**:
  1. Bootstrapping (conectar a nós conhecidos).
  2. Peer Exchange (PEX) para descobrir vizinhos.
  3. DHT Lookup para encontrar content providers.

### 🟡 Camada 4: Cache Distribuído (Edge)
- Nós voluntários ou incentivados que replicam conteúdo popular.
- **Função**: Reduzir latência e aumentar disponibilidade.
- **Política**: LRU (Least Recently Used) baseada em popularidade local.

### 🔴 Camada 5: Identidade (Auth & Trust)
- Identificação criptográfica de nós e usuários.
- **Node ID**: Derivado da chave pública (Ed25519 ou similar).
- **Esquema**: `orion://node/{nodeId}`
- **Confiança**: Web of Trust (WoT) ou Score de Reputação.

## 3. Especificação de Protocolo

### 3.1. Identidade do Nó
Cada nó é identificado por um par de chaves criptográficas.
- **Public Key**: Identidade visível.
- **Private Key**: Assinatura de mensagens e transações.
- **Node ID**: Hash(PublicKey).

### 3.2. Formato de Mensagem (Gossip)
```json
{
  "type": "HELLO | QUERY | FOUND | UPDATE",
  "sourceId": "node_abc123...",
  "targetId": "node_xyz789... | *",
  "payload": { ... },
  "signature": "base64_signature",
  "timestamp": 1678900000
}
```

### 3.3. Ciclo de Vida do Nó
1. **Init**: Gera/Carrega identidade.
2. **Bootstrap**: Conecta aos seeds iniciais definidos em config.
3. **Announce**: Publica presença na rede ("Estou vivo").
4. **Sync**: Solicita diferenças de catálogo (Delta Sync).
5. **Serve**: Atende requisições de stream e metadados.

## 4. Estado Atual: Orion v1.0 (Stable Release)
- [x] **Core & Identity**: Identidade descentralizada (Ed25519) funcional.
- [x] **Federation Stable**: Gossip protocol e handshakes operacionais.
- [x] **Content Broadcast**: Propagação de metadados via rede federada.
- [x] **Observability**: Dashboard de monitoramento em tempo real.

**CONGELAMENTO DE ESCOPO (Freeze)**:
O objetivo agora não é adicionar novas camadas técnicas (DHT, Reputação), mas transformar o Orion em um componente estável, documentado e replicável.

## 5. Próximos Passos (Produto)
- [ ] **Documentação Técnica**: Guia de instalação "Start in 2 minutes".
- [ ] **Mobile Polish**: Ajustar UI do dashboard para controle via smartphone.
- [ ] **Packaging**: Scripts de automação para deploy rápido.
- [ ] **Health & Stability**: Verificação de integridade de mensagens e tratamento de erros de rede.

---
*Status: Ciclo Fechado. Foco em estabilidade e produto.*

