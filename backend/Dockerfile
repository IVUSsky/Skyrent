FROM node:18-slim
WORKDIR /app
# Build toolchain for better-sqlite3 native module (falls back to compile if no prebuild)
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
EXPOSE 3002
CMD ["node", "server.js"]
