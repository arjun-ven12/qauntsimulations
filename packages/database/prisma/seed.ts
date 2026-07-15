import { PrismaClient } from '@prisma/client';
import { loadEnvFile } from 'node:process';
import { demoCheckoutJourneySteps, demoProductFixtureIds } from './demo-fixtures.js';

if (!process.env.DATABASE_URL || !process.env.DIRECT_URL) {
  loadEnvFile(new URL('../../../.env', import.meta.url));
}

const database = new PrismaClient();

async function seed(): Promise<void> {
  const ids = demoProductFixtureIds;

  await database.organisation.upsert({
    where: { id: ids.organisation },
    update: { name: 'TaskOS Demo', slug: 'taskos-demo' },
    create: { id: ids.organisation, name: 'TaskOS Demo', slug: 'taskos-demo' },
  });

  await database.project.upsert({
    where: { id: ids.project },
    update: {
      organisationId: ids.organisation,
      name: 'TaskOS Demo Commerce',
      description: 'Deterministic local checkout target for WorldLab investigations.',
      deletedAt: null,
    },
    create: {
      id: ids.project,
      organisationId: ids.organisation,
      name: 'TaskOS Demo Commerce',
      description: 'Deterministic local checkout target for WorldLab investigations.',
    },
  });

  await database.environment.upsert({
    where: { id: ids.environment },
    update: {
      projectId: ids.project,
      name: 'Local Demo Store',
      type: 'DEMO',
      baseUrl: 'http://localhost:5174',
      manifest: {},
      deletedAt: null,
    },
    create: {
      id: ids.environment,
      projectId: ids.project,
      name: 'Local Demo Store',
      type: 'DEMO',
      baseUrl: 'http://localhost:5174',
      manifest: {},
    },
  });

  await database.journey.upsert({
    where: { id: ids.journey },
    update: {
      projectId: ids.project,
      name: 'Complete checkout',
      description: 'Seeded deterministic checkout journey.',
      deletedAt: null,
    },
    create: {
      id: ids.journey,
      projectId: ids.project,
      name: 'Complete checkout',
      description: 'Seeded deterministic checkout journey.',
    },
  });

  for (const step of demoCheckoutJourneySteps) {
    await database.journeyStep.upsert({
      where: { id: step.id },
      update: {
        journeyId: ids.journey,
        order: step.order,
        action: step.action,
        selector: step.selector,
        value: step.value,
        metadata: step.metadata,
      },
      create: { ...step, journeyId: ids.journey },
    });
  }

  await database.scenario.upsert({
    where: { id: ids.scenario },
    update: {
      projectId: ids.project,
      name: 'Delayed duplicate checkout',
      prompt: 'Test checkout under delayed payment responses and impatient repeated clicks.',
      controls: {},
      deletedAt: null,
    },
    create: {
      id: ids.scenario,
      projectId: ids.project,
      name: 'Delayed duplicate checkout',
      prompt: 'Test checkout under delayed payment responses and impatient repeated clicks.',
      controls: {},
    },
  });

  await database.invariant.upsert({
    where: { id: ids.invariant },
    update: {
      organisationId: ids.organisation,
      projectId: ids.project,
      name: 'Single checkout submission',
      description: 'One checkout attempt must create no more than one payment and one order.',
      assertion: { type: 'NO_DUPLICATE_CHECKOUT' },
      deletedAt: null,
    },
    create: {
      id: ids.invariant,
      organisationId: ids.organisation,
      projectId: ids.project,
      name: 'Single checkout submission',
      description: 'One checkout attempt must create no more than one payment and one order.',
      assertion: { type: 'NO_DUPLICATE_CHECKOUT' },
    },
  });

  await database.worldPack.upsert({
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
}

seed().finally(() => database.$disconnect());
