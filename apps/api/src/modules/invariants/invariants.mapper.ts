import { persistedInvariantAssertionSchema } from './invariants.schema.js';
import type {
  InvariantAssertion,
  InvariantInput,
  InvariantRecord,
  InvariantValidationStatus,
  RuntimeInvariantDefinition,
} from './invariants.types.js';

export function mapInvariantInputToAssertion(input: InvariantInput): InvariantAssertion {
  if (input.type === 'NO_DUPLICATE_PAYMENT')
    return {
      type: input.type,
      severity: input.severity,
      enabled: input.enabled,
      config: input.configuration,
    };
  return {
    type: input.type,
    severity: input.severity,
    enabled: input.enabled,
    config: input.configuration,
  };
}

export function mapInvariant(record: InvariantRecord) {
  const assertion = persistedInvariantAssertionSchema.safeParse(record.assertion);
  return {
    id: record.id,
    projectId: record.projectId,
    name: record.name,
    description: record.description,
    type: assertion.success ? assertion.data.type : null,
    configuration: assertion.success ? assertion.data.config : null,
    severity: assertion.success ? assertion.data.severity : null,
    enabled: assertion.success ? assertion.data.enabled : false,
    validationStatus: (assertion.success ? 'READY' : 'INVALID') satisfies InvariantValidationStatus,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    deletedAt: record.deletedAt?.toISOString() ?? null,
  };
}

export function mapPersistedInvariantToRuntimeDefinition(
  record: InvariantRecord,
): RuntimeInvariantDefinition {
  if (record.deletedAt)
    throw new Error('Archived Invariants cannot be mapped to a runtime definition');
  const assertion = persistedInvariantAssertionSchema.safeParse(record.assertion);
  if (!assertion.success) throw new Error('Invariant assertion is unsupported or invalid');
  if (!assertion.data.enabled)
    throw new Error('Disabled Invariants cannot be mapped to a runtime definition');
  return {
    id: record.id,
    type: assertion.data.type,
    severity: assertion.data.severity,
    config: assertion.data.config,
  };
}
