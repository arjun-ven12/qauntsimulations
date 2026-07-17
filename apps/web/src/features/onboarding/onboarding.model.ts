import type {
  OnboardingProgress,
  OnboardingProjectReadiness,
  OnboardingStep,
  OnboardingStepId,
} from './onboarding.types.js';

const definitions: ReadonlyArray<{
  id: OnboardingStepId;
  label: string;
  description: string;
  route(projectId: string): string;
  complete(project: OnboardingProjectReadiness): boolean;
}> = [
  {
    id: 'safety',
    label: 'Set the safety boundary',
    description: 'Authorise hosts, methods, and safe checkout actions.',
    route: (projectId) => `/projects/${projectId}/safety`,
    complete: (project) => project.safetyConfigured,
  },
  {
    id: 'environment',
    label: 'Prepare an Environment',
    description: 'Validate at least one target where TaskOS may run.',
    route: (projectId) => `/projects/${projectId}/environments`,
    complete: (project) => project.readyEnvironmentCount > 0,
  },
  {
    id: 'journey',
    label: 'Enable a Journey',
    description: 'Create a READY browser path through the product.',
    route: (projectId) => `/projects/${projectId}/journeys`,
    complete: (project) => project.readyJourneyCount > 0,
  },
  {
    id: 'invariant',
    label: 'Protect an Invariant',
    description: 'Enable at least one READY business rule for evaluation.',
    route: (projectId) => `/projects/${projectId}/invariants`,
    complete: (project) => project.readyInvariantCount > 0,
  },
];

export function deriveOnboardingProgress(
  project: OnboardingProjectReadiness,
): OnboardingProgress {
  const completed = definitions.map((definition) => definition.complete(project));
  const currentIndex = completed.findIndex((value) => !value);
  const steps: OnboardingStep[] = definitions.map((definition, index) => ({
    id: definition.id,
    label: definition.label,
    description: definition.description,
    href: definition.route(project.id),
    status: completed[index]
      ? 'COMPLETED'
      : index === currentIndex
        ? 'CURRENT'
        : 'UPCOMING',
  }));
  const completedCount = completed.filter(Boolean).length;
  const totalCount = definitions.length;
  return {
    projectId: project.id,
    completedCount,
    totalCount,
    percentage: Math.round((completedCount / totalCount) * 100),
    complete: completedCount === totalCount,
    nextStep: steps.find((step) => step.status === 'CURRENT') ?? null,
    steps,
  };
}
