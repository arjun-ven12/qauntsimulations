import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProjectApiError, projectApi, type ProjectSetupInput } from '../../services/project-api.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { ProjectForm } from './project-form.js';
import { ProjectMessage } from './project-ui.js';

export function NewProjectPage() {
  const permissions = useAuthStore((state) => state.permissions);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  if (!permissions.includes('CREATE_PROJECTS')) {
    return (
      <ProjectMessage
        description="Your organisation role can view projects but cannot create them."
        title="Project creation restricted"
      />
    );
  }

  async function create(value: ProjectSetupInput, acknowledgement: boolean) {
    if (!acknowledgement || pending) return false;
    setPending(true);
    setError('');
    try {
      const project = await projectApi.create({
        ...value,
        prohibitedActions: [],
        acknowledgement: true,
      });
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      navigate(`/projects/${project.id}/settings`, { replace: true });
      return true;
    } catch (requestError) {
      setError(
        requestError instanceof ProjectApiError
          ? requestError.message
          : 'Rift could not create the project.',
      );
      return false;
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mx-auto min-w-0 max-w-[1200px]">
      <header className="mb-7 border-b border-[var(--rift-border)] pb-6">
        <p className="eyebrow">Project setup</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-[var(--rift-text)] lg:text-[2.5rem]">
          New Project
        </h1>
        <p className="mt-2 text-sm text-[var(--rift-text-secondary)]">
          Connect one authorised application and establish its initial safety boundary.
        </p>
      </header>
      <ProjectForm
        formError={error}
        guided
        onSubmit={create}
        pending={pending}
        requireAcknowledgement
        submitLabel="Create project"
      />
    </section>
  );
}
