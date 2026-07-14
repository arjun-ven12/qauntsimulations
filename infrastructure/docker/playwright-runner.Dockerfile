FROM mcr.microsoft.com/playwright:v1.52.0-noble
RUN corepack enable
WORKDIR /worker
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @taskos/playwright-runner build
ENTRYPOINT ["node", "workers/playwright-runner/dist/cli.js"]
