FROM node:22-alpine AS builder

WORKDIR /app/server
RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package*.json ./server/

WORKDIR /app/server
RUN npm install
RUN npm ci --only=production

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/server/node_modules ./server/node_modules
RUN ln -s /app/server/node_modules /app/node_modules

WORKDIR /app
COPY shared/ ./shared/
COPY server/ ./server/

WORKDIR /app
USER node
EXPOSE 8000
CMD ["node","server/js/main.js"]