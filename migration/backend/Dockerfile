# syntax=docker/dockerfile:1

# Two stages so the wheels are built once and the runtime image carries no
# compiler. The result is ~150 MB, which matters because Container Apps pulls
# it on every cold start from zero replicas.
FROM python:3.12-slim AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /build
COPY requirements.txt .
RUN python -m venv /opt/venv \
 && /opt/venv/bin/pip install --upgrade pip \
 && /opt/venv/bin/pip install -r requirements.txt


FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH" \
    APP_ENV=production \
    PORT=8080

# Run as a non-root user. Container Apps does not require it, but a process
# that never needs root should never have it.
RUN groupadd --system app && useradd --system --gid app --home /app app

COPY --from=builder /opt/venv /opt/venv

WORKDIR /app
COPY --chown=app:app app ./app

USER app
EXPOSE 8080

# uvicorn supervises its own workers. Two fit comfortably in the 0.5 GiB the
# free-grant container profile gives us, and the work here is IO-bound
# anyway, so more would buy nothing.
#
# gunicorn is deliberately not used: its uvicorn worker class is deprecated
# upstream, and uvicorn's own supervisor does the same job with one fewer
# dependency in the image.
CMD ["sh", "-c", "exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port ${PORT} \
  --workers ${WEB_CONCURRENCY:-2} \
  --timeout-graceful-shutdown 30 \
  --no-server-header \
  --access-log"]
