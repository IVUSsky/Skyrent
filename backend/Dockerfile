FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production --no-audit --no-fund
COPY . .
EXPOSE 3002
CMD ["node", "server.js"]
