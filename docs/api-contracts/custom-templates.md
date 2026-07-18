# Custom Templates API

All routes require an authenticated user and active organisation. Records are scoped to both the
active organisation and authenticated user. Readers require `VIEW_PROJECTS`; mutations require
`EDIT_PROJECTS`.

## Representation

```json
{
  "id": "template-id",
  "category": "PROJECT",
  "source": "CUSTOM",
  "name": "Checkout project",
  "description": "Optional description",
  "schemaVersion": 1,
  "payload": {},
  "createdAt": "2026-07-18T00:00:00.000Z",
  "updatedAt": "2026-07-18T00:00:00.000Z"
}
```

Supported categories are `PROJECT`, `ENVIRONMENT`, `PROJECT_SAFETY`, `JOURNEY`, `INVARIANT`, and
`SCENARIO`. Payloads are category-validated and exclude credentials, record identifiers,
validation results, and preflight results. Schema version `1` is the only supported version.

## Routes

- `GET /api/templates?category=PROJECT` lists the current user's templates.
- `GET /api/templates/:templateId` reads one template.
- `POST /api/templates` creates a template from `category`, `name`, optional `description`,
  `schemaVersion`, and `payload`.
- `PUT /api/templates/:templateId` updates one or more of `name`, `description`, `schemaVersion`,
  and `payload`.
- `DELETE /api/templates/:templateId` permanently deletes the template and returns `204`.

Names are unique case-insensitively within the current organisation, user, and category. Built-in
templates are frontend-owned immutable definitions and are never written through this API.
