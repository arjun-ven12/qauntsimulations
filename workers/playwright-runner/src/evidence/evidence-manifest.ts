import { evidenceManifestSchema, type EvidenceManifest } from '@taskos/execution-contracts'; import { writeJson } from '../utils/filesystem.js';
export async function writeEvidenceManifest(path: string, manifest: EvidenceManifest): Promise<void> { await writeJson(path, evidenceManifestSchema.parse(manifest)); }
