import { z } from 'zod';

export const dashboardActivityResponseSchema = z.object({
  investigations: z.array(z.object({
    id: z.string(), projectId: z.string(), projectName: z.string(), name: z.string(), status: z.string(),
    createdAt: z.string().datetime(), completedAt: z.string().datetime().nullable(), findingsCount: z.number().int().nonnegative(),
  })).max(5),
  findings: z.array(z.object({
    id: z.string(), investigationId: z.string(), projectId: z.string(), projectName: z.string(), title: z.string(),
    severity: z.string().nullable(), confidence: z.union([z.string(), z.number()]).nullable(), status: z.string().nullable(), createdAt: z.string().datetime(),
  })).max(5),
});

export type DashboardActivityResponse = z.infer<typeof dashboardActivityResponseSchema>;
