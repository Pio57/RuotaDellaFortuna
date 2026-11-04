# Deploy su VPS Hostinger (Docker)

Stessa impostazione di immobiliare-photo-lab: repository clonato in `/opt`, container con `restart: unless-stopped`,
aggiornamento con uno script. Un solo container serve sia il sito sia il WebSocket: non c'è un frontend da
pubblicare a parte.

Repository: https://github.com/Pio57/RuotaDellaFortuna

## Opzione A: senza dominio (la più semplice)

```bash
git clone https://github.com/Pio57/RuotaDellaFortuna.git /opt/ruota-della-fortuna && cd /opt/ruota-della-fortuna
docker compose -f deploy/docker-compose.ip.yml up -d --build
```
Apri la porta 3000 (`ufw allow 3000/tcp` e firewall del pannello Hostinger). Il sito è su `http://<IP del VPS>:3000`.
Senza HTTPS il pulsante «Copia link» può non copiare: il link si legge a schermo e si manda a mano.

## Opzione B: HTTPS con Traefik (template n8n di Hostinger)

Serve un nome di dominio: un sottodominio DuckDNS, oppure il nome che Hostinger dà al VPS (tipo `srvXXXX.hstgr.cloud`,
già puntato al VPS: si può usare quello senza creare nulla).

```bash
git clone https://github.com/Pio57/RuotaDellaFortuna.git /opt/ruota-della-fortuna && cd /opt/ruota-della-fortuna
cp deploy/.env.example deploy/.env && nano deploy/.env      # DOMAIN, TRAEFIK_NETWORK, CERT_RESOLVER
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build
```
Verifica: `https://<dominio>/health` risponde `{"status":"ok"}`; poi crea una sessione ed entra da due telefoni in 4G.

## Aggiornamenti

```bash
bash deploy/update.sh
```
Le sessioni in corso sopravvivono (volume Docker con `sessions.json`).

Il server accetta il WebSocket solo se l'`Origin` coincide con l'indirizzo richiesto, quindi funziona con qualunque
indirizzo (IP e porta compresi) senza configurazione.
