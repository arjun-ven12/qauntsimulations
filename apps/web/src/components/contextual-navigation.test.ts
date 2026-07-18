import { describe, expect, it } from 'vitest';
import { routeContext } from './contextual-navigation.js';

describe('contextual navigation', () => {
  it('keeps the dashboard as the root and gives every routed detail path a safe parent', () => {
    expect(routeContext('/dashboard')).toEqual({ title: 'Dashboard' });
    expect(routeContext('/invitations/accept').back?.to).toBe('/login');

    const examples = [
      ['/projects', '/dashboard'],
      ['/projects/new', '/projects'],
      ['/projects/project-1', '/projects'],
      ['/projects/project-1/settings', '/projects/project-1'],
      ['/projects/project-1/safety', '/projects/project-1'],
      ['/projects/project-1/environments', '/projects/project-1'],
      ['/projects/project-1/environments/new', '/projects/project-1/environments'],
      ['/projects/project-1/environments/environment-1', '/projects/project-1/environments'],
      ['/projects/project-1/environments/environment-1/settings', '/projects/project-1/environments/environment-1'],
      ['/projects/project-1/journeys', '/projects/project-1'],
      ['/projects/project-1/journeys/new', '/projects/project-1/journeys'],
      ['/projects/project-1/journeys/journey-1', '/projects/project-1/journeys'],
      ['/projects/project-1/journeys/journey-1/settings', '/projects/project-1/journeys/journey-1'],
      ['/projects/project-1/invariants', '/projects/project-1'],
      ['/projects/project-1/invariants/new', '/projects/project-1/invariants'],
      ['/projects/project-1/invariants/invariant-1', '/projects/project-1/invariants'],
      ['/projects/project-1/invariants/invariant-1/settings', '/projects/project-1/invariants/invariant-1'],
      ['/projects/project-1/investigations/new', '/projects/project-1'],
      ['/investigations/investigation-1', '/dashboard'],
      ['/investigations/investigation-1/plan', '/investigations/investigation-1'],
      ['/investigations/investigation-1/live', '/investigations/investigation-1'],
      ['/investigations/investigation-1/worlds', '/investigations/investigation-1'],
      ['/investigations/investigation-1/findings', '/investigations/investigation-1'],
      ['/investigations/investigation-1/findings/finding-1', '/investigations/investigation-1/findings'],
      ['/investigations/investigation-1/findings/finding-1/repair-verifications/new', '/investigations/investigation-1/findings/finding-1'],
      ['/investigations/investigation-1/findings/finding-1/repair-verifications/verification-1', '/investigations/investigation-1/findings/finding-1'],
      ['/repairs/repair-1/verify', '/dashboard'],
      ['/settings/organisation', '/dashboard'],
      ['/invitations', '/dashboard'],
    ] as const;

    for (const [path, to] of examples) {
      expect(routeContext(path).back?.to).toBe(to);
    }
  });

  it('uses Rift in document titles', () => {
    expect(routeContext('/projects/project-1').title).toBe('Project');
    expect(routeContext('/unknown').title).toBe('Rift');
  });
});
