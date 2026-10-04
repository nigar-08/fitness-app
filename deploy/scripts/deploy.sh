#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/fitness-app}"
REPO_URL="${REPO_URL:-https://github.com/nigar-08/fitness-app.git}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed. Run deploy/scripts/install-docker-ubuntu.sh first." >&2
  exit 1
fi

if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"
git pull --ff-only

if [ ! -f .env.prod ]; then
  cp .env.prod.example .env.prod
  echo "Created $APP_DIR/.env.prod. Edit it before running deploy again." >&2
  exit 1
fi

docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
