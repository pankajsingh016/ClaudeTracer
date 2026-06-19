.PHONY: setup dev build run test clean

# Load .env from project root when present (CLAUDE_DIR, ENTERPRISE_DISCOUNT_MULT, …)
ifneq (,$(wildcard .env))
  include .env
  export
endif

HOST ?= 0.0.0.0
PORT ?= 8000

# One-time: create venv + install backend and frontend deps.
setup:
	python3 -m venv venv
	./venv/bin/pip install -r backend/requirements.txt
	cd frontend && npm install
	@echo "\n✅ Setup done. Copy .env.example → .env, set CLAUDE_DIR, then 'make run' or 'make dev'."

# Dev: FastAPI (:8000) + Vite (:5173, proxies /api). Open http://localhost:5173
dev:
	@echo "→ CLAUDE_DIR=$${CLAUDE_DIR:-$$HOME/.claude}"
	@echo "→ Frontend http://localhost:5173  (API proxied to :$(PORT))"
	@trap 'kill 0' INT TERM EXIT; \
	( cd backend && ../venv/bin/uvicorn main:app --reload --host $(HOST) --port $(PORT) ) & \
	( cd frontend && npm run dev )

# Build the React UI into frontend/dist (served by the backend in prod).
build:
	cd frontend && npm run build

# Prod: build UI, then serve everything from one process. Open http://localhost:8000
run: build
	@echo "→ CLAUDE_DIR=$${CLAUDE_DIR:-$$HOME/.claude}"
	@echo "→ ClaudeTracer http://localhost:$(PORT)"
	cd backend && ../venv/bin/uvicorn main:app --host $(HOST) --port $(PORT)

# Run the cost-engine tests (list API rates; ignore .env enterprise discount).
test:
	cd backend && ENTERPRISE_DISCOUNT_MULT=1 CLOUD_ENDPOINT=global ../venv/bin/python -m pytest -q

clean:
	rm -rf venv frontend/node_modules frontend/dist backend/__pycache__ backend/.pytest_cache
