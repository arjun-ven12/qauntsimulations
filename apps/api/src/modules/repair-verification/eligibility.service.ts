import {
  repairVerificationEligibilitySummarySchema,
  type RepairVerificationEligibilitySummary,
  type RepairVerificationTargetInput,
} from './repair-verification.schema.js';
import type { RepairVerificationEligibilityContext } from './repair-verification.types.js';
import { RepairVerificationPlanService } from './verification-plan.service.js';

type Issue = RepairVerificationEligibilitySummary['issues'][number];
type Warning = RepairVerificationEligibilitySummary['warnings'][number];

export class RepairVerificationScopeNotFoundError extends Error {
  readonly code = 'REPAIR_VERIFICATION_SCOPE_NOT_FOUND';

  constructor() {
    super('Finding was not found in the active organisation');
    this.name = 'RepairVerificationScopeNotFoundError';
  }
}

export class RepairVerificationEligibilityService {
  constructor(private readonly plans = new RepairVerificationPlanService()) {}

  evaluate(
    context: RepairVerificationEligibilityContext,
    target: RepairVerificationTargetInput,
  ): RepairVerificationEligibilitySummary {
    if (!context.finding) throw new RepairVerificationScopeNotFoundError();
    const finding = context.finding;
    const issues: Issue[] = [];
    const warnings: Warning[] = [];
    const block = (code: string, message: string) => issues.push({ code, message, category: 'BLOCKING' });
    const unknown = (code: string, message: string) => issues.push({ code, message, category: 'DATA_GAP' });

    if (!context.actor) block('INSUFFICIENT_PERMISSION', 'The current user is not a member of the active organisation.');
    else if (!['OWNER', 'ADMIN', 'MEMBER'].includes(context.actor.role)) {
      block('INSUFFICIENT_PERMISSION', 'The current organisation role cannot launch Repair Verification.');
    }
    if (finding.organisationId !== context.organisationId) {
      block('TENANT_SCOPE_MISMATCH', 'Finding organisation scope is inconsistent.');
    }
    if (
      finding.originalInvestigationOrganisationId !== finding.organisationId
      || finding.originalInvestigationProjectId !== finding.projectId
    ) {
      block('ORIGINAL_SCOPE_MISMATCH', 'The original Investigation does not match the Finding organisation and Project.');
    }
    if (finding.originalInvestigationStatus !== 'COMPLETED') {
      block('ORIGINAL_INVESTIGATION_NOT_COMPLETED', 'The original Investigation must be completed.');
    }
    const causallySupported = ['REPRODUCED', 'SUPPORTED'].includes(finding.causalStatus ?? '');
    if (finding.confidence !== 'CONFIRMED' && !causallySupported) {
      block('FINDING_NOT_CONFIRMED', 'The Finding is not confirmed or supported by reproducible evidence.');
    }
    if (context.activeVerificationId) {
      block('REPAIR_VERIFICATION_ACTIVE', 'A Repair Verification is already active for this Finding.');
    }
    if (!context.launchSnapshot) unknown('LAUNCH_SNAPSHOT_REQUIRED', 'The original persisted launch snapshot is missing or invalid.');
    else {
      if (!context.launchSnapshot.journey.steps.length) unknown('JOURNEY_SNAPSHOT_REQUIRED', 'The original Journey snapshot has no executable steps.');
      if (!context.launchSnapshot.invariants.length) unknown('INVARIANT_SNAPSHOT_REQUIRED', 'The original selected Invariant snapshots are missing.');
    }
    if (!context.minimalWorldConfiguration) {
      unknown('MINIMAL_REPRODUCTION_REQUIRED', 'No deterministic minimal reproduction configuration is available.');
    }
    const failingWorlds = context.worlds.filter(({ executionState, businessOutcome }) =>
      executionState === 'COMPLETED' && businessOutcome === 'FAIL');
    if (!failingWorlds.length) unknown('FAILING_WORLD_REQUIRED', 'No conclusive original failing World is available.');
    const passingWorlds = context.worlds.filter(({ executionState, businessOutcome }) =>
      executionState === 'COMPLETED' && businessOutcome === 'PASS');
    if (!passingWorlds.length) {
      unknown('PASSING_CONTROL_REQUIRED', 'A comparable original passing control is required before verification can launch.');
    }

    const environment = context.targetEnvironment;
    if (!environment || environment.id !== target.environmentId) {
      block('REPAIR_TARGET_NOT_FOUND', 'The selected repaired Environment was not found.');
    } else {
      if (environment.organisationId !== context.organisationId || environment.projectId !== finding.projectId) {
        block('REPAIR_TARGET_PROJECT_MISMATCH', 'The repaired Environment must belong to the Finding Project and active organisation.');
      }
      if (environment.deletedAt) block('REPAIR_TARGET_ARCHIVED', 'The repaired Environment is archived.');
      if (environment.validationStatus !== 'READY') block('REPAIR_TARGET_NOT_READY', 'The repaired Environment must be READY.');
      validateTargetSafety(environment, context, block, warnings);
      validateJourneyCompatibility(environment, context, block);
    }

    let planPreview = null;
    if (!issues.length) {
      planPreview = this.plans.preview(context);
      if (!planPreview) unknown('VERIFICATION_PLAN_UNAVAILABLE', 'A deterministic bounded verification plan could not be constructed.');
    }
    const status = issues.some(({ category }) => category === 'BLOCKING')
      ? 'INELIGIBLE'
      : issues.length ? 'UNKNOWN' : 'ELIGIBLE';
    return repairVerificationEligibilitySummarySchema.parse({
      findingId: finding.id,
      status,
      issues,
      warnings,
      original: {
        investigationId: finding.investigationId,
        businessOutcome: failingWorlds.length ? 'FAIL' : 'INCONCLUSIVE',
        journey: context.launchSnapshot
          ? { id: context.launchSnapshot.journey.id, name: context.launchSnapshot.journey.name }
          : null,
        invariants: context.launchSnapshot?.invariants.map(({ id, type, severity }) => ({ id, type, severity })) ?? [],
      },
      target: environment ? {
        environmentId: environment.id,
        environmentName: environment.name,
        environmentType: environment.type,
      } : null,
      planPreview,
    });
  }
}

function validateTargetSafety(
  environment: NonNullable<RepairVerificationEligibilityContext['targetEnvironment']>,
  context: RepairVerificationEligibilityContext,
  block: (code: string, message: string) => void,
  warnings: Warning[],
) {
  const policy = context.safetyPolicy;
  if (!policy) {
    block('PROJECT_SAFETY_REQUIRED', 'Project Safety must be configured before Repair Verification.');
    return;
  }
  const safety = policy.configuration;
  if (environment.type === 'PRODUCTION') {
    block('PRODUCTION_TARGET_BLOCKED', 'Repair Verification v1 is restricted to non-production Environments.');
  }
  const allowlist = new Set(policy.domainAllowlist.map((host) => host.toLowerCase()));
  const candidates = [environment.baseUrl, environment.apiBaseUrl, endpoint(environment.configuration, 'reset')]
    .filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    let url: URL;
    try {
      url = new URL(candidate, environment.baseUrl);
    } catch {
      block('REPAIR_TARGET_URL_INVALID', 'The repaired Environment contains an invalid URL.');
      continue;
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      block('REPAIR_TARGET_URL_INVALID', 'Repaired Environment URLs must use HTTP(S) without embedded credentials.');
    }
    if (!allowlist.has(url.hostname.toLowerCase())) {
      block('REPAIR_TARGET_SAFETY_BLOCKED', `Environment host ${url.hostname.toLowerCase()} is not allowed by Project Safety.`);
    }
  }
  const baseHost = safeHost(environment.baseUrl);
  if (baseHost && isLocalHost(baseHost)) {
    if (!['DEVELOPMENT', 'DEMO'].includes(environment.type)) {
      block('PRIVATE_TARGET_TYPE_BLOCKED', 'Local/private targets require an explicitly local or demo Environment type.');
    }
    warnings.push({
      code: 'REMOTE_WORKER_REACHABILITY',
      message: 'Remote workers may not be able to reach a localhost/private repaired Environment.',
    });
  }
  const allowedActions = stringArray(environment.configuration.allowedActions);
  const payment = object(environment.configuration.payment);
  if (allowedActions.includes('PERFORM_CHECKOUT') && safety.permitCheckoutSubmission !== true) {
    block('REPAIR_TARGET_SAFETY_BLOCKED', 'Project Safety does not permit checkout submission.');
  }
  if ((allowedActions.includes('SUBMIT_MOCK_PAYMENT') || payment?.mode === 'MOCK') && safety.permitMockPayment !== true) {
    block('REPAIR_TARGET_SAFETY_BLOCKED', 'Project Safety does not permit mock payment submission.');
  }
  const permitOrder = safety.permitTestOrderCreation ?? safety.permitOrderCreation;
  if (allowedActions.includes('CREATE_TEST_ORDER') && permitOrder !== true) {
    block('REPAIR_TARGET_SAFETY_BLOCKED', 'Project Safety does not permit test order creation.');
  }
  const reset = object(environment.configuration.reset);
  if (typeof reset?.method === 'string') {
    const methods = stringArray(safety.allowedHttpMethods);
    if (!methods.includes(reset.method.toUpperCase())) {
      block('REPAIR_TARGET_SAFETY_BLOCKED', `Project Safety does not permit ${reset.method.toUpperCase()} reset requests.`);
    }
  }
}

function validateJourneyCompatibility(
  environment: NonNullable<RepairVerificationEligibilityContext['targetEnvironment']>,
  context: RepairVerificationEligibilityContext,
  block: (code: string, message: string) => void,
) {
  const launch = context.launchSnapshot;
  const policy = context.safetyPolicy;
  if (!launch || !policy) return;
  const allowlist = new Set(policy.domainAllowlist.map((host) => host.toLowerCase()));
  for (const rawStep of launch.journey.steps) {
    const step = object(rawStep);
    if (!step) continue;
    const type = typeof step.type === 'string' ? step.type.toLowerCase() : '';
    const target = typeof step.path === 'string' ? step.path : typeof step.value === 'string' ? step.value : null;
    if (!['goto', 'navigate'].includes(type) || !target) continue;
    try {
      const url = new URL(target, environment.baseUrl);
      if (!allowlist.has(url.hostname.toLowerCase())) {
        block('JOURNEY_TARGET_INCOMPATIBLE', `Journey navigation host ${url.hostname.toLowerCase()} is not allowed for the repaired Environment.`);
      }
    } catch {
      block('JOURNEY_TARGET_INCOMPATIBLE', 'The persisted Journey contains an invalid navigation target.');
    }
  }
}

function endpoint(configuration: Record<string, unknown>, key: string): string | undefined {
  const value = object(configuration[key])?.endpoint;
  return typeof value === 'string' ? value : undefined;
}
function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
function safeHost(value: string): string | null {
  try { return new URL(value).hostname.toLowerCase(); } catch { return null; }
}
function isLocalHost(host: string): boolean {
  return host === 'localhost' || host === '::1' || host === '127.0.0.1'
    || host.startsWith('10.') || host.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
}
