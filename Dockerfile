FROM node:22.20.0-bookworm-slim AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
ENV COREPACK_HOME=/corepack

RUN corepack enable \
    && corepack prepare pnpm@10.18.3 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/user-web/package.json apps/user-web/package.json
COPY apps/admin-web/package.json apps/admin-web/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json

RUN pnpm install --frozen-lockfile

COPY . .

ARG VITE_API_BASE_URL=/api
ARG ADMIN_BASE_PATH=/admin/
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_BASE_PATH=${ADMIN_BASE_PATH}

RUN pnpm build

FROM node:22.20.0-bookworm-slim AS api-runtime

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /workspace

COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=builder /workspace/apps/api/dist ./apps/api/dist
COPY --from=builder /workspace/packages/shared-types ./packages/shared-types

USER node

EXPOSE 3000

CMD ["node", "apps/api/dist/main.js"]

FROM nginx:1.28.0-alpine AS web-runtime

COPY infrastructure/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /workspace/apps/user-web/dist /usr/share/nginx/html
COPY --from=builder /workspace/apps/admin-web/dist /usr/share/nginx/html/admin

EXPOSE 80
