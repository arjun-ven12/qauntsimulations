import { z } from 'zod';

export const generatedPlanVariableSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    reason: z.string().trim().min(1).max(500),
    priority: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  })
  .strict();

export const generatedPlanWorldSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    purpose: z.string().trim().min(1).max(500),
    browser: z.string().trim().min(1).max(80),
    viewport: z.string().trim().min(1).max(80),
    networkProfile: z.string().trim().min(1).max(80),
    userProfile: z.string().trim().min(1).max(80),
    paymentDelayMs: z.number().int().min(0).max(10_000),
    duplicateSubmissionBug: z.boolean(),
    doubleSubmit: z.boolean(),
    doubleSubmitIntervalMs: z.number().int().min(0).max(5_000),
    expectedOutcome: z.enum(['PASS', 'INVARIANT_VIOLATION', 'OBSERVE']),
    reason: z.string().trim().min(1).max(1_000),
  })
  .strict();

export const generatedExperimentPlanSchema = z
  .object({
    objective: z.string().trim().min(1).max(1_000),
    explanation: z.string().trim().min(1).max(3_000),
    assumptions: z.array(z.string().trim().min(1).max(500)).max(10),
    variables: z.array(generatedPlanVariableSchema).min(1).max(6),
    worlds: z.array(generatedPlanWorldSchema).min(1).max(8),
    warnings: z.array(z.string().trim().min(1).max(500)).max(20),
  })
  .strict();
