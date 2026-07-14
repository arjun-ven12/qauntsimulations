import type { ProjectRecord } from './projects.types.js';
export function mapProject(record: ProjectRecord) { return { ...record, createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString() }; }
