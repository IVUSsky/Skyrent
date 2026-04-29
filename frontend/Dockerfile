FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build
CMD ["sh", "-c", "node_modules/.bin/serve -s dist -l ${PORT:-3000}"]
