FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN npx patchright install chromium

COPY src/ ./src/
COPY scripts/ ./scripts/
COPY public/ ./public/

EXPOSE 3000

CMD ["node", "src/index.js"]