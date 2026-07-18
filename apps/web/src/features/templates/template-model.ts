import { z } from 'zod';

export const templateCategories = [
  'PROJECT',
  'ENVIRONMENT',
  'PROJECT_SAFETY',
  'JOURNEY',
  'INVARIANT',
  'SCENARIO',
] as const;

export const templateCategorySchema = z.enum(templateCategories);
export type TemplateCategory = z.infer<typeof templateCategorySchema>;

export type RiftTemplate<TPayload> = {
  id: string;
  category: TemplateCategory;
  source: 'BUILT_IN' | 'CUSTOM';
  name: string;
  description?: string | undefined;
  schemaVersion: 1;
  payload: TPayload;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
};

export const storedTemplateSchema = z.object({
  id: z.string().min(1),
  category: templateCategorySchema,
  source: z.literal('CUSTOM'),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(500).optional(),
  schemaVersion: z.literal(1),
  payload: z.unknown(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export const templateEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  templates: z.array(storedTemplateSchema),
});

export const importedTemplateSchema = z.object({
  id: z.string().optional(),
  category: templateCategorySchema,
  source: z.enum(['BUILT_IN', 'CUSTOM']).optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(500).optional(),
  schemaVersion: z.literal(1),
  payload: z.unknown(),
});

export function builtInTemplate<TPayload>(
  category: TemplateCategory,
  id: string,
  name: string,
  description: string,
  payload: TPayload,
): RiftTemplate<TPayload> {
  return { id, category, source: 'BUILT_IN', name, description, schemaVersion: 1, payload };
}
