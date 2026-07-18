import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../../stores/auth.store.js';
import type { RiftTemplate, TemplateCategory } from './template-model.js';
import {
  newTemplateId,
  readStoredTemplates,
  templateStorageKey,
  writeStoredTemplates,
} from './template-storage.js';

function browserStorage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function useTemplateLibrary<TPayload>(category: TemplateCategory) {
  const userId = useAuthStore((state) => state.user?.id);
  const organisationId = useAuthStore((state) => state.organisation?.id);
  const key = organisationId && userId ? templateStorageKey(organisationId, userId) : null;
  const [allTemplates, setAllTemplates] = useState<RiftTemplate<unknown>[]>(() =>
    key ? readStoredTemplates(browserStorage(), key) : [],
  );

  useEffect(() => {
    setAllTemplates(key ? readStoredTemplates(browserStorage(), key) : []);
  }, [key]);

  const templates = useMemo(
    () =>
      allTemplates.filter((template) => template.category === category) as RiftTemplate<TPayload>[],
    [allTemplates, category],
  );

  function persist(next: RiftTemplate<unknown>[]) {
    setAllTemplates(next);
    if (key) writeStoredTemplates(browserStorage(), key, next);
  }

  function create(input: { name: string; description?: string; payload: TPayload }) {
    const now = new Date().toISOString();
    const template: RiftTemplate<TPayload> = {
      id: newTemplateId(),
      category,
      source: 'CUSTOM',
      name: input.name.trim(),
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
      schemaVersion: 1,
      payload: structuredClone(input.payload),
      createdAt: now,
      updatedAt: now,
    };
    persist([...allTemplates, template]);
    return template;
  }

  function update(
    id: string,
    patch: Partial<Pick<RiftTemplate<TPayload>, 'name' | 'description' | 'payload'>>,
  ) {
    const now = new Date().toISOString();
    persist(
      allTemplates.map((template) =>
        template.id === id && template.source === 'CUSTOM'
          ? { ...template, ...patch, updatedAt: now }
          : template,
      ),
    );
  }

  function remove(id: string) {
    persist(allTemplates.filter((template) => template.id !== id || template.source !== 'CUSTOM'));
  }

  return { key, templates, create, update, remove };
}
