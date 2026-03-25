# ── Stage 1: Build the React UI ──────────────────────────────────────────────
FROM node:20-alpine AS ui-builder

WORKDIR /ui

# Copy only package files first for better layer caching
COPY ui/package.json ui/package-lock.json* ./
RUN npm ci --silent

# Copy UI source and build
COPY ui/ .
RUN npm run build -- --outDir /ui-dist

# ── Stage 2: Python runtime ───────────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

COPY mother/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pull in the compiled UI from stage 1
COPY --from=ui-builder /ui-dist /app/static

# Copy the FastAPI application
COPY mother/ .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
