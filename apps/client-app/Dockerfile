# Build context: repo root
# Needs root context to copy packages/types and packages/ui

FROM node:20-alpine AS builder
WORKDIR /repo

COPY package.json tsconfig.base.json ./

# Shared packages (types + ui — no config needed in frontend)
COPY packages/types/package.json  ./packages/types/
COPY packages/ui/package.json     ./packages/ui/

# App manifest
COPY apps/client-app/package.json  ./apps/client-app/
COPY apps/client-app/tsconfig.json ./apps/client-app/

RUN npm install

# Shared source
COPY packages/types/src   ./packages/types/src
COPY packages/ui/src      ./packages/ui/src

# App source + config files
COPY apps/client-app/src            ./apps/client-app/src
COPY apps/client-app/index.html     ./apps/client-app/index.html
COPY apps/client-app/vite.config.ts ./apps/client-app/vite.config.ts
COPY apps/client-app/tailwind.config.js  ./apps/client-app/tailwind.config.js
COPY apps/client-app/postcss.config.js   ./apps/client-app/postcss.config.js

# Inject the runtime API URL so Vite bakes it into the bundle
ARG VITE_AUTH_SERVICE_URL=
ENV VITE_AUTH_SERVICE_URL=$VITE_AUTH_SERVICE_URL

WORKDIR /repo/apps/client-app
RUN npm run build

# ── Production image ──────────────────────────────────────────────────────────
FROM nginx:alpine AS runner

COPY --from=builder /repo/apps/client-app/dist /usr/share/nginx/html

# SPA fallback: all routes serve index.html
RUN printf 'server {\n  listen 3000;\n  root /usr/share/nginx/html;\n  index index.html;\n  location / { try_files $uri $uri/ /index.html; }\n}\n' \
    > /etc/nginx/conf.d/default.conf

EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
