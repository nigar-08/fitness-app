#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/fitness-app}"
cd "$APP_DIR"

docker compose -f docker-compose.prod.yml --env-file .env.prod ps
echo
echo "Recent gateway logs:"
docker compose -f docker-compose.prod.yml --env-file .env.prod logs --tail=80 gateway
