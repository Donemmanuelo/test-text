# =============================================================================
# Stage 1: Builder — compile the release binary
# =============================================================================
FROM rust:1.80-slim AS builder

WORKDIR /app

# Install system dependencies required for OpenSSL + SQLx native-tls
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency manifests first to cache the layer
COPY Cargo.toml Cargo.lock ./

# Create a dummy main.rs so Cargo can build and cache all dependencies
# without needing the actual source code. This layer is only rebuilt when
# Cargo.toml / Cargo.lock changes.
RUN mkdir -p src && echo 'fn main() {}' > src/main.rs
RUN cargo build --release

# Remove the dummy binary artefact so Cargo rebuilds it from real source
RUN rm -f target/release/whatsapp-backend target/release/deps/whatsapp_backend*

# Copy the real source tree
COPY src/ src/
COPY migrations/ migrations/

# If using sqlx offline mode, copy the generated metadata
# COPY .sqlx/ .sqlx/
# ENV SQLX_OFFLINE=true

# Touch main.rs to ensure Cargo re-compiles the binary even if src/ hash
# matches cache (avoids stale artefact from the dummy main.rs above)
RUN touch src/main.rs && cargo build --release

# =============================================================================
# Stage 2: Runtime — minimal image with just the compiled binary
# =============================================================================
FROM debian:bookworm-slim AS runtime

WORKDIR /app

# Install runtime dependencies (CA certs for TLS, libssl for native-tls)
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Copy the compiled binary from the builder stage
COPY --from=builder /app/target/release/whatsapp-backend /app/whatsapp-backend

# Migrations are embedded via sqlx at compile time, but copy them anyway
# for tools that inspect the container at runtime
COPY --from=builder /app/migrations /app/migrations

# Railway / Fly.io inject PORT; default to 8080 for local docker run
ENV PORT=8080
EXPOSE 8080

CMD ["/app/whatsapp-backend"]
