#!/usr/bin/env bash
# Sets up (if needed) and runs the MemoryLens AI backend on :8000.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d "venv" ]; then
  echo "Creating virtualenv..."
  python3 -m venv venv
fi

source venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt

if [ ! -f ".env" ]; then
  cp .env.example .env
fi

echo "Starting MemoryLens AI backend on http://localhost:8000 ..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
