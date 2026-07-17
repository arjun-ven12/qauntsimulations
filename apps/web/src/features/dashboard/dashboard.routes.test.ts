import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dashboardRoutes } from './dashboard.routes.js';

describe('Dashboard route integration contracts', () => {
  it('uses the exact existing Product and runtime route contracts', () => {
    expect(dashboardRoutes.projects).toBe('/projects');
    expect(dashboardRoutes.project('project-1')).toBe('/projects/project-1');
    expect(dashboardRoutes.startInvestigation('project-1')).toBe(
      '/projects/project-1/investigations/new',
    );
    expect(dashboardRoutes.investigation('investigation-1')).toBe(
      '/investigations/investigation-1',
    );
    expect(dashboardRoutes.investigationFindings('investigation-1')).toBe(
      '/investigations/investigation-1/findings',
    );
    expect(dashboardRoutes.finding('investigation-1', 'finding-1')).toBe(
      '/investigations/investigation-1/findings/finding-1',
    );
  });

  it('wires the Dashboard route and root redirect while preserving existing routes', () => {
    const router = source('../../app/router.tsx');
    expect(router).toContain("path: '/dashboard', element: <ProductDashboardPage />");
    expect(router).toContain('<Navigate to="/dashboard" replace />');
    for (const route of [
      '/projects',
      '/projects/:projectId',
      '/projects/:projectId/investigations/new',
      '/investigations/:investigationId',
      '/investigations/:investigationId/findings',
      '/investigations/:investigationId/findings/:findingId',
      '/settings/organisation',
      '/invitations',
    ]) {
      expect(router).toContain(`path: '${route}'`);
    }
  });

  it('places Dashboard above Projects in authenticated navigation', () => {
    const layout = source('../../layouts/app-layout.tsx');
    expect(layout.indexOf("label: 'Dashboard'")).toBeGreaterThan(-1);
    expect(layout.indexOf("label: 'Dashboard'")).toBeLessThan(layout.indexOf("label: 'Projects'"));
  });

  it('uses Dashboard as the successful login and authenticated-guest default', () => {
    expect(source('../auth/login.page.tsx')).toContain("return '/dashboard';");
    expect(source('../../routes/route-guard.tsx')).toContain(
      '<Navigate to="/dashboard" replace />',
    );
  });

  it('keeps runtime component internals out of Dashboard implementation', () => {
    for (const file of [
      'dashboard.data.ts',
      'dashboard.model.ts',
      'product-dashboard.page.tsx',
      'product-dashboard.tsx',
    ]) {
      const contents = source(file);
      expect(contents).not.toContain("../runtime/");
      expect(contents).not.toContain("../live-worldlab/");
      expect(contents).not.toContain('runtime-components');
      expect(contents).not.toContain('runtime-normalizers');
    }
  });

  it('keeps preview fixtures out of the routed page', () => {
    const page = source('product-dashboard.page.tsx');
    expect(page).not.toContain('dashboard.fixtures');
    expect(page).not.toContain('seededDemoDashboardData');
  });
});

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}
