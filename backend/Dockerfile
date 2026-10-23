FROM node:22-slim
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate
COPY src ./src
EXPOSE 4000
# Applies migrations only if there are any (see src/start.js), then starts the server.
CMD ["node", "src/start.js"]
