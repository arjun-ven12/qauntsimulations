import type { Prisma, PrismaClient } from '@prisma/client';

export type TransactionClient = Prisma.TransactionClient;

export async function withinTransaction<T>(database: PrismaClient, operation: (transaction: TransactionClient) => Promise<T>): Promise<T> {
  return database.$transaction(operation);
}
