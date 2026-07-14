import { chromium, firefox, webkit, type Browser } from '@playwright/test'; import type { BrowserExecutionConfig } from '@taskos/execution-contracts';
export function launchBrowser(config: BrowserExecutionConfig): Promise<Browser> { const launcher = config.engine === 'FIREFOX' ? firefox : config.engine === 'WEBKIT' ? webkit : chromium; return launcher.launch({ headless: config.headless }); }
