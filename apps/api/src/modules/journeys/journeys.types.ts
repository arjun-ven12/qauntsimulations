import type { UserRole } from '@taskos/shared-types';

export const journeyActions = [
  'GOTO',
  'CLICK',
  'FILL',
  'WAIT_FOR',
  'ASSERT_VISIBLE',
  'SCREENSHOT',
] as const;
export type JourneyAction = (typeof journeyActions)[number];

export type JourneyState = 'DRAFT' | 'ENABLED';
export type JourneyValidationStatus = 'DRAFT' | 'READY' | 'INVALID';

export type CompletionCondition =
  | { type: 'VISIBLE'; selector: string }
  | { type: 'TEXT'; selector: string; expectedText: string };

export interface JourneyStepMetadata {
  name?: string;
  timeoutMs?: number;
  expectedState?: 'VISIBLE';
  screenshotCheckpoint?: boolean;
  screenshotCheckpointName?: string;
  continueOnFailure?: boolean;
}

export interface JourneyStepInput {
  order: number;
  action: JourneyAction;
  selector: string | null;
  value: string | null;
  metadata: JourneyStepMetadata;
}

export interface JourneyInput {
  name: string;
  description: string | null;
  environmentId: string;
  startPath: string;
  state: JourneyState;
  completionCondition: CompletionCondition;
  steps: JourneyStepInput[];
}

export type CreateJourneyInput = JourneyInput;
export type UpdateJourneyInput = Partial<Omit<JourneyInput, 'steps'>> & {
  steps?: JourneyStepInput[];
};

export interface JourneyPersistenceInput extends JourneyInput {
  validationStatus: JourneyValidationStatus;
}

export interface PersistedJourneyConfiguration {
  version: 1;
  environmentId: string;
  startPath: string;
  state: JourneyState;
  completionCondition: CompletionCondition;
  validationStatus: JourneyValidationStatus;
}

export interface JourneyRecordStep {
  id: string;
  order: number;
  action: string;
  selector: string | null;
  value: string | null;
  metadata: unknown;
}

export interface JourneyRecord {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  steps: JourneyRecordStep[];
}

export interface JourneyMembership {
  role: UserRole;
}

export interface JourneyEnvironment {
  id: string;
  projectId: string;
  baseUrl: string;
  validationStatus: string;
  deletedAt: Date | null;
}

export interface JourneyProject {
  id: string;
  organisationId: string;
  safetyPolicies: Array<{
    domainAllowlist: string[];
    blockedActions: string[];
    configuration: unknown;
  }>;
}

export interface JourneyValidationCheck {
  key: string;
  status: 'PASSED' | 'WARNING' | 'FAILED';
  message: string;
  stepOrder?: number;
}

export interface RuntimeJourneyStepBase {
  name?: string;
  screenshotCheckpoint?: boolean;
  continueOnFailure?: boolean;
}

export type RuntimeJourneyStep =
  | (RuntimeJourneyStepBase & { type: 'goto'; path: string })
  | (RuntimeJourneyStepBase & { type: 'click'; selector: string })
  | (RuntimeJourneyStepBase & { type: 'fill'; selector: string; value: string })
  | (RuntimeJourneyStepBase & { type: 'waitFor'; selector: string; timeoutMs?: number })
  | (RuntimeJourneyStepBase & { type: 'assertVisible'; selector: string });

export interface RuntimeJourney {
  id: string;
  name: string;
  steps: RuntimeJourneyStep[];
  successCondition:
    | { type: 'visible'; selector: string }
    | { type: 'text'; selector: string; expectedText: string };
}
