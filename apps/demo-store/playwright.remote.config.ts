import { defineConfig } from '@playwright/test';

const baseURL = process.env.DEMO_STORE_URL;
if (!baseURL) throw new Error('DEMO_STORE_URL is required for remote demo-store tests');

export default defineConfig({
  testDir: './tests',
  workers: 1,
  use: { baseURL },
});
