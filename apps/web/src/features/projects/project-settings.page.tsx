import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PageHeading } from '../../components/page-heading.js';
import { ProjectApiError, projectApi, type ProjectSetupInput } from '../../services/project-api.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { ProjectForm } from './project-form.js';
import { ProjectLoading, ProjectMessage } from './project-ui.js';

export function ProjectSettingsPage() {
  const { projectId = '' } = useParams();
  const permissions = useAuthStore((state) => state.permissions);
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const project = useQuery({
    queryKey: ['projects', projectId],
    queryFn: () => projectApi.get(projectId),
  });
  const initial = useMemo(() => {
    if (!project.data) return undefined;
    return {
      name: project.data.name,
      description: project.data.description,
      applicationUrl: project.data.applicationUrl ?? '',
      repositoryUrl: project.data.repositoryUrl,
      credentialReferences: project.data.credentialReferences,
      apiEndpoints: project.data.apiEndpoints,
      webhookEndpoints: project.data.webhookEndpoints,
    };
  }, [project.data]);

  if (project.isPending) return <ProjectLoading label="Loading project settings…" />;
  if (project.isError) {
    return (
      <ProjectMessage
        description={
          project.error instanceof Error ? project.error.message : 'Settings unavailable.'
        }
        title={
          project.error instanceof ProjectApiError
            ? project.error.status === 403
              ? 'Project settings access denied'
              : project.error.status === 404
                ? 'Project not found'
                : 'Project settings unavailable'
            : 'Project settings unavailable'
        }
      />
    );
  }
  if (!permissions.includes('EDIT_PROJECTS')) {
    return (
      <ProjectMessage
        description="Your organisation role may view this project but cannot edit its configuration."
        title="Project settings restricted"
      />
    );
  }

  async function save(value: ProjectSetupInput) {
    if (pending) return false;
    setPending(true);
    setError('');
    setSuccess('');
    try {
      const updated = await projectApi.update(projectId, value);
      queryClient.setQueryData(['projects', projectId], updated);
      await queryClient.invalidateQueries({ queryKey: ['projects'], exact: true });
      setSuccess('Project settings saved.');
      return true;
    } catch (requestError) {
      setError(
        requestError instanceof ProjectApiError
          ? requestError.message
          : 'Rift could not save project settings.',
      );
      return false;
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mx-auto max-w-4xl">
      <PageHeading
        description="Review the application and external references used to configure later test environments."
        eyebrow={project.data.organisation.name}
        title="Project Settings"
      />
      <ProjectForm
        formError={error}
        initial={initial}
        onSubmit={save}
        pending={pending}
        submitLabel="Save settings"
        successMessage={success}
      />
    </section>
  );
}
