import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4175' },
  webServer: {
    command: 'pnpm build && PORT=4175 pnpm start',
    url: 'http://127.0.0.1:4175/products/test-product',
    reuseExistingServer: false,
  },
});
