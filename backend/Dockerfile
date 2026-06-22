FROM node:22-alpine

# Install ffmpeg for video watermarking
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source code and build
COPY . .
RUN npm run build

# Expose the port (Railway uses 8080 by default)
EXPOSE 8080

# Start the server
CMD ["node", "dist/index.js"]