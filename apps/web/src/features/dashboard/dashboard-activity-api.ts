import { z } from 'zod';
import { authApi } from '../../services/auth-api.js';
import { useAuthStore } from '../../stores/auth.store.js';

const activitySchema = z.object({
  investigations: z.array(z.object({ id: z.string(), projectId: z.string(), projectName: z.string(), name: z.string(), status: z.string(), createdAt: z.string(), completedAt: z.string().nullable(), findingsCount: z.number() })),
  findings: z.array(z.object({ id: z.string(), investigationId: z.string(), projectId: z.string(), projectName: z.string(), title: z.string(), severity: z.string().nullable(), confidence: z.union([z.string(), z.number()]).nullable(), status: z.string().nullable(), createdAt: z.string() })),
});
export type DashboardActivity = z.infer<typeof activitySchema>;

class DashboardActivityApi {
  private readonly baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';
  async get(retry = true): Promise<DashboardActivity> {
    let response: Response;
    try { response = await fetch(`${this.baseUrl}/organisations/current/activity`, { credentials: 'include' }); }
    catch { throw new Error('Rift could not load dashboard activity.'); }
    const payload = await response.json() as { error?: { message?: string } };
    if (response.status === 401 && retry) {
      try { await authApi.refresh(); return this.get(false); } catch { await useAuthStore.getState().signOut(); }
    }
    if (!response.ok) throw new Error(payload.error?.message ?? 'Rift could not load dashboard activity.');
    return activitySchema.parse(payload);
  }
}
export const dashboardActivityApi = new DashboardActivityApi();
