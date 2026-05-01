# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source and build
COPY . .
# Note: Provide build-time envs if needed (e.g. NEXT_PUBLIC_API_URL)
RUN npm run build

# Stage 2: Runtime
FROM node:20-slim

WORKDIR /app

# Environment configuration
ENV NODE_ENV=production

# Copy only necessary files from build stage
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules

# Expose Port
EXPOSE 3000

# Start Next.js
CMD ["npm", "start"]
