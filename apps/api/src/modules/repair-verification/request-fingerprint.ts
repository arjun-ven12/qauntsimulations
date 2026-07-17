import { createHash } from 'node:crypto';
import type { RepairVerificationTargetInput } from './repair-verification.schema.js';

export function repairVerificationRequestFingerprint(input: {
  organisationId: string;
  findingId: string;
  target: RepairVerificationTargetInput;
}): string {
  return createHash('sha256').update(canonicalJson({
    version: 1,
    organisationId: input.organisationId,
    findingId: input.findingId,
    target: {
      environmentId: input.target.environmentId,
      deploymentVersion: input.target.deploymentVersion ?? null,
      notes: input.target.notes ?? null,
      acknowledgement: input.target.acknowledgement,
    },
  })).digest('hex');
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
