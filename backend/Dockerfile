FROM node:20-slim
WORKDIR /app
# Build toolchain for better-sqlite3 native module (falls back to compile if no prebuild)
# ffmpeg: кадрите от видео домофона се вадят от RTSP потока — D340W няма уеб сървър,
# така че няма как да се вземе снимка по HTTP (виж lib/reolinkClient.js).
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ffmpeg \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
# sharp: package-lock.json е генериран на Windows → npm ci дърпа win32 binary-то.
# Трия sharp + @img напълно и преинсталирам ЧИСТО за linux-x64-glibc (node:slim =
# Debian/glibc). Без това компресията на снимки тихо се изключва на Railway.
RUN rm -rf node_modules/sharp node_modules/@img \
 && npm install --cpu=x64 --os=linux --libc=glibc --no-save --no-audit --no-fund sharp
COPY . .
EXPOSE 3002
CMD ["node", "server.js"]
