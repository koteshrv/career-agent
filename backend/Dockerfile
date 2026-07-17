# Use the official Microsoft Playwright image which includes Chromium
FROM mcr.microsoft.com/playwright:v1.44.0-jammy

WORKDIR /app

# Prevent tzdata from prompting for geographic area and hanging the build
ENV DEBIAN_FRONTEND=noninteractive

# Install Python, pip, Xvfb, and LaTeX dependencies
RUN apt-get update && apt-get install -y python3 python3-pip xvfb texlive-latex-base texlive-fonts-recommended texlive-latex-extra texlive-fonts-extra && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Create necessary directories
RUN mkdir -p /app/backend

# Copy backend source
COPY backend/ ./backend/
COPY targets.json keywords.json ./

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/healthz', timeout=3)" || exit 1

CMD ["python3", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
