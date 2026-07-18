import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeading } from '../../components/page-heading.js';
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
    <section className="mx-auto max-w-4xl">
      <PageHeading
        description="Connect one authorised application and establish its initial safety boundary."
        eyebrow="Project setup"
        title="New Project"
      />
      <ProjectForm
        formError={error}
        onSubmit={create}
        pending={pending}
        requireAcknowledgement
        submitLabel="Create project"
      />
    </section>
  );
}
