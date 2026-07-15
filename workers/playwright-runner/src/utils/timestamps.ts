export const nowIso = (): string => new Date().toISOString();
export const elapsedMs = (startedAt: string, completedAt: string): number => Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime());
