# ---- deps ----
    FROM node:20-bookworm-slim AS deps
    WORKDIR /app
    
    COPY package.json package-lock.json* ./
    COPY apps/api/package.json apps/api/package.json
    COPY packages/shared/package.json packages/shared/package.json
    RUN npm install
    
    # ---- build ----
    FROM node:20-bookworm-slim AS build
    WORKDIR /app
    
    # bring in dependencies installed in deps stage
    COPY --from=deps /app/node_modules ./node_modules
    COPY . .
    
    WORKDIR /app/apps/api
    RUN npm run prisma:generate
    RUN npm run build
    
    # ---- runtime ----
    FROM node:20-bookworm-slim AS runtime
    WORKDIR /app
    
    RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
    
    # IMPORTANT: copy node_modules from the BUILD stage (includes generated Prisma client)
    COPY --from=build /app/node_modules ./node_modules
    
    # copy built API output + prisma + scripts + env
    COPY --from=build /app/apps/api/dist ./apps/api/dist
    COPY --from=build /app/apps/api/prisma ./apps/api/prisma
    COPY --from=build /app/apps/api/package.json ./apps/api/package.json
    COPY apps/api/docker-entrypoint.sh ./apps/api/docker-entrypoint.sh
    COPY apps/api/.env ./apps/api/.env
    
    WORKDIR /app/apps/api
    EXPOSE 3001
    ENTRYPOINT ["sh", "docker-entrypoint.sh"]