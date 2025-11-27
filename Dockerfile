FROM node:20-slim

RUN apt-get update && apt-get install -y \
    openssl \
    chromium \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libwayland-client0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    procps \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./

RUN npm ci --only=production && npm cache clean --force

COPY prisma ./prisma/

RUN npx prisma generate

COPY src ./src/

RUN npm run build

RUN mkdir -p /app/data

RUN groupadd -r nodejs && useradd -r -g nodejs nodejs
RUN chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3000

CMD ["npm", "run", "start"]