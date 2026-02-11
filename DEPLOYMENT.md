# Deploy em Produção

1.  **Server Setup:**
    - Ubuntu 22.04 + Docker + Docker Compose.
    - Clone o repo em `/opt/streamforge`.

2.  **Configuração:**
    - Crie `.env` de produção com senhas fortes.
    - Configure DNS (`stream`, `api`, `storage` subdomains).

3.  **Proxy Reverso (Nginx Host):**
    - Configure Nginx no host para fazer proxy das portas 5173 (frontend), 3000 (api) e 9000 (storage).
    - Use Certbot para SSL.

4.  **Deploy:**
    ```bash
    docker compose -f docker-compose.prod.yml up --build -d
    ```
