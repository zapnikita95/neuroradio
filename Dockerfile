# Monorepo root — deploy only backend/ to Railway (Root Directory must be empty)
FROM node:20-alpine

WORKDIR /app

COPY backend/package.json backend/package-lock.json ./
RUN npm ci

COPY backend/ ./
COPY website/ ./website/
RUN npm run build && npm prune --production

# Маркетинговый сайт efir-ai.ru — раздаётся бэкендом как статика (/app/website).
COPY website/ ./website/

ENV NODE_ENV=production
EXPOSE 3000

# Run Node directly — npm does not forward SIGTERM (Railway rolling deploy noise/crashes).
CMD ["node", "dist/index.js"]
