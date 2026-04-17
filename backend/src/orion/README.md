# 🌌 Orion Protocol v1.0 - Stable

Orion is a decentralized media distribution engine. It combines BitTorrent's raw power with a federated metadata layer and cryptographic identity management.

## 🚀 Quick Start (2 Minutes)

1.  **Configure Environment**:
    Check your `ORION_PORT` (default 4000) and `ORION_BOOTSTRAP_NODES` in `.env`.

2.  **Start the Engine**:
    Orion starts automatically with the StreamForge backend.
    ```bash
    npm run dev
    ```

3.  **Access the Dashboard**:
    Go to `/orion` in your browser to see your Node ID and network status.

## 🛠️ Components

### 🟢 Identity Manager
Generates a unique cryptographic fingerprint for your node. Your identity is stored in `orion_node.key`. **Do not lose this file.**

### 🟣 Federation Layer (Gossip)
When you publish content, your node announces it to all known peers. Those peers verify the signature and relay the message to their neighbors.

### 🟡 Edge Cache Manager
Automatically manages your storage folder (`/downloads`). It monitors disk usage and prepares for content eviction based on popularity.

## 📡 API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/v1/orion/status` | `GET` | Get local node health and peer count. |
| `/api/v1/orion/peers` | `GET` | List all active federated connections. |
| `/api/v1/orion/publish` | `POST` | Announce new content (Title + InfoHash). |

## 🛡️ Trust & Security
All messages in the Orion network are signed. In v1.0, nodes trust their bootstrap peers. Future versions will implement reputation scoring.

---
*Powered by Orion Protocol Architecture.*
