FROM node:22-alpine

# Install ffmpeg for video watermarking
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy package files and install ALL dependencies (including dev)
COPY package*.json ./
RUN npm ci

# Copy source code and build
COPY . .
RUN npm run build

# Prune dev dependencies for smaller image
RUN npm prune --omit=dev

# Expose the port
EXPOSE 8080

# Start the server
CMD ["node", "dist/index.js"]