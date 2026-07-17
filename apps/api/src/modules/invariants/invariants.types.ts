import type { UserRole } from '@taskos/shared-types';
import type { WorkerJob } from '@taskos/execution-contracts';

export const invariantTypes = ['NO_DUPLICATE_PAYMENT', 'NO_DUPLICATE_ORDER'] as const;
export type InvariantType = (typeof invariantTypes)[number];
export const invariantSeverities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type InvariantSeverity = (typeof invariantSeverities)[number];
export type InvariantValidationStatus = 'DRAFT' | 'READY' | 'INVALID';
export type RuntimeInvariantDefinition = WorkerJob['invariants'][number];

export interface DuplicatePaymentConfiguration {
  requestPatterns: string[];
  methods: Array<'POST' | 'PUT' | 'PATCH'>;
}

export interface DuplicateOrderConfiguration extends DuplicatePaymentConfiguration {
  orderIdSelector?: string | undefined;
}

export type InvariantConfiguration =
  | DuplicatePaymentConfiguration
  | DuplicateOrderConfiguration;

export type InvariantAssertion =
  | {
      type: 'NO_DUPLICATE_PAYMENT';
      severity: InvariantSeverity;
      enabled: boolean;
      config: DuplicatePaymentConfiguration;
    }
  | {
      type: 'NO_DUPLICATE_ORDER';
      severity: InvariantSeverity;
      enabled: boolean;
      config: DuplicateOrderConfiguration;
    };

export interface InvariantInput {
  name: string;
  description: string;
  type: InvariantType;
  configuration: InvariantConfiguration;
  severity: InvariantSeverity;
  enabled: boolean;
}

export type UpdateInvariantInput = Partial<InvariantInput>;

export interface InvariantRecord {
  id: string;
  organisationId: string;
  projectId: string;
  name: string;
  description: string;
  assertion: unknown;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface InvariantMembership {
  role: UserRole;
}

export interface InvariantProject {
  id: string;
  organisationId: string;
}

export interface InvariantValidationCheck {
  key: string;
  status: 'PASSED' | 'WARNING' | 'FAILED';
  message: string;
}

export interface InvariantTemplate {
  id: 'no-duplicate-payment' | 'no-duplicate-order';
  displayName: string;
  description: string;
  type: InvariantType;
  suggestedSeverity: InvariantSeverity;
  configuration: InvariantConfiguration;
}
