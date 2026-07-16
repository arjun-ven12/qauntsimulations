FROM node:22-alpine AS build

WORKDIR /workspace
RUN corepack enable

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @taskos/demo-store build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4174

COPY --from=build /workspace/apps/demo-store/dist ./dist

EXPOSE 4174
CMD ["node", "dist/server/production-server.js"]
