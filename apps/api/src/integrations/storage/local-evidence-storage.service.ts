import { createHash } from 'node:crypto'; import { createReadStream } from 'node:fs'; import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'; import { dirname, resolve, sep } from 'node:path'; import type { Readable } from 'node:stream'; import type { EvidenceStorage, StoredEvidence } from './evidence-storage.interface.js';
export class LocalEvidenceStorage implements EvidenceStorage {
  private readonly root: string; constructor(root: string) { this.root = resolve(root); }
  async put(key: string, content: Buffer | Readable): Promise<StoredEvidence> { const path = this.path(key); await mkdir(dirname(path), { recursive: true }); const chunks: Buffer[] = []; if (!Buffer.isBuffer(content)) for await (const chunk of content) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); const buffer = Buffer.isBuffer(content) ? content : Buffer.concat(chunks); await writeFile(path, buffer, { flag: 'wx' }); return { storageProvider: 'local', storageKey: key, sizeBytes: buffer.byteLength, checksum: createHash('sha256').update(buffer).digest('hex') }; }
  async get(key: string): Promise<Readable> { await access(this.path(key)); return createReadStream(this.path(key)); }
  async delete(key: string): Promise<void> { await rm(this.path(key), { force: true }); }
  async exists(key: string): Promise<boolean> { try { await readFile(this.path(key)); return true; } catch { return false; } }
  private path(key: string): string { const path = resolve(this.root, key); if (path !== this.root && !path.startsWith(`${this.root}${sep}`)) throw new Error('Evidence key escapes storage root'); return path; }
}
