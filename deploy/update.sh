#!/usr/bin/env bash
# Aggiorna il server dopo un push: allinea il clone a origin/main, ricostruisce, riavvia, controlla /health.
# Le sessioni in corso sopravvivono (volume chi-e-pio-data → sessions.json).
set -euo pipefail
cd "$(dirname "$0")/.."
git fetch origin
git reset --hard origin/main
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build
sleep 4
docker exec chi-e-pio wget -qO- http://127.0.0.1:3000/health && echo
