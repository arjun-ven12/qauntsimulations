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
