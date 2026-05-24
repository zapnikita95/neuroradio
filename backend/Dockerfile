# Use when Railway Root Directory = backend (see backend/railway.toml)
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --production

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/index.js"]
