const unsafePathKeys = new Set([
  'absolutePath',
  'artifactPath',
  'bundlePath',
  'cwd',
  'demoStorePath',
  'evidenceManifestPath',
  'filePath',
  'filesystemPath',
  'hostPath',
  'jobPath',
  'localPath',
  'manifestPath',
  'outputPath',
  'path',
  'remotePath',
  'reportPath',
  'resultPath',
  'screenshotPath',
  'screenshotPaths',
  'sourcePath',
  'tempPath',
  'tracePath',
  'videoPath',
  'workerBundlePath',
  'workerPath',
  'workerResultPath',
  'workspacePath',
]);

const safeReferenceKeys = new Set([
  'filename',
  'mimeType',
  'reportVersion',
  'storageKey',
  'checksum',
  'evidenceReference',
  'evidenceReferences',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isAbsolutePathLike(value: string): boolean {
  return (
    value.startsWith('/') ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.startsWith('\\\\') ||
    value.includes('\0')
  );
}

function isSensitiveRuntimePath(value: string): boolean {
  return (
    value.includes('/Users/') ||
    value.includes('/tmp/') ||
    value.includes('/private/tmp/') ||
    value.includes('/var/folders/') ||
    value.includes('/workspace/') ||
    value.includes('/home/daytona/') ||
    value.includes('\\Users\\')
  );
}

function shouldDropKey(key: string, value: unknown): boolean {
  if (safeReferenceKeys.has(key)) return false;
  if (unsafePathKeys.has(key)) return true;
  return typeof value === 'string' && (isAbsolutePathLike(value) || isSensitiveRuntimePath(value));
}

export function sanitizeRuntimePublicMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeRuntimePublicMetadata(item));
  if (value instanceof Date) return value.toISOString();
  if (!value || typeof value !== 'object') return value;
  if (!isPlainObject(value)) return {};

  const entries: Array<[string, unknown]> = [];
  for (const [key, child] of Object.entries(value)) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') continue;
    if (shouldDropKey(key, child)) continue;
    entries.push([key, sanitizeRuntimePublicMetadata(child)]);
  }
  return Object.fromEntries(entries);
}
