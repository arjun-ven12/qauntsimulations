# Organisation invitation persistence schema record

## Status

Implemented on 2026-07-16 under the Product Owner milestone's temporary shared-schema
authorisation. The schema now persists invitations through `OrganisationInvitation`, with the
corresponding organisation and inviter relations and a single reviewed migration.

## Required workflow

An authorised organisation Owner or Admin invites an email address with an eligible role. The
recipient later authenticates or registers with the same verified email and explicitly accepts the
unexpired invitation. Acceptance creates one `OrganisationMember` and consumes the invitation.
Cancellation and resend must operate on persisted records, not browser state.

## Implemented model

Add an `OrganisationInvitation` model with:

- `id: String` primary key
- `organisationId: String` relation to `Organisation`, cascading on organisation deletion
- `email: String` containing a trimmed, lowercase email address
- `role: UserRole`
- `tokenHash: String` unique; only a one-way token hash is persisted
- `invitedByUserId: String` relation to the actor `User`
- `expiresAt: DateTime`
- `status: OrganisationInvitationStatus`
- `acceptedAt: DateTime?`
- `declinedAt: DateTime?`
- `revokedAt: DateTime?`
- `createdAt: DateTime`
- `updatedAt: DateTime`

Acceptance binds the authenticated user through the resulting `OrganisationMember`; an additional
accepting-user relation is unnecessary for the current workflow.

## Uniqueness and expiry

The service enforces one pending invitation for a normalised `(organisationId, email)` pair inside
a serializable transaction. Expired, accepted, declined, and revoked records are not reusable.

## Security implications

- Never persist or return the plaintext invitation token.
- Do not disclose whether an email belongs to a user outside the authorised organisation workflow.
- Revalidate actor membership and `MANAGE_MEMBERS` for invite and revocation.
- Acceptance must bind the authenticated user's verified normalised email to the invitation.
- Prevent Owner assignment by Administrators and preserve at least one Owner.
- Keep invitation tokens out of logs and persisted records.

## Affected API endpoints

Implemented additions, without changing the existing membership routes:

- `GET /api/organisations/current/invitations`
- `POST /api/organisations/current/invitations`
- `POST /api/organisations/current/invitations/:invitationId/revoke`
- `GET /api/invitations`
- `GET /api/invitations/preview?token=...`
- `POST /api/invitations/accept`
- `POST /api/invitations/:invitationId/accept`
- `POST /api/invitations/:invitationId/decline`
