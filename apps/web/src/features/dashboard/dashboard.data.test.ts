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
      }),
    ]);
    expect(result.data.recentInvestigations).toEqual([]);
    expect(result.data.recentFindings).toEqual([]);
    expect(result.investigationsAvailable).toBe(false);
    expect(result.findingsAvailable).toBe(false);
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
}: {
  projects: ProjectSummary[];
  environments?: Environment[];
  journeys?: Journey[];
  invariants?: Invariant[];
}): DashboardDataSources {
  return {
    listProjects: vi.fn().mockResolvedValue(projects),
    listEnvironments: vi.fn().mockResolvedValue(environments),
    listJourneys: vi.fn().mockResolvedValue(journeys),
    listInvariants: vi.fn().mockResolvedValue(invariants),
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
