import { describe, expect, it } from 'vitest';
import { RepairVerificationEligibilityService, RepairVerificationScopeNotFoundError } from '../eligibility.service.js';
import type { RepairVerificationEligibilityContext } from '../repair-verification.types.js';
import { RepairVerificationPlanService } from '../verification-plan.service.js';

const target = { environmentId: 'environment-repaired', deploymentVersion: 'v2', acknowledgement: true as const };

describe('Repair Verification eligibility', () => {
  it('returns an eligible, deterministic bounded plan for consistent evidence and target scope', () => {
    const context = eligibleContext();
    const result = new RepairVerificationEligibilityService().evaluate(context, target);
    expect(result.status).toBe('ELIGIBLE');
    expect(result.issues).toEqual([]);
    expect(result.warnings.map(({ code }) => code)).toContain('REMOTE_WORKER_REACHABILITY');
    expect(result.planPreview?.worlds.map(({ purpose }) => purpose)).toEqual([
      'REPAIR_MINIMAL_REPRODUCTION',
      'REPAIR_PASSING_CONTROL',
      'REPAIR_PASSING_CONTROL',
      'REPAIR_BOUNDARY_REGRESSION',
      'REPAIR_BOUNDARY_REGRESSION',
      'REPAIR_BOUNDARY_REGRESSION',
    ]);
    expect(result.planPreview?.worlds).toHaveLength(6);
    expect(new RepairVerificationPlanService().preview(context)).toEqual(result.planPreview);
  });

  it('requires a comparable passing control without permanently declaring the Finding ineligible', () => {
    const context = eligibleContext();
    context.worlds = context.worlds.filter(({ businessOutcome }) => businessOutcome !== 'PASS');
    const result = new RepairVerificationEligibilityService().evaluate(context, target);
    expect(result.status).toBe('UNKNOWN');
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'PASSING_CONTROL_REQUIRED', category: 'DATA_GAP' }));
    expect(result.planPreview).toBeNull();
  });

  it.each([
    ['VIEWER role', (context: RepairVerificationEligibilityContext) => { context.actor = { userId: 'user', role: 'VIEWER' }; }, 'INSUFFICIENT_PERMISSION'],
    ['wrong Project', (context: RepairVerificationEligibilityContext) => { context.targetEnvironment!.projectId = 'other'; }, 'REPAIR_TARGET_PROJECT_MISMATCH'],
    ['wrong tenant', (context: RepairVerificationEligibilityContext) => { context.targetEnvironment!.organisationId = 'other'; }, 'REPAIR_TARGET_PROJECT_MISMATCH'],
    ['original scope mismatch', (context: RepairVerificationEligibilityContext) => { context.finding!.originalInvestigationProjectId = 'other'; }, 'ORIGINAL_SCOPE_MISMATCH'],
    ['unready target', (context: RepairVerificationEligibilityContext) => { context.targetEnvironment!.validationStatus = 'INCOMPLETE'; }, 'REPAIR_TARGET_NOT_READY'],
    ['archived target', (context: RepairVerificationEligibilityContext) => { context.targetEnvironment!.deletedAt = new Date(); }, 'REPAIR_TARGET_ARCHIVED'],
    ['unsafe host', (context: RepairVerificationEligibilityContext) => { context.targetEnvironment!.baseUrl = 'https://blocked.example'; }, 'REPAIR_TARGET_SAFETY_BLOCKED'],
    ['active verification', (context: RepairVerificationEligibilityContext) => { context.activeVerificationId = 'active'; }, 'REPAIR_VERIFICATION_ACTIVE'],
    ['incompatible Journey host', (context: RepairVerificationEligibilityContext) => { context.launchSnapshot!.journey.steps = [{ type: 'goto', path: 'https://blocked.example/checkout' }]; }, 'JOURNEY_TARGET_INCOMPATIBLE'],
  ])('blocks %s', (_name, mutate, code) => {
    const context = eligibleContext(); mutate(context);
    const result = new RepairVerificationEligibilityService().evaluate(context, target);
    expect(result.status).toBe('INELIGIBLE');
    expect(result.issues.map((issue) => issue.code)).toContain(code);
  });

  it('uses a tenant-neutral not-found error when the Finding is outside repository scope', () => {
    const context = eligibleContext(); context.finding = null;
    expect(() => new RepairVerificationEligibilityService().evaluate(context, target))
      .toThrow(RepairVerificationScopeNotFoundError);
  });

  it('deduplicates identical World configurations', () => {
    const context = eligibleContext();
    context.worlds[2]!.configuration = context.worlds[1]!.configuration;
    const plan = new RepairVerificationPlanService().preview(context);
    expect(plan?.worlds.filter(({ purpose }) => purpose === 'REPAIR_PASSING_CONTROL')).toHaveLength(1);
    const fingerprints = plan?.worlds.map(({ configuration }) => JSON.stringify(configuration));
    expect(new Set(fingerprints).size).toBe(fingerprints?.length);
  });
});

function eligibleContext(): RepairVerificationEligibilityContext {
  return {
    organisationId: 'organisation', actor: { userId: 'user', role: 'OWNER' },
    finding: {
      id: 'finding', organisationId: 'organisation', projectId: 'project',
      investigationId: 'investigation-original', confidence: 'CONFIRMED',
      originalInvestigationOrganisationId: 'organisation', originalInvestigationProjectId: 'project',
      causalStatus: 'SUPPORTED', originalInvestigationStatus: 'COMPLETED',
    },
    targetEnvironment: {
      id: 'environment-repaired', projectId: 'project', organisationId: 'organisation',
      name: 'Repaired local demo', type: 'DEMO', baseUrl: 'http://localhost:5174',
      validationStatus: 'READY', deletedAt: null,
      configuration: {
        payment: { mode: 'MOCK' },
        reset: { endpoint: '/api/test/reset', method: 'POST' },
        allowedActions: ['PERFORM_CHECKOUT', 'SUBMIT_MOCK_PAYMENT', 'CREATE_TEST_ORDER'],
      },
    },
    safetyPolicy: {
      domainAllowlist: ['localhost'],
      configuration: {
        productionAccess: false, allowedHttpMethods: ['GET', 'POST'],
        permitCheckoutSubmission: true, permitMockPayment: true, permitOrderCreation: true,
      },
    },
    launchSnapshot: {
      journey: { id: 'journey', name: 'Checkout', steps: [{ type: 'goto', path: '/' }], successCondition: { type: 'visible', selector: '#done' } },
      invariants: [
        { id: 'payment', type: 'NO_DUPLICATE_PAYMENT', severity: 'CRITICAL', config: {} },
        { id: 'order', type: 'NO_DUPLICATE_ORDER', severity: 'HIGH', config: {} },
      ],
      environment: { id: 'environment-original', name: 'Original', type: 'DEMO', baseUrl: 'http://localhost:5174' },
      safety: { domainAllowlist: ['localhost'], allowedHttpMethods: ['GET', 'POST'], permitCheckoutSubmission: true, permitMockPayment: true, permitTestOrderCreation: true },
    },
    minimalWorldConfiguration: { paymentDelayMs: 1_200, doubleSubmit: true, duplicateSubmissionBug: true },
    boundedRange: { knownPassingDelayMs: 800, knownFailingDelayMs: 1_100 },
    worlds: [
      { id: 'failing', configuration: { paymentDelayMs: 1_200, doubleSubmit: true }, executionState: 'COMPLETED', businessOutcome: 'FAIL' },
      { id: 'control-bug', configuration: { paymentDelayMs: 1_200, doubleSubmit: true, duplicateSubmissionBug: false }, origin: 'ADAPTIVE_REPRODUCTION', adaptivePurpose: 'BUG_FLAG_CONTROL', executionState: 'COMPLETED', businessOutcome: 'PASS' },
      { id: 'control-interaction', configuration: { paymentDelayMs: 1_200, doubleSubmit: false, duplicateSubmissionBug: true }, origin: 'ADAPTIVE_REPRODUCTION', adaptivePurpose: 'INTERACTION_CONTROL', executionState: 'COMPLETED', businessOutcome: 'PASS' },
      { id: 'control-other', configuration: { paymentDelayMs: 0, doubleSubmit: false }, executionState: 'COMPLETED', businessOutcome: 'PASS' },
    ],
    activeVerificationId: null,
  };
}
