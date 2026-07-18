import type { UserRole } from '@taskos/shared-types';
import type { TemplateCategory } from './templates.schema.js';

export interface TemplateRecord {
  id: string;
  organisationId: string;
  ownerUserId: string;
  category: TemplateCategory;
  name: string;
  normalizedName: string;
  description: string | null;
  schemaVersion: number;
  payload: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateMembership {
  role: UserRole;
}

export interface TemplateCreateRecord {
  organisationId: string;
  ownerUserId: string;
  category: TemplateCategory;
  name: string;
  normalizedName: string;
  description: string | null;
  schemaVersion: 1;
  payload: unknown;
}

export interface TemplateUpdateRecord {
  name?: string;
  normalizedName?: string;
  description?: string | null;
  schemaVersion?: 1;
  payload?: unknown;
}
