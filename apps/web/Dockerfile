# ---- build ----
# Build stage: install deps, run Vite build, produce static assets.
# VITE_API_BASE_URL is baked in at this point because Vite reads VITE_* env
# vars at build time and compiles them into the JavaScript bundle.
ARG REGISTRY=docker.io/library
FROM ${REGISTRY}/node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm install
COPY . .

# Allow the API URL to be passed in at build time. Different environments
# (test, prod) need different values, set by --build-arg in az acr build.
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

WORKDIR /app/apps/web
RUN npm run build

# ---- runtime ----
# Runtime stage: tiny nginx image serving the compiled static files.
# No node, no source code, no dev dependencies. ~25MB instead of ~1GB.
ARG REGISTRY=docker.io/library
FROM ${REGISTRY}/nginx:alpine AS runtime

# SPA-friendly nginx config (COPY'd in rather than heredoc — heredoc-in-RUN
# is unreliable across Docker contexts and produced an empty file).
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]