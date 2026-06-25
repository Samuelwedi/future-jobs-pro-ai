FROM node:22-alpine

# Install system dependencies for node-canvas + ffmpeg
RUN apk add --no-cache \
    build-base \
    cairo-dev \
    pango-dev \
    jpeg-dev \
    giflib-dev \
    librsvg-dev \
    python3 \
    ffmpeg

WORKDIR /app

COPY package*.json ./

# Install dependencies (including canvas – this will build successfully now)
RUN npm ci

COPY . .

# Build TypeScript
RUN npm run build

# Remove dev dependencies (optional, but keeps image smaller)
RUN npm prune --omit=dev

EXPOSE 8080

# Startup script (unchanged)
RUN echo '#!/bin/sh' > /start.sh && \
    echo 'echo "=== Starting container ==="' >> /start.sh && \
    echo 'echo "--- Environment ---"' >> /start.sh && \
    echo 'env | grep -E "PORT|NODE_ENV|DATABASE_URL|JWT_SECRET"' >> /start.sh && \
    echo 'echo "--- Files in /app/dist ---"' >> /start.sh && \
    echo 'ls -la /app/dist' >> /start.sh && \
    echo 'echo "--- Running node ---"' >> /start.sh && \
    echo 'node dist/index.js' >> /start.sh && \
    chmod +x /start.sh

CMD ["/start.sh"]