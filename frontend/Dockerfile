FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev --prefer-offline --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
RUN npm install -g serve --no-audit --no-fund
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
