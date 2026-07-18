import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/auth.store.js';
import { templateApi } from './template-api.js';
import type { RiftTemplate, TemplateCategory } from './template-model.js';

export function useTemplateLibrary<TPayload>(category: TemplateCategory) {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id);
  const organisationId = useAuthStore((state) => state.organisation?.id);
  const queryKey = ['templates', organisationId, userId, category] as const;
  const enabled = Boolean(organisationId && userId);
  const templates = useQuery({
    queryKey,
    queryFn: () => templateApi.list<TPayload>(category),
    enabled,
  });

  const createMutation = useMutation({
    mutationFn: (input: { name: string; description?: string; payload: TPayload }) =>
      templateApi.create({ category, ...input }),
    onSuccess: (template) => {
      queryClient.setQueryData<RiftTemplate<TPayload>[]>(queryKey, (current = []) => [
        template,
        ...current,
      ]);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<RiftTemplate<TPayload>, 'name' | 'description' | 'payload'>>;
    }) => templateApi.update<TPayload>(id, patch),
    onSuccess: (updated) => {
      queryClient.setQueryData<RiftTemplate<TPayload>[]>(queryKey, (current = []) =>
        current.map((template) => (template.id === updated.id ? updated : template)),
      );
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => templateApi.remove(id),
    onSuccess: (_result, id) => {
      queryClient.setQueryData<RiftTemplate<TPayload>[]>(queryKey, (current = []) =>
        current.filter((template) => template.id !== id),
      );
    },
  });

  return {
    templates: enabled ? (templates.data ?? []) : [],
    loading: templates.isPending && enabled,
    error: templates.error,
    create: createMutation.mutateAsync,
    update: (id: string, patch: Parameters<typeof updateMutation.mutateAsync>[0]['patch']) =>
      updateMutation.mutateAsync({ id, patch }),
    remove: removeMutation.mutateAsync,
    mutating: createMutation.isPending || updateMutation.isPending || removeMutation.isPending,
  };
}
