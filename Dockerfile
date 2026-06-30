FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY public ./public

ENV PHOTO_ROOT=/photos \
    CONFIG_DIR=/config \
    PORT=8080

EXPOSE 8080

CMD ["node", "src/server.js"]
