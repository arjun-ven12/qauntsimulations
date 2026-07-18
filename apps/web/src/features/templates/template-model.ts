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

export const importedTemplateSchema = z
  .object({
    version: z.literal(1),
    category: templateCategorySchema,
    name: z.string().trim().min(1).max(120),
    description: z.string().max(500).optional(),
    payload: z.unknown(),
  })
  .strict();

export function builtInTemplate<TPayload>(
  category: TemplateCategory,
  id: string,
  name: string,
  description: string,
  payload: TPayload,
): RiftTemplate<TPayload> {
  return { id, category, source: 'BUILT_IN', name, description, schemaVersion: 1, payload };
}
