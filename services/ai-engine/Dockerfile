FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# System packages required by the file extractors (Tesseract for OCR,
# Poppler for PDF rasterisation, libmagic for filetype sniffing) plus the
# graphics libs that pdfplumber / PyMuPDF transitively need.
RUN apt-get update && apt-get install -y --no-install-recommends \
        tesseract-ocr \
        tesseract-ocr-eng \
        poppler-utils \
        libgl1 \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
        libxrender1 \
        libmagic1 \
        curl \
        ca-certificates \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first for a better Docker layer cache. tiktoken is in
# requirements.txt; verify it imports cleanly so a broken wheel surfaces at
# build time rather than at the first /extract call.
COPY requirements.txt /app/requirements.txt
RUN pip install --upgrade pip \
    && pip install -r requirements.txt \
    && python -c "import openai, tiktoken; print('openai', openai.__version__, 'tiktoken', tiktoken.__version__)"

COPY . /app

EXPOSE 8100

# Liveness probe: /health verifies Redis, Qdrant and that OPENAI_API_KEY is
# set + the client constructs. It does NOT call OpenAI's network (use
# /ready for that — slower, safer to gate traffic on).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8100/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8100", "--workers", "2"]
