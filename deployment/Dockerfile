# Stage 1: Build Frontend and Dependencies
FROM node:24-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code and build production assets
COPY . .
RUN npm run build
RUN npm test

# Stage 2: Production Minimal Runtime
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Run as non-root user for security
USER node

# Copy dependencies and production build
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev

COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/server ./server
COPY --chown=node:node --from=builder /app/tsconfig*.json ./

EXPOSE 3001

# Start the unified production server
CMD ["node", "--import", "tsx", "server/index.ts"]
