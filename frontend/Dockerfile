FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build
RUN npm install -g serve
CMD ["sh", "-c", "serve -s dist -l ${PORT:-3000}"]
