FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production && npx patchright install chromium

COPY src/ ./src/
COPY scripts/ ./scripts/
COPY public/ ./public/

EXPOSE 3000

CMD ["node", "src/server.js"]
