# Production image for Coolify / Docker
# Frontend is built once, then FastAPI serves the compiled SPA and /api endpoints.

FROM node:24-bookworm-slim AS frontend-build
WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY frontend/ ./
ENV DISABLE_VISUAL_EDITS=true
RUN npm run build


FROM python:3.12-slim AS runtime
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
# The quotation PDF generator reads the company logo from frontend/public.
# Keep public assets in the runtime image as Railway did.
COPY frontend/public/ ./frontend/public/
COPY --from=frontend-build /app/frontend/dist ./frontend/dist/

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/api/health', timeout=3).read()"

CMD ["sh", "-c", "cd backend && exec uvicorn server:app --host 0.0.0.0 --port ${PORT:-8080}"]
