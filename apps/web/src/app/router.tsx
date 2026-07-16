import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AuthPage } from '../features/auth/login.page.js';
import { ExperimentPlanPage } from '../features/experiment-plan/experiment-plan.page.js';
import { FindingDetailPage } from '../features/findings/finding-detail.page.js';
import { InvestigationFindingsPage } from '../features/findings/investigation-findings.page.js';
import { NewInvestigationPage } from '../features/investigations/new-investigation.page.js';
import { LiveWorldLabPage } from '../features/live-worldlab/live-worldlab.page.js';
import { OrganisationPage } from '../features/organisation/organisation.page.js';
import { InvitationsPage } from '../features/organisation/invitations.page.js';
import { InvitationAcceptPage } from '../features/organisation/invitation-accept.page.js';
import { NewProjectPage } from '../features/projects/new-project.page.js';
import { ProjectOverviewPage } from '../features/projects/project-overview.page.js';
import { ProjectSettingsPage } from '../features/projects/project-settings.page.js';
import { ProjectsPage } from '../features/projects/projects.page.js';
import { SafetySettingsPage } from '../features/projects/safety-settings.page.js';
import { VerifyRepairPage } from '../features/repairs/verify-repair.page.js';
import { AppLayout } from '../layouts/app-layout.js';
import { GuestRoute, RouteGuard } from '../routes/route-guard.js';

export const router = createBrowserRouter([
  { path: '/invitations/accept', element: <InvitationAcceptPage /> },
  {
    element: (
      <GuestRoute>
        <AuthPage />
      </GuestRoute>
    ),
    children: [
      { path: '/login', element: <></> },
      { path: '/register', element: <></> },
    ],
  },
  {
    element: (
      <RouteGuard>
        <AppLayout />
      </RouteGuard>
    ),
    children: [
      { index: true, element: <Navigate to="/projects" replace /> },
      { path: '/projects', element: <ProjectsPage /> },
      { path: '/projects/new', element: <NewProjectPage /> },
      { path: '/projects/:projectId', element: <ProjectOverviewPage /> },
      { path: '/projects/:projectId/settings', element: <ProjectSettingsPage /> },
      { path: '/projects/:projectId/safety', element: <SafetySettingsPage /> },
      { path: '/projects/:projectId/investigations/new', element: <NewInvestigationPage /> },
      { path: '/investigations/:investigationId/plan', element: <ExperimentPlanPage /> },
      { path: '/investigations/:investigationId/live', element: <LiveWorldLabPage /> },
      {
        path: '/investigations/:investigationId/findings',
        element: <InvestigationFindingsPage />,
      },
      { path: '/findings/:findingId', element: <FindingDetailPage /> },
      { path: '/repairs/:repairId/verify', element: <VerifyRepairPage /> },
      { path: '/settings/organisation', element: <OrganisationPage /> },
      { path: '/invitations', element: <InvitationsPage /> },
    ],
  },
]);
