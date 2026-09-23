# ==============================================================================
# Stage 1: Build the React SPA frontend
# ==============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package manifests first for caching
COPY package*.json ./
RUN npm ci || npm install

# Copy application source and build production bundle
COPY . .
RUN npm run build

# ==============================================================================
# Stage 2: Lean Production Runtime (~180MB)
# ==============================================================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=38282
ENV HOST=0.0.0.0
ENV NODE_OPTIONS="--experimental-strip-types"

# Install production dependencies only
COPY package*.json ./
RUN (npm ci --omit=dev || npm install --omit=dev) && npm cache clean --force

# Copy compiled frontend and backend assets
COPY --from=builder /app/build ./build
COPY --from=builder /app/server ./server
COPY --from=builder /app/words ./words

# Non-root user for security
USER node

EXPOSE 38282

CMD ["node", "server/server.ts"]