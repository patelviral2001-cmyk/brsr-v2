FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# System deps. build-essential is needed for some pip wheels; we slim back down later.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt \
    && apt-get purge -y --auto-remove build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY . /app

# Non-root user
RUN useradd --create-home --shell /bin/bash copilot \
    && chown -R copilot:copilot /app
USER copilot

EXPOSE 8101

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:8101/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8101", "--workers", "2", "--proxy-headers"]
