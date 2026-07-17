import { PrismaClient, type Prisma } from '@prisma/client';
import { loadEnvFile } from 'node:process';
import {
  demoCheckoutJourneyFixture,
  demoCheckoutJourneySteps,
  demoEnvironmentFixture,
  demoInvariantFixtures,
  demoProductFixtureIds,
  demoProjectFixture,
  demoProjectSafetyFixture,
  demoScenarioFixture,
} from './demo-fixtures.js';

if (!process.env.DATABASE_URL || !process.env.DIRECT_URL) {
  loadEnvFile(new URL('../../../.env', import.meta.url));
}

const database = new PrismaClient();

async function seed(): Promise<void> {
  await database.$transaction(async (transaction) => {
    await assertNoDemoFixtureCollisions(transaction);

    const ids = demoProductFixtureIds;
    await transaction.organisation.upsert({
      where: { id: ids.organisation },
      update: { name: 'TaskOS Demo', slug: 'taskos-demo', deletedAt: null },
      create: { id: ids.organisation, name: 'TaskOS Demo', slug: 'taskos-demo' },
    });

    await transaction.project.upsert({
      where: { id: ids.project },
      update: {
        organisationId: ids.organisation,
        ...demoProjectFixture,
        deletedAt: null,
      },
      create: {
        id: ids.project,
        organisationId: ids.organisation,
        ...demoProjectFixture,
      },
    });

    await transaction.safetyPolicy.upsert({
      where: { id: ids.safetyPolicy },
      update: {
        organisationId: ids.organisation,
        projectId: ids.project,
        name: demoProjectSafetyFixture.name,
        domainAllowlist: [...demoProjectSafetyFixture.domainAllowlist],
        blockedActions: [...demoProjectSafetyFixture.blockedActions],
        configuration: demoProjectSafetyFixture.configuration as Prisma.InputJsonValue,
      },
      create: {
        id: ids.safetyPolicy,
        organisationId: ids.organisation,
        projectId: ids.project,
        name: demoProjectSafetyFixture.name,
        domainAllowlist: [...demoProjectSafetyFixture.domainAllowlist],
        blockedActions: [...demoProjectSafetyFixture.blockedActions],
        configuration: demoProjectSafetyFixture.configuration as Prisma.InputJsonValue,
      },
    });

    await transaction.environment.updateMany({
      where: { projectId: ids.project, id: { not: ids.environment }, isDefault: true },
      data: { isDefault: false },
    });
    await transaction.environment.upsert({
      where: { id: ids.environment },
      update: {
        projectId: ids.project,
        name: demoEnvironmentFixture.name,
        description: demoEnvironmentFixture.description,
        type: demoEnvironmentFixture.type,
        baseUrl: demoEnvironmentFixture.baseUrl,
        apiBaseUrl: demoEnvironmentFixture.apiBaseUrl,
        healthCheckUrl: demoEnvironmentFixture.healthCheckUrl,
        isDefault: demoEnvironmentFixture.isDefault,
        validationStatus: demoEnvironmentFixture.validationStatus,
        lastValidatedAt: demoEnvironmentFixture.lastValidatedAt,
        configuration: demoEnvironmentFixture.configuration as Prisma.InputJsonValue,
        manifest: demoEnvironmentFixture.manifest,
        deletedAt: null,
      },
      create: {
        id: ids.environment,
        projectId: ids.project,
        name: demoEnvironmentFixture.name,
        description: demoEnvironmentFixture.description,
        type: demoEnvironmentFixture.type,
        baseUrl: demoEnvironmentFixture.baseUrl,
        apiBaseUrl: demoEnvironmentFixture.apiBaseUrl,
        healthCheckUrl: demoEnvironmentFixture.healthCheckUrl,
        isDefault: demoEnvironmentFixture.isDefault,
        validationStatus: demoEnvironmentFixture.validationStatus,
        lastValidatedAt: demoEnvironmentFixture.lastValidatedAt,
        configuration: demoEnvironmentFixture.configuration as Prisma.InputJsonValue,
        manifest: demoEnvironmentFixture.manifest,
      },
    });

    await transaction.journey.upsert({
      where: { id: ids.journey },
      update: {
        projectId: ids.project,
        name: demoCheckoutJourneyFixture.name,
        description: demoCheckoutJourneyFixture.description,
        deletedAt: null,
      },
      create: {
        id: ids.journey,
        projectId: ids.project,
        name: demoCheckoutJourneyFixture.name,
        description: demoCheckoutJourneyFixture.description,
      },
    });
    await transaction.journeyStep.deleteMany({ where: { journeyId: ids.journey } });
    await transaction.journeyStep.createMany({
      data: demoCheckoutJourneySteps.map((step) => ({
        ...step,
        journeyId: ids.journey,
        metadata: step.metadata as Prisma.InputJsonValue,
      })),
    });

    await transaction.scenario.upsert({
      where: { id: ids.scenario },
      update: {
        projectId: ids.project,
        ...demoScenarioFixture,
        controls: demoScenarioFixture.controls as Prisma.InputJsonValue,
        deletedAt: null,
      },
      create: {
        id: ids.scenario,
        projectId: ids.project,
        ...demoScenarioFixture,
        controls: demoScenarioFixture.controls as Prisma.InputJsonValue,
      },
    });

    for (const invariant of demoInvariantFixtures) {
      await transaction.invariant.upsert({
        where: { id: invariant.id },
        update: {
          organisationId: ids.organisation,
          projectId: ids.project,
          name: invariant.name,
          description: invariant.description,
          assertion: invariant.assertion as unknown as Prisma.InputJsonValue,
          deletedAt: null,
        },
        create: {
          id: invariant.id,
          organisationId: ids.organisation,
          projectId: ids.project,
          name: invariant.name,
          description: invariant.description,
          assertion: invariant.assertion as unknown as Prisma.InputJsonValue,
        },
      });
    }

    const launch = canonicalLaunchSnapshot();
    const { seededWorlds, ...plan } = canonicalFailurePlan(launch);
    await transaction.investigation.upsert({
      where: { id: ids.investigation },
      update: { organisationId: ids.organisation, projectId: ids.project, environmentId: ids.environment, journeyId: ids.journey, scenarioId: ids.scenario, safetyPolicyId: ids.safetyPolicy, name: 'Canonical duplicate checkout investigation', status: 'COMPLETED', completedAt: new Date('2026-07-17T00:00:00.000Z') },
      create: { id: ids.investigation, organisationId: ids.organisation, projectId: ids.project, environmentId: ids.environment, journeyId: ids.journey, scenarioId: ids.scenario, safetyPolicyId: ids.safetyPolicy, name: 'Canonical duplicate checkout investigation', status: 'COMPLETED', startedAt: new Date('2026-07-17T00:00:00.000Z'), completedAt: new Date('2026-07-17T00:00:00.000Z') },
    });
    await transaction.experimentPlan.upsert({
      where: { investigationId_version: { investigationId: ids.investigation, version: 1 } },
      update: { id: ids.experimentPlan, journeyId: ids.journey, scenarioId: ids.scenario, provider: 'MOCK', plan: plan as Prisma.InputJsonValue, planningExplanation: 'Canonical persisted checkout failure and control plan.', estimatedComputeUnits: 2 },
      create: { id: ids.experimentPlan, investigationId: ids.investigation, journeyId: ids.journey, scenarioId: ids.scenario, version: 1, provider: 'MOCK', plan: plan as Prisma.InputJsonValue, planningExplanation: 'Canonical persisted checkout failure and control plan.', estimatedComputeUnits: 2 },
    });
    await transaction.invariantEvaluation.deleteMany({ where: { experimentId: { in: [ids.failingExperiment, ids.passingExperiment] } } });
    await transaction.executionAttempt.deleteMany({ where: { id: { in: [ids.failingAttempt, ids.passingAttempt] } } });
    await transaction.experiment.deleteMany({ where: { id: { in: [ids.failingExperiment, ids.passingExperiment] } } });
    await transaction.world.deleteMany({ where: { id: { in: [ids.failingWorld, ids.passingWorld] } } });
    for (const world of seededWorlds) {
      const failing = world.id === ids.failingWorld;
      await transaction.world.create({ data: { id: world.id, investigationId: ids.investigation, experimentPlanId: ids.experimentPlan, status: 'COMPLETED', configuration: world.configuration as Prisma.InputJsonValue, reason: world.reason, randomSeed: world.randomSeed } });
      await transaction.experiment.create({ data: { id: world.experimentId, investigationId: ids.investigation, worldId: world.id, status: 'PASSED', kind: 'INITIAL' } });
      await transaction.executionAttempt.create({ data: { id: world.attemptId, experimentId: world.experimentId, attempt: 1, status: 'PASSED', provider: 'LOCAL', completedAt: new Date('2026-07-17T00:01:00.000Z'), result: { status: failing ? 'INVARIANT_VIOLATION' : 'PASSED' } } });
      await transaction.invariantEvaluation.createMany({ data: demoInvariantFixtures.map((invariant) => ({ experimentId: world.experimentId, invariantId: invariant.id, executionAttemptId: world.attemptId, passed: !failing, expected: { type: invariant.assertion.type }, observed: { outcome: failing ? 'duplicate detected' : 'single checkout' }, confidence: 1, evidenceReferences: [] })) });
    }
    await transaction.finding.upsert({
      where: { id: ids.finding },
      update: { organisationId: ids.organisation, projectId: ids.project, investigationId: ids.investigation, title: 'Duplicate checkout submission', summary: 'Delayed payment and repeated interaction created duplicate checkout effects.', severity: 'CRITICAL', confidence: 'CONFIRMED', reproductionCount: 1, causalConditions: { causalStatus: 'SUPPORTED', worldId: ids.failingWorld, experimentId: ids.failingExperiment, failedInvariantIds: demoInvariantFixtures.map((invariant) => invariant.id) }, deletedAt: null },
      create: { id: ids.finding, fingerprint: 'canonical-demo-duplicate-checkout', organisationId: ids.organisation, projectId: ids.project, investigationId: ids.investigation, title: 'Duplicate checkout submission', summary: 'Delayed payment and repeated interaction created duplicate checkout effects.', severity: 'CRITICAL', confidence: 'CONFIRMED', reproductionCount: 1, causalConditions: { causalStatus: 'SUPPORTED', worldId: ids.failingWorld, experimentId: ids.failingExperiment, failedInvariantIds: demoInvariantFixtures.map((invariant) => invariant.id) } },
    });
    await transaction.minimalReproduction.upsert({ where: { findingId: ids.finding }, update: { journeySteps: demoCheckoutJourneyFixture.steps as Prisma.InputJsonValue, worldConfiguration: seededWorlds[0]!.configuration as Prisma.InputJsonValue }, create: { findingId: ids.finding, journeySteps: demoCheckoutJourneyFixture.steps as Prisma.InputJsonValue, worldConfiguration: seededWorlds[0]!.configuration as Prisma.InputJsonValue } });

    await transaction.worldPack.upsert({
      where: { identifier: 'commerce' },
      update: {},
      create: {
        identifier: 'commerce',
        name: 'Commerce',
        description: 'Checkout, payment, inventory, network, and concurrency experiments.',
        versions: {
          create: {
            version: '0.1.0',
            manifest: { supportedJourneys: ['checkout'] },
            active: true,
          },
        },
      },
    });
  });
}

function canonicalLaunchSnapshot() {
  return {
    inputSource: 'PERSISTED_CONFIGURATION', actorUserId: 'demo-seed', launchedAt: '2026-07-17T00:00:00.000Z',
    scenario: { prompt: demoScenarioFixture.prompt, controls: { browsers: ['chromium'], viewports: ['desktop-1440x900'], networkProfiles: ['normal', 'delayed-payment'], maximumWorlds: 2, maximumConcurrentWorkers: 1 } },
    environment: { id: demoProductFixtureIds.environment, name: demoEnvironmentFixture.name, type: demoEnvironmentFixture.type, baseUrl: demoEnvironmentFixture.baseUrl, apiBaseUrl: demoEnvironmentFixture.apiBaseUrl, reset: { mode: demoEnvironmentFixture.configuration.reset.mode, endpoint: demoEnvironmentFixture.configuration.reset.endpoint ?? undefined, method: demoEnvironmentFixture.configuration.reset.method, beforeEachWorld: true, expectedStatus: 200 }, payment: { mode: 'MOCK', delayMs: 0, result: 'SUCCESS' }, testData: demoEnvironmentFixture.configuration.testData, allowedActions: demoEnvironmentFixture.configuration.allowedActions },
    journey: { id: demoProductFixtureIds.journey, name: demoCheckoutJourneyFixture.name, steps: demoCheckoutJourneyFixture.steps, successCondition: demoCheckoutJourneyFixture.successCondition },
    invariants: demoInvariantFixtures.map((invariant) => ({ id: invariant.id, type: invariant.assertion.type, severity: invariant.assertion.severity, config: invariant.assertion.config })),
    safety: { policyId: demoProductFixtureIds.safetyPolicy, domainAllowlist: demoProjectSafetyFixture.domainAllowlist, allowedHttpMethods: demoProjectSafetyFixture.configuration.allowedHttpMethods, permitCheckoutSubmission: true, permitMockPayment: true, permitTestOrderCreation: true, prohibitedActions: demoProjectSafetyFixture.blockedActions }, validation: { status: 'READY', warnings: [] },
  };
}

function canonicalFailurePlan(launch: ReturnType<typeof canonicalLaunchSnapshot>) {
  const configuration = (id: string, duplicateSubmissionBug: boolean, doubleSubmit: boolean, paymentDelayMs: number) => ({ id, configuration: { key: id, name: duplicateSubmissionBug ? 'Canonical duplicate checkout failure' : 'Canonical passing checkout control', browser: 'chromium', viewport: 'desktop-1440x900', networkProfile: paymentDelayMs ? 'delayed-payment' : 'normal', userProfile: duplicateSubmissionBug ? 'impatient' : 'normal', paymentDelayMs, duplicateSubmissionBug, doubleSubmit, doubleSubmitIntervalMs: 100, expectedOutcome: duplicateSubmissionBug ? 'INVARIANT_VIOLATION' : 'PASS', reason: duplicateSubmissionBug ? 'Conclusive duplicate checkout reproduction.' : 'Conclusive passing checkout control.', randomSeed: duplicateSubmissionBug ? 41001 : 41002, creationOrder: duplicateSubmissionBug ? 0 : 1, origin: 'INITIAL' }, reason: duplicateSubmissionBug ? 'Conclusive duplicate checkout reproduction.' : 'Conclusive passing checkout control.', randomSeed: duplicateSubmissionBug ? 41001 : 41002, experimentId: duplicateSubmissionBug ? demoProductFixtureIds.failingExperiment : demoProductFixtureIds.passingExperiment, attemptId: duplicateSubmissionBug ? demoProductFixtureIds.failingAttempt : demoProductFixtureIds.passingAttempt });
  const worlds = [configuration(demoProductFixtureIds.failingWorld, true, true, 1200), configuration(demoProductFixtureIds.passingWorld, false, false, 0)];
  return { objective: demoScenarioFixture.prompt, journeyId: demoProductFixtureIds.journey, scenarioId: demoProductFixtureIds.scenario, selectedVariables: ['payment delay', 'duplicate-submission mode'], selectedControls: launch.scenario.controls, invariantIds: demoInvariantFixtures.map((invariant) => invariant.id), executionProvider: 'LOCAL_PLAYWRIGHT', maximumConcurrentWorkers: 1, worlds: worlds.map(({ id: _id, experimentId: _experimentId, attemptId: _attemptId, ...world }) => world.configuration), planningExplanation: 'Canonical deterministic checkout failure and control plan.', launch, seededWorlds: worlds };
}

async function assertNoDemoFixtureCollisions(transaction: Prisma.TransactionClient) {
  const ids = demoProductFixtureIds;
  const [
    slugOwner,
    projectNameOwner,
    environmentNameOwner,
    journeyNameOwner,
    scenarioNameOwner,
    paymentNameOwner,
    orderNameOwner,
    organisationById,
    projectById,
    environmentById,
    journeyById,
    scenarioById,
    paymentById,
    orderById,
    safetyById,
    projectSafetyPolicies,
  ] = await Promise.all([
    transaction.organisation.findUnique({ where: { slug: 'taskos-demo' }, select: { id: true } }),
    transaction.project.findUnique({
      where: {
        organisationId_name: {
          organisationId: ids.organisation,
          name: demoProjectFixture.name,
        },
      },
      select: { id: true },
    }),
    transaction.environment.findUnique({
      where: {
        projectId_name: { projectId: ids.project, name: demoEnvironmentFixture.name },
      },
      select: { id: true },
    }),
    transaction.journey.findUnique({
      where: {
        projectId_name: { projectId: ids.project, name: demoCheckoutJourneyFixture.name },
      },
      select: { id: true },
    }),
    transaction.scenario.findUnique({
      where: { projectId_name: { projectId: ids.project, name: demoScenarioFixture.name } },
      select: { id: true },
    }),
    transaction.invariant.findUnique({
      where: {
        projectId_name: { projectId: ids.project, name: demoInvariantFixtures[0].name },
      },
      select: { id: true },
    }),
    transaction.invariant.findUnique({
      where: {
        projectId_name: { projectId: ids.project, name: demoInvariantFixtures[1].name },
      },
      select: { id: true },
    }),
    transaction.organisation.findUnique({ where: { id: ids.organisation }, select: { id: true } }),
    transaction.project.findUnique({
      where: { id: ids.project },
      select: { id: true, organisationId: true },
    }),
    transaction.environment.findUnique({
      where: { id: ids.environment },
      select: { id: true, projectId: true },
    }),
    transaction.journey.findUnique({
      where: { id: ids.journey },
      select: { id: true, projectId: true },
    }),
    transaction.scenario.findUnique({
      where: { id: ids.scenario },
      select: { id: true, projectId: true },
    }),
    transaction.invariant.findUnique({
      where: { id: ids.invariant },
      select: { id: true, organisationId: true, projectId: true },
    }),
    transaction.invariant.findUnique({
      where: { id: ids.orderInvariant },
      select: { id: true, organisationId: true, projectId: true },
    }),
    transaction.safetyPolicy.findUnique({
      where: { id: ids.safetyPolicy },
      select: { id: true, organisationId: true, projectId: true },
    }),
    transaction.safetyPolicy.findMany({
      where: { projectId: ids.project },
      select: { id: true },
    }),
  ]);

  assertNaturalKey('Organisation', 'slug=taskos-demo', ids.organisation, slugOwner?.id);
  assertNaturalKey(
    'Project',
    `organisationId=${ids.organisation}, name=${demoProjectFixture.name}`,
    ids.project,
    projectNameOwner?.id,
  );
  assertNaturalKey(
    'Environment',
    `projectId=${ids.project}, name=${demoEnvironmentFixture.name}`,
    ids.environment,
    environmentNameOwner?.id,
  );
  assertNaturalKey(
    'Journey',
    `projectId=${ids.project}, name=${demoCheckoutJourneyFixture.name}`,
    ids.journey,
    journeyNameOwner?.id,
  );
  assertNaturalKey(
    'Scenario',
    `projectId=${ids.project}, name=${demoScenarioFixture.name}`,
    ids.scenario,
    scenarioNameOwner?.id,
  );
  assertNaturalKey(
    'Invariant',
    `projectId=${ids.project}, name=${demoInvariantFixtures[0].name}`,
    ids.invariant,
    paymentNameOwner?.id,
  );
  assertNaturalKey(
    'Invariant',
    `projectId=${ids.project}, name=${demoInvariantFixtures[1].name}`,
    ids.orderInvariant,
    orderNameOwner?.id,
  );

  assertOwner('Organisation', organisationById?.id, ids.organisation, {});
  assertOwner('Project', projectById?.id, ids.project, {
    organisationId: [ids.organisation, projectById?.organisationId],
  });
  assertOwner('Environment', environmentById?.id, ids.environment, {
    projectId: [ids.project, environmentById?.projectId],
  });
  assertOwner('Journey', journeyById?.id, ids.journey, {
    projectId: [ids.project, journeyById?.projectId],
  });
  assertOwner('Scenario', scenarioById?.id, ids.scenario, {
    projectId: [ids.project, scenarioById?.projectId],
  });
  assertOwner('Invariant', paymentById?.id, ids.invariant, {
    organisationId: [ids.organisation, paymentById?.organisationId],
    projectId: [ids.project, paymentById?.projectId],
  });
  assertOwner('Invariant', orderById?.id, ids.orderInvariant, {
    organisationId: [ids.organisation, orderById?.organisationId],
    projectId: [ids.project, orderById?.projectId],
  });
  assertOwner('SafetyPolicy', safetyById?.id, ids.safetyPolicy, {
    organisationId: [ids.organisation, safetyById?.organisationId],
    projectId: [ids.project, safetyById?.projectId],
  });

  const conflictingSafety = projectSafetyPolicies.find((policy) => policy.id !== ids.safetyPolicy);
  if (conflictingSafety) {
    throw collisionError(
      'SafetyPolicy',
      `projectId=${ids.project}`,
      ids.safetyPolicy,
      conflictingSafety.id,
    );
  }
}

function assertNaturalKey(
  model: string,
  key: string,
  expectedId: string,
  actualId: string | undefined,
) {
  if (actualId && actualId !== expectedId) {
    throw collisionError(model, key, expectedId, actualId);
  }
}

function assertOwner(
  model: string,
  actualId: string | undefined,
  expectedId: string,
  owners: Record<string, [expected: string, actual: string | undefined]>,
) {
  if (!actualId) return;
  for (const [key, [expected, actual]] of Object.entries(owners)) {
    if (actual !== expected) {
      throw collisionError(model, `id=${expectedId}, ${key}=${String(actual)}`, expected, String(actual));
    }
  }
}

function collisionError(model: string, key: string, expectedId: string, actualId: string) {
  return new Error(
    `Demo seed collision: ${model} natural key (${key}) must belong to ${expectedId}, but belongs to ${actualId}.`,
  );
}

seed().finally(() => database.$disconnect());
