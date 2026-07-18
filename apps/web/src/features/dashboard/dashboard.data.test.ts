import { describe, expect, it, vi } from 'vitest';
import type { Environment } from '../../services/environment-api.js';
import type { ProjectSummary } from '../../services/project-api.js';
import type { Invariant } from '../invariants/invariant-api.js';
import type { Journey } from '../journeys/journey-api.js';
import {
  dashboardQueryKey,
  loadDashboardData,
  type DashboardDataSources,
} from './dashboard.data.js';

const organisation = { id: 'org-current', name: 'Current Organisation', role: 'OWNER' };

describe('Dashboard Product data adapter', () => {
  it('maps real Product records into readiness counts and isolates the demo-name heuristic', async () => {
    const sources = sourceFixture({
      projects: [project('project-real', 'Checkout Reliability Lab')],
      environments: [environment('READY'), environment('DRAFT')],
      journeys: [journey('ENABLED', 'READY'), journey('ENABLED', 'DRAFT'), journey('DRAFT', 'READY')],
      invariants: [invariant(true, 'READY'), invariant(true, 'INVALID'), invariant(false, 'READY')],
      activity: activityFixture({ projectId: 'project-real' }),
    });

    const result = await loadDashboardData(organisation, sources);

    expect(result.data.organisation).toEqual(organisation);
    expect(result.data.projects).toEqual([
      expect.objectContaining({
        id: 'project-real',
        isPrimaryDemo: true,
        safetyConfigured: true,
        readyEnvironmentCount: 1,
        totalEnvironmentCount: 2,
        readyJourneyCount: 1,
        totalJourneyCount: 2,
        readyInvariantCount: 1,
        totalInvariantCount: 2,
        recentInvestigationCount: 1,
        openFindingCount: 1,
      }),
    ]);
    expect(result.data.recentInvestigations).toEqual([
      expect.objectContaining({
        id: 'investigation-real',
        href: '/investigations/investigation-real',
        name: 'Latest checkout reliability run',
      }),
    ]);
    expect(result.data.recentFindings).toEqual([
      expect.objectContaining({
        id: 'finding-real',
        href: '/investigations/investigation-real/findings/finding-real',
        status: 'CONFIRMED',
      }),
    ]);
    expect(result.investigationsAvailable).toBe(true);
    expect(result.findingsAvailable).toBe(true);
    expect(sources.getActivity).toHaveBeenCalledTimes(1);
  });

  it('keeps Project readiness visible when organisation activity is unavailable', async () => {
    const sources = sourceFixture({ projects: [project('project-real', 'Checkout Reliability Lab')] });
    sources.getActivity = vi.fn().mockRejectedValue(new Error('Activity unavailable'));

    const result = await loadDashboardData(organisation, sources);

    expect(result.data.projects).toHaveLength(1);
    expect(result.data.recentInvestigations).toEqual([]);
    expect(result.data.recentFindings).toEqual([]);
    expect(result.investigationsAvailable).toBe(false);
    expect(result.findingsAvailable).toBe(false);
  });

  it('limits real organisation activity to five items and never hardcodes demo IDs', async () => {
    const sources = sourceFixture({
      projects: [project('project-real', 'Checkout Reliability Lab')],
      activity: {
        investigations: Array.from({ length: 6 }, (_, index) => ({
          id: `investigation-${index}`,
          projectId: 'project-real',
          projectName: 'Checkout Reliability Lab',
          name: `Investigation ${index}`,
          status: 'COMPLETED',
          createdAt: '2026-07-18T00:00:00.000Z',
          completedAt: null,
          findingsCount: 0,
        })),
        findings: Array.from({ length: 6 }, (_, index) => ({
          id: `finding-${index}`,
          investigationId: `investigation-${index}`,
          projectId: 'project-real',
          projectName: 'Checkout Reliability Lab',
          title: `Finding ${index}`,
          severity: 'CRITICAL',
          confidence: 'CONFIRMED',
          status: null,
          createdAt: '2026-07-18T00:00:00.000Z',
        })),
      },
    });

    const result = await loadDashboardData(organisation, sources);
    const serialized = JSON.stringify(result.data);

    expect(result.data.recentInvestigations).toHaveLength(5);
    expect(result.data.recentFindings).toHaveLength(5);
    expect(serialized).not.toContain('cmrol9cxh0001rurb8godxnh6');
    expect(serialized).not.toContain('cmrol9ijr004drurbren30ov6');
  });

  it('does not mark another commerce demo as the primary seeded demo', async () => {
    const result = await loadDashboardData(
      organisation,
      sourceFixture({ projects: [project('project-commerce', 'Rift Demo Commerce')] }),
    );

    expect(result.data.projects[0]).toMatchObject({
      name: 'Rift Demo Commerce',
      isPrimaryDemo: false,
    });
  });

  it('uses the tenant-scoped activity feed for recent activity without fabricating records', async () => {
    const result = await loadDashboardData(
      organisation,
      sourceFixture({
        projects: [project('project-real', 'Checkout Reliability Lab')],
        activity: {
          investigations: [{
            id: 'investigation-1',
            projectId: 'project-real',
            projectName: 'Checkout Reliability Lab',
            name: 'Delayed payment verification',
            status: 'RUNNING',
            createdAt: '2026-07-17T08:00:00.000Z',
            completedAt: null,
            findingsCount: 2,
          }],
          findings: [{
            id: 'finding-1',
            investigationId: 'investigation-1',
            projectId: 'project-real',
            projectName: 'Checkout Reliability Lab',
            title: 'Duplicate payment risk',
            severity: 'CRITICAL',
            confidence: 'HIGH',
            status: 'OPEN',
            createdAt: '2026-07-17T09:00:00.000Z',
          }],
        },
      }),
    );

    expect(result.data.recentInvestigations).toEqual([expect.objectContaining({
      id: 'investigation-1',
      name: 'Delayed payment verification',
      findingCount: 2,
    })]);
    expect(result.data.recentFindings).toEqual([expect.objectContaining({
      id: 'finding-1',
      investigationId: 'investigation-1',
      severity: 'CRITICAL',
    })]);
    expect(result.data.projects[0]).toMatchObject({
      recentInvestigationCount: 1,
      openFindingCount: 1,
    });
  });

  it('keeps configuration available when the read-only activity feed fails', async () => {
    const sources = sourceFixture({ projects: [project('project-real', 'Checkout Reliability Lab')] });
    sources.getActivity = vi.fn().mockRejectedValue(new Error('Activity unavailable'));

    const result = await loadDashboardData(organisation, sources);

    expect(result.data.projects).toHaveLength(1);
    expect(result.data.recentInvestigations).toEqual([]);
    expect(result.investigationsAvailable).toBe(false);
    expect(result.findingsAvailable).toBe(false);
  });

  it('keeps Project configuration visible when a child Product API partially fails', async () => {
    const sources = sourceFixture({ projects: [project('project-partial', 'Partial Project')] });
    sources.listJourneys = vi.fn().mockRejectedValue(new Error('Journey service unavailable'));

    const result = await loadDashboardData(organisation, sources);

    expect(result.data.projects[0]).toMatchObject({
      id: 'project-partial',
      unavailableConfiguration: ['journeys'],
    });
    expect(result.configurationWarnings).toEqual([
      'Partial Project: journeys readiness is unavailable.',
    ]);
  });

  it('surfaces Project-list failure as a full Dashboard failure', async () => {
    const sources = sourceFixture({ projects: [] });
    sources.listProjects = vi.fn().mockRejectedValue(new Error('Projects unavailable'));

    await expect(loadDashboardData(organisation, sources)).rejects.toThrow('Projects unavailable');
  });

  it('uses organisation-scoped query keys so switching cannot reuse prior Dashboard data', () => {
    expect(dashboardQueryKey('org-first')).toEqual(['dashboard', 'org-first']);
    expect(dashboardQueryKey('org-second')).toEqual(['dashboard', 'org-second']);
    expect(dashboardQueryKey('org-first')).not.toEqual(dashboardQueryKey('org-second'));
  });

  it('renders an honest empty Project collection for an organisation with no Projects', async () => {
    const result = await loadDashboardData(organisation, sourceFixture({ projects: [] }));
    expect(result.data.projects).toEqual([]);
  });
});

function sourceFixture({
  projects,
  environments = [],
  journeys = [],
  invariants = [],
  activity = { investigations: [], findings: [] },
}: {
  projects: ProjectSummary[];
  environments?: Environment[];
  journeys?: Journey[];
  invariants?: Invariant[];
  activity?: DashboardActivitySourcesReturn;
}): DashboardDataSources {
  return {
    listProjects: vi.fn().mockResolvedValue(projects),
    listEnvironments: vi.fn().mockResolvedValue(environments),
    listJourneys: vi.fn().mockResolvedValue(journeys),
    listInvariants: vi.fn().mockResolvedValue(invariants),
    getActivity: vi.fn().mockResolvedValue(activity),
  };
}

type DashboardActivitySourcesReturn = Awaited<ReturnType<DashboardDataSources['getActivity']>>;

function activityFixture({ projectId }: { projectId: string }): DashboardActivitySourcesReturn {
  return {
    investigations: [{
      id: 'investigation-real',
      projectId,
      projectName: 'Checkout Reliability Lab',
      name: 'Latest checkout reliability run',
      status: 'COMPLETED',
      createdAt: '2026-07-18T00:00:00.000Z',
      completedAt: '2026-07-18T00:01:00.000Z',
      findingsCount: 1,
    }],
    findings: [{
      id: 'finding-real',
      investigationId: 'investigation-real',
      projectId,
      projectName: 'Checkout Reliability Lab',
      title: 'Duplicate payment request',
      severity: 'CRITICAL',
      confidence: 'CONFIRMED',
      status: null,
      createdAt: '2026-07-18T00:00:00.000Z',
    }],
  };
}

function project(id: string, name: string): ProjectSummary {
  return {
    id,
    organisationId: organisation.id,
    name,
    description: 'Product target',
    applicationUrl: 'http://localhost:3001',
    repositoryUrl: null,
    organisation: { id: organisation.id, name: organisation.name, slug: 'current' },
    safety: { configured: true, authorisedHostCount: 1, prohibitedActionCount: 1 },
    createdAt: '2026-07-17T00:00:00.000Z',
    updatedAt: '2026-07-17T00:00:00.000Z',
  };
}

function environment(validationStatus: string): Environment {
  return { validationStatus } as Environment;
}

function journey(state: Journey['state'], validationStatus: Journey['validationStatus']): Journey {
  return { state, validationStatus } as Journey;
}

function invariant(
  enabled: boolean,
  validationStatus: Invariant['validationStatus'],
): Invariant {
  return { enabled, validationStatus } as Invariant;
}
