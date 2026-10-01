FROM node:24-alpine AS build
WORKDIR /app
COPY backend/package*.json ./backend/
COPY web/package*.json ./web/
RUN npm ci --prefix backend --no-audit --no-fund && npm ci --prefix web --no-audit --no-fund
COPY backend ./backend
COPY web ./web
RUN npm run build --prefix backend && npm run build --prefix web && npm prune --prefix backend --omit=dev

FROM node:24-alpine
RUN apk add --no-cache ffmpeg chromium fontconfig ttf-freefont font-noto-emoji
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/backend/package*.json ./backend/
COPY --from=build /app/backend/node_modules ./backend/node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/migrations ./backend/migrations
COPY --from=build /app/backend/scripts ./backend/scripts
COPY --from=build /app/web/dist ./web/dist
WORKDIR /app/backend
CMD ["node", "dist/index.js"]
