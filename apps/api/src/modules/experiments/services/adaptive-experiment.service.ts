import type { WorldConfig } from '@taskos/shared-types';
export interface AdaptiveExperimentSelector { select(failureKind: string, failingWorld: WorldConfig): WorldConfig[] }
const withId = (world: WorldConfig, suffix: string, reason: string, changes: Partial<WorldConfig>): WorldConfig => ({ ...world, ...changes, worldId: `${world.worldId}-${suffix}`, reason });
export class RuleBasedAdaptiveExperimentService implements AdaptiveExperimentSelector {
  select(failureKind: string, world: WorldConfig): WorldConfig[] {
    if (failureKind === 'DUPLICATE_SUBMISSION') return [
      withId(world, 'latency-low', 'Probe duplicate submission at lower latency.', { latencyMs: Math.max(0, Math.floor(world.latencyMs / 2)) }),
      withId(world, 'latency-high', 'Probe duplicate submission at higher latency.', { latencyMs: Math.max(100, world.latencyMs * 2) }),
      withId(world, 'control', 'Remove double submission to isolate causality.', { doubleSubmit: false, injectedFaults: world.injectedFaults.filter((fault) => fault.type !== 'DOUBLE_SUBMIT') }),
      withId(world, 'browser', 'Check whether the failure reproduces in another browser.', { browser: world.browser === 'CHROMIUM' ? 'FIREFOX' : 'CHROMIUM' }),
      ...[1, 2, 3].map((repeat) => withId(world, `repeat-${repeat}`, 'Repeat the exact failing world to establish confidence.', {})),
    ];
    if (failureKind === 'NEGATIVE_INVENTORY') return [
      withId(world, 'concurrency-low', 'Reduce concurrency to map the failure boundary.', { concurrency: Math.max(1, world.concurrency - 1) }),
      withId(world, 'concurrency-high', 'Increase concurrency to map the failure boundary.', { concurrency: world.concurrency + 1 }),
      withId(world, 'inventory-low', 'Reduce starting inventory.', { inventoryState: Object.fromEntries(Object.entries(world.inventoryState).map(([key, value]) => [key, Math.max(0, value - 1)])) }),
      withId(world, 'start-offset', 'Vary customer start offset.', { sessionState: { ...world.sessionState, customerStartOffsetMs: 100 } }),
      withId(world, 'repeat', 'Repeat the exact failing inventory world.', {}),
    ];
    return [withId(world, 'repeat', 'Repeat the failing world before broader adaptation.', {})];
  }
}
