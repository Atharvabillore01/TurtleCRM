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

ARG VITE_AUTH_SERVICE_URL=http://localhost:4000
ENV VITE_AUTH_SERVICE_URL=$VITE_AUTH_SERVICE_URL

WORKDIR /repo/apps/advisor-app
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /repo/apps/advisor-app/dist          ./dist
COPY --from=builder /repo/node_modules                   ./node_modules
COPY --from=builder /repo/apps/advisor-app/package.json  ./package.json

EXPOSE 3001
CMD ["node_modules/.bin/vite", "preview", "--host", "0.0.0.0", "--port", "3001"]
