# Journey Builder router integration

The Journey feature is complete and exported from `./index.ts`. The shared router was intentionally
not edited. Add these imports to `apps/web/src/app/router.tsx`:

```tsx
import {
  JourneyOverviewPage,
  JourneySettingsPage,
  JourneysPage,
  NewJourneyPage,
} from '../features/journeys/index.js';
```

Add these children inside the existing authenticated `AppLayout` route:

```tsx
{ path: '/projects/:projectId/journeys', element: <JourneysPage /> },
{ path: '/projects/:projectId/journeys/new', element: <NewJourneyPage /> },
{ path: '/projects/:projectId/journeys/:journeyId', element: <JourneyOverviewPage /> },
{
  path: '/projects/:projectId/journeys/:journeyId/settings',
  element: <JourneySettingsPage />,
},
```

No global-navigation entry is required for the pages to function. A project-local link can be added
later by the owner of global navigation.
