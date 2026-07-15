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
	trap 'kill 0' INT TERM EXIT; \
	($(UV) run --directory backend fastapi dev src/app/main.py) & \
	(pnpm --dir frontend dev) & \
	wait

test:
	$(MAKE) -j 2 test-backend test-frontend

test-backend:
	$(UV) run --directory backend pytest -q
	$(UV) run --directory backend ruff check . --output-format concise

test-frontend:
	pnpm --dir frontend typecheck
