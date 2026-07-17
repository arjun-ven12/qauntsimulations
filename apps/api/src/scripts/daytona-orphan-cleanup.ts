import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadEnvironment } from '../config/env.js';
import { createSandboxProvider } from '../integrations/daytona/daytona-sandbox.service.js';
import { DaytonaOrphanCleanupService } from '../modules/execution/daytona-orphan-cleanup.service.js';

const rootEnvPath = fileURLToPath(new URL('../../../../.env', import.meta.url));
loadEnvFile(rootEnvPath);
const env = loadEnvironment();
if (!env.DAYTONA_API_KEY) throw new Error('DAYTONA_API_KEY is required for Daytona orphan cleanup');

const dryRun = process.argv.includes('--dry-run');
const provider = createSandboxProvider({
  daytonaApiKey: env.DAYTONA_API_KEY,
  target: env.DAYTONA_TARGET,
  ...(env.DAYTONA_API_URL ? { daytonaApiUrl: env.DAYTONA_API_URL } : {}),
  ...(env.DAYTONA_SNAPSHOT ? { snapshot: env.DAYTONA_SNAPSHOT } : {}),
});
const result = await new DaytonaOrphanCleanupService(provider).run({
  dryRun,
  olderThanMinutes: env.DAYTONA_ORPHAN_MAX_AGE_MINUTES,
});
console.log(JSON.stringify(result, null, 2));
