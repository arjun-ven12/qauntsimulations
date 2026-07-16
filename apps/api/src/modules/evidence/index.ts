/** Metadata persistence is separate from EvidenceStorage binary operations. */
export interface EvidenceRedactor { redact(artifactPath: string): Promise<{ redactedPath: string; findings: string[] }> }
export * from './local-evidence-metadata.service.js';
