FROM node:22-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

RUN npm prune --omit=dev

EXPOSE 8080

# Create a startup script that logs before running
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