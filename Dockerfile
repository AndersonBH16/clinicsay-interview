FROM node:20-slim

RUN apt-get update && apt-get install -y \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./

RUN npm ci && npm cache clean --force

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