import { PrismaClient } from '@prisma/client';

const database = new PrismaClient();

async function seed(): Promise<void> {
  await database.worldPack.upsert({
    where: { identifier: 'commerce' },
    update: {},
    create: {
      identifier: 'commerce',
      name: 'Commerce',
      description: 'Checkout, payment, inventory, network, and concurrency experiments.',
      versions: { create: { version: '0.1.0', manifest: { supportedJourneys: ['checkout'] }, active: true } },
    },
  });
}

seed().finally(() => database.$disconnect());
