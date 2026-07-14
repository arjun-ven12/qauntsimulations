import type { Readable } from 'node:stream';
export interface StoredEvidence { storageProvider: string; storageKey: string; sizeBytes: number; checksum: string }
export interface EvidenceStorage { put(key: string, content: Buffer | Readable): Promise<StoredEvidence>; get(key: string): Promise<Readable>; delete(key: string): Promise<void>; exists(key: string): Promise<boolean> }
