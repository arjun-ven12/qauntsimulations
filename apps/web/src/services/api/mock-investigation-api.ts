import {
  createInvestigationInputSchema,
  investigationProgressSchema,
  type CreateInvestigationInput,
  type Finding,
  type InvestigationProgress,
  type Project,
} from '@taskos/shared-types';
import type { InvestigationApi } from './investigation-api.js';

const FIXED_TIME = '2026-01-01T00:00:00.000Z';

export class MockInvestigationApi implements InvestigationApi {
  private readonly projects: Project[] = [
    {
      id: 'project_demo_checkout',
      organisationId: 'organisation_demo_taskos',
      name: 'TaskOS Demo Commerce',
      description: 'A controlled commerce reliability target.',
      repositoryUrl: null,
      createdAt: FIXED_TIME,
      updatedAt: FIXED_TIME,
    },
  ];

  async listProjects() {
    return this.projects;
  }

  async createProject(input: {
    name: string;
    description: string | null;
    repositoryUrl: string | null;
  }) {
    const item = {
      id: `project_mock_${this.projects.length + 1}`,
      organisationId: 'organisation_demo_taskos',
      ...input,
      createdAt: FIXED_TIME,
      updatedAt: FIXED_TIME,
    };
    this.projects.push(item);
    return item;
  }

  async createInvestigation(input: CreateInvestigationInput): Promise<InvestigationProgress> {
    createInvestigationInputSchema.parse(input);
    return this.progress('investigation_demo_checkout');
  }

  async getInvestigation(investigationId: string): Promise<InvestigationProgress> {
    return this.progress(investigationId);
  }

  async listFindings(investigationId: string): Promise<Finding[]> {
    return [
      {
        id: 'finding_duplicate_payment',
        investigationId,
        title: 'Duplicate payment after impatient resubmission',
        summary: 'A repeated submit during the delayed response created duplicate activity.',
        severity: 'HIGH',
        confidence: 'CONFIRMED',
        reproductionCount: 3,
        causalConditions: { paymentDelayMs: 1200, duplicateSubmissionBug: true },
        createdAt: FIXED_TIME,
        updatedAt: FIXED_TIME,
      },
    ];
  }

  private progress(id: string): InvestigationProgress {
    return investigationProgressSchema.parse({
      id,
      status: 'QUEUED',
      progress: { totalWorlds: 4, queued: 4, running: 0, passed: 0, failed: 0, flaky: 0 },
      recentEvents: [
        {
          id: 'event_investigation_queued',
          investigationId: id,
          type: 'investigation_queued',
          message: 'Investigation is ready for local orchestration.',
          createdAt: FIXED_TIME,
          metadata: { source: 'mock' },
        },
      ],
      findingsCount: 0,
    });
  }
}
