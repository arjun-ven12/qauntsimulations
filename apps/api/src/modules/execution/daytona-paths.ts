import { isAbsolute, relative, resolve, sep } from 'node:path';
import { posix } from 'node:path';

export function sanitizeSandboxName(investigationId: string, worldId: string): string {
  const safe = `taskos-${investigationId.slice(0, 12)}-${worldId.slice(0, 12)}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return safe.slice(0, 63) || 'taskos-world';
}

export function assertRemoteChild(root: string, candidate: string): string {
  const absoluteRoot = posix.resolve(root);
  const absoluteCandidate = posix.resolve(candidate);
  const child = posix.relative(absoluteRoot, absoluteCandidate);
  if (child === '' || (!child.startsWith('../') && child !== '..' && !posix.isAbsolute(child))) {
    return absoluteCandidate;
  }
  throw new Error(`Sandbox path escapes the approved output directory: ${candidate}`);
}

export function localArtifactPath(localRoot: string, remoteRoot: string, remotePath: string): string {
  const safeRemote = assertRemoteChild(remoteRoot, remotePath);
  const relativePath = posix.relative(posix.resolve(remoteRoot), safeRemote);
  const local = resolve(localRoot, ...relativePath.split('/'));
  const child = relative(resolve(localRoot), local);
  if (child.startsWith('..') || isAbsolute(child) || child.split(sep).includes('..')) {
    throw new Error('Downloaded artifact path escaped the local evidence directory');
  }
  return local;
}
