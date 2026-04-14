# --- Industrial Docker Template for Inzeedo POS API ---

# Step 1: Base Environment
FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Step 2: Dependency Resolution
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
# Use --frozen-lockfile to ensure identical dependency versions in production
RUN pnpm install --frozen-lockfile

# Step 3: Final Production Image
FROM base AS runner
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set environment defaults
ENV NODE_ENV=production
ENV PORT=5000

# Metadata
EXPOSE 5000

# Execute server
CMD ["node", "server.js"]
