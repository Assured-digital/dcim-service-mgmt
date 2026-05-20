# ---- build ----
# Build stage: install deps, run Vite build, produce static assets.
# VITE_API_BASE_URL is baked in at this point because Vite reads VITE_* env
# vars at build time and compiles them into the JavaScript bundle.
FROM node:20-alpine AS build
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
FROM nginx:alpine AS runtime

# SPA-friendly nginx config: any unknown route falls back to index.html so
# client-side routing works. Without this, a refresh on e.g. /sites/123
# would return 404 from nginx.
RUN cat > /etc/nginx/conf.d/default.conf <<'EOF'
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  # Static assets: long cache, fingerprinted by Vite.
  location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  # Everything else: serve index.html, let React Router handle the path.
  location / {
    try_files $uri $uri/ /index.html;
  }
}
EOF

COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]