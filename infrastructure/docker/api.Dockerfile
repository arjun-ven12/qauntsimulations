FROM node:20-slim AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm db:generate && pnpm --filter @taskos/api build
CMD ["pnpm", "--filter", "@taskos/api", "start"]
