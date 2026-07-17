export type OnboardingStepId = 'safety' | 'environment' | 'journey' | 'invariant';
export type OnboardingStepStatus = 'COMPLETED' | 'CURRENT' | 'UPCOMING';

export interface OnboardingProjectReadiness {
  id: string;
  safetyConfigured: boolean;
  readyEnvironmentCount: number;
  readyJourneyCount: number;
  readyInvariantCount: number;
}

export interface OnboardingStep {
  id: OnboardingStepId;
  label: string;
  description: string;
  href: string;
  status: OnboardingStepStatus;
}

export interface OnboardingProgress {
  projectId: string;
  completedCount: number;
  totalCount: number;
  percentage: number;
  complete: boolean;
  nextStep: OnboardingStep | null;
  steps: OnboardingStep[];
}
