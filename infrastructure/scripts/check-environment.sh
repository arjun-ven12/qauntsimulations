#!/usr/bin/env bash
set -euo pipefail
node --version
pnpm --version
pnpm db:generate
pnpm typecheck
