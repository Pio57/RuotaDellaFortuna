# Deploy su VPS Hostinger (Docker)

Stessa impostazione di immobiliare-photo-lab: repository clonato in `/opt`, container con `restart: unless-stopped`,
aggiornamento con uno script. HTTPS lo fa Traefik del template n8n di Hostinger (Let's Encrypt), WebSocket incluso.

1. Su DuckDNS crea `nome.duckdns.org` con l'IP del VPS.
2. Sul VPS, da root:
   ```bash
   git clone <repository> /opt/chi-e-pio && cd /opt/chi-e-pio
   cp deploy/.env.example deploy/.env && nano deploy/.env
   docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build
   ```
3. Verifica: `https://nome.duckdns.org/health` risponde `{"status":"ok"}`; poi crea una sessione e entra da due telefoni in 4G.
4. Aggiornamenti: `bash deploy/update.sh`.

Se sul VPS non c'è Traefik (altro reverse proxy), il container espone solo la porta 3000 sulla rete Docker:
punta il proxy a `chi-e-pio:3000` inoltrando gli header `Upgrade`/`Connection` e `Host`.
Il server accetta il WebSocket solo se l'`Origin` coincide con l'`Host` richiesto.
