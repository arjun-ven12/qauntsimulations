import { z } from 'zod';

const nullableText = z.string().max(300).nullable();

export const environmentIntelligenceContextSchema = z.object({
  provider: z.literal('OXYLABS'),
  status: z.enum(['COMPLETED', 'FAILED', 'UNAVAILABLE']),
  sourceUrl: z.string().url(),
  finalUrl: z.string().url(),
  sourceDomain: z.string().min(1).max(253),
  targetStatusCode: z.number().int().min(0).max(599),
  rendered: z.boolean(),
  title: z.string().max(300).nullable(),
  headings: z.array(z.string().max(200)).max(20),
  forms: z.array(z.object({
    method: nullableText,
    action: z.string().max(500).nullable(),
    inputs: z.array(z.object({
      type: nullableText,
      name: nullableText,
      label: nullableText,
      required: z.boolean(),
    }).strict()).max(20),
  }).strict()).max(10),
  buttons: z.array(z.object({
    text: z.string().max(160),
    type: nullableText,
  }).strict()).max(30),
  links: z.array(z.object({
    text: z.string().max(160),
    href: z.string().max(500).nullable(),
  }).strict()).max(40),
  visibleTextSummary: z.string().max(3000),
  detectedJourneys: z.array(z.string().max(80)).max(10),
  jobId: z.string().max(200).nullable(),
  durationMs: z.number().int().nonnegative().max(300000),
  retrievedAt: z.string().datetime(),
  usedByPlanner: z.boolean().optional(),
  errorCategory: z.string().max(120).optional(),
}).strict();

export const environmentIntelligenceSummarySchema = z.object({
  provider: z.literal('OXYLABS'),
  status: z.enum(['COMPLETED', 'FAILED', 'UNAVAILABLE']),
  sourceDomain: z.string().min(1).max(253),
  rendered: z.boolean(),
  title: z.string().max(300).nullable(),
  headingCount: z.number().int().nonnegative().max(20),
  formCount: z.number().int().nonnegative().max(10),
  inputCount: z.number().int().nonnegative().max(200),
  buttonCount: z.number().int().nonnegative().max(30),
  linkCount: z.number().int().nonnegative().max(40),
  detectedJourneys: z.array(z.string().max(80)).max(10),
  durationMs: z.number().int().nonnegative().max(300000),
  usedByPlanner: z.boolean(),
  retrievedAt: z.string().datetime(),
}).strict();

export type EnvironmentIntelligenceContextShape = z.infer<typeof environmentIntelligenceContextSchema>;
export type EnvironmentIntelligenceSummaryShape = z.infer<typeof environmentIntelligenceSummarySchema>;

export function summarizeEnvironmentIntelligence(value: unknown): EnvironmentIntelligenceSummaryShape | null {
  const parsed = environmentIntelligenceContextSchema.safeParse(value);
  if (!parsed.success) return null;
  const context = parsed.data;
  return environmentIntelligenceSummarySchema.parse({
    provider: context.provider,
    status: context.status,
    sourceDomain: context.sourceDomain,
    rendered: context.rendered,
    title: context.title,
    headingCount: context.headings.length,
    formCount: context.forms.length,
    inputCount: context.forms.reduce((total, form) => total + form.inputs.length, 0),
    buttonCount: context.buttons.length,
    linkCount: context.links.length,
    detectedJourneys: context.detectedJourneys,
    durationMs: context.durationMs,
    usedByPlanner: context.usedByPlanner === true,
    retrievedAt: context.retrievedAt,
  });
}
