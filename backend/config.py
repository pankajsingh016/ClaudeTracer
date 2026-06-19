"""Load project-root .env before any path or pricing env vars are read."""

from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = PROJECT_ROOT / ".env"

if ENV_FILE.is_file():
    load_dotenv(ENV_FILE)
