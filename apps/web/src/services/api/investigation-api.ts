import type {
  CreateInvestigationInput,
  Finding,
  InvestigationProgress,
  Project,
} from '@taskos/shared-types';

export interface InvestigationApi {
  createInvestigation(input: CreateInvestigationInput): Promise<InvestigationProgress>;
  getInvestigation(investigationId: string): Promise<InvestigationProgress>;
  listProjects(): Promise<Project[]>;
  createProject(input: {
    name: string;
    description: string | null;
    repositoryUrl: string | null;
  }): Promise<Project>;
  listFindings(investigationId: string): Promise<Finding[]>;
}

export type { CreateInvestigationInput };
