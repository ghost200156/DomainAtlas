.PHONY: setup setup-backend setup-frontend dev test test-backend test-frontend

UV_CACHE_DIR ?= $(CURDIR)/.uv-cache
UV = UV_CACHE_DIR=$(UV_CACHE_DIR) uv

setup:
	$(MAKE) -j 2 setup-backend setup-frontend

setup-backend:
	$(UV) sync --directory backend

setup-frontend:
	pnpm --dir frontend install --frozen-lockfile

dev:
	@set -e; \
	$(UV) run --directory backend uvicorn app.main:app --app-dir src --host 127.0.0.1 --port 8000 & \
	backend_pid=$$!; \
	pnpm --dir frontend dev --host 127.0.0.1 & \
	frontend_pid=$$!; \
	cleanup() { \
		kill $$backend_pid $$frontend_pid 2>/dev/null || true; \
		wait $$backend_pid $$frontend_pid 2>/dev/null || true; \
	}; \
	trap cleanup INT TERM EXIT; \
	wait

test:
	$(MAKE) -j 2 test-backend test-frontend

test-backend:
	$(UV) run --directory backend pytest -q
	$(UV) run --directory backend ruff check . --output-format concise

test-frontend:
	pnpm --dir frontend typecheck
