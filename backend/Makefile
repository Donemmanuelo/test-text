.PHONY: dev build test migrate migrate-revert lint fmt check prepare \
         docker-up docker-down clean help

# ─────────────────────────────────────────────────────────────
# Development
# ─────────────────────────────────────────────────────────────

## dev: Run the backend in development mode (with hot-reload via cargo-watch if installed)
dev:
	cargo run

## build: Compile a release binary
build:
	cargo build --release

## test: Run the full test suite
test:
	cargo test

## check: Fast compile check (no binary output)
check:
	cargo check

# ─────────────────────────────────────────────────────────────
# Database
# ─────────────────────────────────────────────────────────────

## migrate: Run all pending SQLx migrations
migrate:
	cargo sqlx migrate run

## migrate-revert: Revert the most recent migration
migrate-revert:
	cargo sqlx migrate revert

## prepare: Generate .sqlx/ offline query metadata (commit this to git)
prepare:
	cargo sqlx prepare

# ─────────────────────────────────────────────────────────────
# Code Quality
# ─────────────────────────────────────────────────────────────

## lint: Run Clippy and fail on any warnings
lint:
	cargo clippy -- -D warnings

## fmt: Auto-format code with rustfmt
fmt:
	cargo fmt

## fmt-check: Check formatting without modifying files (for CI)
fmt-check:
	cargo fmt --check

# ─────────────────────────────────────────────────────────────
# Docker (local dev services)
# ─────────────────────────────────────────────────────────────

## docker-up: Start Postgres, Redis, and MinIO in the background
docker-up:
	docker compose -f ../docker-compose.yml up -d

## docker-down: Stop and remove local dev containers
docker-down:
	docker compose -f ../docker-compose.yml down

# ─────────────────────────────────────────────────────────────
# Cleanup
# ─────────────────────────────────────────────────────────────

## clean: Remove build artefacts
clean:
	cargo clean

# ─────────────────────────────────────────────────────────────
# Help
# ─────────────────────────────────────────────────────────────

## help: Show this help message
help:
	@grep -E '^## ' Makefile | sed 's/## //' | column -t -s ':'
