// Dashboard boundary facade: keeps the feature independent from runtime UI internals
// while consuming the same authoritative semantic mapping contract.
export {
  findingSeverityStatus,
  findingStateStatus,
  investigationExecutionStatus,
  investigationPhaseStatus,
  projectReadinessStatus,
  type SemanticTone,
} from '../runtime/semantic-status.js';
