# Build context: repo root

FROM node:20-alpine AS builder
WORKDIR /repo

COPY package.json tsconfig.base.json ./

COPY packages/types/package.json  ./packages/types/
COPY packages/ui/package.json     ./packages/ui/

COPY apps/advisor-app/package.json  ./apps/advisor-app/
COPY apps/advisor-app/tsconfig.json ./apps/advisor-app/

RUN npm install

COPY packages/types/src   ./packages/types/src
COPY packages/ui/src      ./packages/ui/src

COPY apps/advisor-app/src            ./apps/advisor-app/src
COPY apps/advisor-app/index.html     ./apps/advisor-app/index.html
COPY apps/advisor-app/vite.config.ts ./apps/advisor-app/vite.config.ts
COPY apps/advisor-app/tailwind.config.js  ./apps/advisor-app/tailwind.config.js
COPY apps/advisor-app/postcss.config.js   ./apps/advisor-app/postcss.config.js

ARG VITE_AUTH_SERVICE_URL=
ARG VITE_BASE_URL=/
ENV VITE_AUTH_SERVICE_URL=$VITE_AUTH_SERVICE_URL
ENV VITE_BASE_URL=$VITE_BASE_URL

WORKDIR /repo/apps/advisor-app
RUN npm run build

# ── Production image ──────────────────────────────────────────────────────────
FROM nginx:alpine AS runner

COPY --from=builder /repo/apps/advisor-app/dist /usr/share/nginx/html

# SPA serving. Works in BOTH modes:
#   - Behind Caddy (prod):     /advisor/* is stripped before reaching us → /assets/...
#                              served by `location /`
#   - Direct hit (local dev):  /advisor/* reaches us as-is → `location /advisor/`
#                              rewrites in-place to drop the prefix, then falls through
RUN printf 'server {\n  listen 3001;\n  root /usr/share/nginx/html;\n  index index.html;\n\n  # Direct-hit path: strip the /advisor/ prefix in-place\n  location /advisor/ {\n    rewrite ^/advisor/(.*)$ /$1 break;\n    try_files $uri $uri/ /index.html;\n  }\n\n  # When proxied (prefix already stripped) OR for any non-prefixed asset request\n  location / {\n    try_files $uri $uri/ /index.html;\n  }\n}\n' \
    > /etc/nginx/conf.d/default.conf

EXPOSE 3001
CMD ["nginx", "-g", "daemon off;"]
