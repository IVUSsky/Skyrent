FROM node:18-slim
WORKDIR /app
# Build toolchain for better-sqlite3 native module (falls back to compile if no prebuild)
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
# sharp: package-lock.json може да е генериран на друг ОС (Windows) → npm ci
# пропуска linux binary-то. Доинсталирай явно за linux-x64, иначе компресията
# на снимки тихо се изключва на Railway.
RUN npm install --cpu=x64 --os=linux --no-audit --no-fund sharp
COPY . .
EXPOSE 3002
CMD ["node", "server.js"]
