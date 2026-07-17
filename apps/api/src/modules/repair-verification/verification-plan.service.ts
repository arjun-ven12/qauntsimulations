import { createHash } from 'node:crypto';
import { canonicalJson } from './request-fingerprint.js';
import {
  repairVerificationPlanPreviewSchema,
  type RepairVerificationPlanPreview,
  type RepairVerificationWorldPurpose,
} from './repair-verification.schema.js';
import type { JsonRecord, RepairVerificationEligibilityContext } from './repair-verification.types.js';

export class RepairVerificationPlanService {
  preview(context: RepairVerificationEligibilityContext): RepairVerificationPlanPreview | null {
    const finding = context.finding;
    const environment = context.targetEnvironment;
    const launch = context.launchSnapshot;
    const minimal = context.minimalWorldConfiguration;
    if (!finding || !environment || !launch || !minimal) return null;

    const worlds: RepairVerificationPlanPreview['worlds'] = [];
    const fingerprints = new Set<string>();
    const add = (
      purpose: RepairVerificationWorldPurpose,
      configuration: JsonRecord,
      reason: string,
      sourceWorldId?: string,
    ) => {
      const fingerprint = configurationFingerprint(configuration);
      if (fingerprints.has(fingerprint) || worlds.length >= 6) return;
      fingerprints.add(fingerprint);
      worlds.push({
        key: `repair-${worlds.length + 1}-${fingerprint.slice(0, 12)}`,
        purpose,
        ...(sourceWorldId ? { sourceWorldId } : {}),
        reason,
        configuration,
      });
    };

    const failingSource = context.worlds.find(({ businessOutcome, executionState }) =>
      businessOutcome === 'FAIL' && executionState === 'COMPLETED');
    add(
      'REPAIR_MINIMAL_REPRODUCTION',
      normalizedConfiguration(minimal),
      'Replays the smallest confirmed original failure against the repaired Environment.',
      failingSource?.id,
    );

    const passingControls = context.worlds
      .filter(({ businessOutcome, executionState }) => businessOutcome === 'PASS' && executionState === 'COMPLETED')
      .sort(comparePassingControls);
    for (const control of passingControls.slice(0, 2)) {
      add(
        'REPAIR_PASSING_CONTROL',
        normalizedConfiguration(control.configuration),
        'Replays a comparable World that passed in the original Investigation.',
        control.id,
      );
    }

    for (const delay of adjacentDelays(context)) {
      add(
        'REPAIR_BOUNDARY_REGRESSION',
        normalizedConfiguration({ ...minimal, paymentDelayMs: delay }),
        `Checks the repaired flow at the bounded adjacent payment delay of ${delay} ms.`,
      );
    }

    if (!worlds.some(({ purpose }) => purpose === 'REPAIR_PASSING_CONTROL')) return null;
    return repairVerificationPlanPreviewSchema.parse({
      version: 1,
      originalInvestigationId: finding.investigationId,
      environmentId: environment.id,
      journey: { id: launch.journey.id, name: launch.journey.name },
      invariants: launch.invariants.map(({ id, type, severity }) => ({ id, type, severity })),
      maximumWorldCount: 6,
      worlds,
    });
  }
}

function comparePassingControls(
  left: RepairVerificationEligibilityContext['worlds'][number],
  right: RepairVerificationEligibilityContext['worlds'][number],
): number {
  const rank = (purpose?: string) => purpose === 'BUG_FLAG_CONTROL' ? 0 : purpose === 'INTERACTION_CONTROL' ? 1 : 2;
  return rank(left.adaptivePurpose) - rank(right.adaptivePurpose) || left.id.localeCompare(right.id);
}

function adjacentDelays(context: RepairVerificationEligibilityContext): number[] {
  const passing = context.boundedRange?.knownPassingDelayMs;
  const failing = context.boundedRange?.knownFailingDelayMs;
  if (passing === undefined || failing === undefined || passing < 0 || failing < 0) return [];
  const low = Math.min(passing, failing);
  const high = Math.max(passing, failing);
  const midpoint = Math.round((low + high) / 2);
  return [...new Set([low, midpoint, high])];
}

function normalizedConfiguration(value: JsonRecord): JsonRecord {
  const { key: _key, name: _name, reason: _reason, creationOrder: _order, ...configuration } = value;
  return configuration;
}

function configurationFingerprint(configuration: JsonRecord): string {
  return createHash('sha256').update(canonicalJson(configuration)).digest('hex');
}
