# Build context: repo root

FROM node:20-alpine AS builder
WORKDIR /repo

COPY package.json tsconfig.base.json ./

COPY packages/types/package.json  ./packages/types/
COPY packages/ui/package.json     ./packages/ui/

COPY apps/internal-app/package.json  ./apps/internal-app/
COPY apps/internal-app/tsconfig.json ./apps/internal-app/

RUN npm install

COPY packages/types/src   ./packages/types/src
COPY packages/ui/src      ./packages/ui/src

COPY apps/internal-app/src            ./apps/internal-app/src
COPY apps/internal-app/index.html     ./apps/internal-app/index.html
COPY apps/internal-app/vite.config.ts ./apps/internal-app/vite.config.ts
COPY apps/internal-app/tailwind.config.js  ./apps/internal-app/tailwind.config.js
COPY apps/internal-app/postcss.config.js   ./apps/internal-app/postcss.config.js

ARG VITE_AUTH_SERVICE_URL=
ARG VITE_USER_SERVICE_URL=
ARG VITE_MEETING_SERVICE_URL=
ARG VITE_SHOW_DEV_TOGGLE=false

ENV VITE_AUTH_SERVICE_URL=$VITE_AUTH_SERVICE_URL
ENV VITE_USER_SERVICE_URL=$VITE_USER_SERVICE_URL
ENV VITE_MEETING_SERVICE_URL=$VITE_MEETING_SERVICE_URL
ENV VITE_SHOW_DEV_TOGGLE=$VITE_SHOW_DEV_TOGGLE

WORKDIR /repo/apps/internal-app
RUN npm run build

# ── Production image ──────────────────────────────────────────────────────────
FROM nginx:alpine AS runner

COPY --from=builder /repo/apps/internal-app/dist /usr/share/nginx/html

# SPA fallback: all routes serve index.html (no path prefix; the app is mounted at /)
RUN printf 'server {\n  listen 3002;\n  root /usr/share/nginx/html;\n  index index.html;\n  location / { try_files $uri $uri/ /index.html; }\n}\n' \
    > /etc/nginx/conf.d/default.conf

EXPOSE 3002
CMD ["nginx", "-g", "daemon off;"]
