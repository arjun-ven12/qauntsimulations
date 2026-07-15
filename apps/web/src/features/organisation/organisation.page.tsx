import { useQuery } from '@tanstack/react-query';
import { ShieldAlert, Users } from 'lucide-react';
import { PageHeading } from '../../components/page-heading.js';
import { OrganisationApiError, organisationApi } from '../../services/organisation-api.js';
import { useAuthStore } from '../../stores/auth.store.js';

export function OrganisationPage() {
  const permissions = useAuthStore((state) => state.permissions);
  const canViewMembers = permissions.includes('VIEW_MEMBERS');
  const current = useQuery({
    queryKey: ['organisation', 'current'],
    queryFn: () => organisationApi.current(),
  });
  const members = useQuery({
    queryKey: ['organisation', 'members'],
    queryFn: () => organisationApi.members(),
    enabled: canViewMembers,
  });

  if (current.isPending) return <OrganisationLoading />;
  if (current.isError) {
    return (
      <OrganisationMessage
        description="WorldLab could not load your organisation. Try again in a moment."
        title="Organisation unavailable"
      />
    );
  }

  return (
    <section aria-labelledby="organisation-heading">
      <PageHeading
        description="Membership and access for your current WorldLab organisation."
        eyebrow="Settings"
        title={current.data.organisation.name}
      />
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <div className="card">
          <div className="eyebrow">Current organisation</div>
          <h2 className="mt-3 text-xl font-bold" id="organisation-heading">
            {current.data.organisation.name}
          </h2>
          <p className="mt-2 text-sm text-slate-400">{current.data.organisation.slug}</p>
        </div>
        <div className="card">
          <div className="eyebrow">Your role</div>
          <p className="mt-3 text-xl font-bold" data-testid="current-role">
            {current.data.membership.role}
          </p>
          <p className="mt-2 text-sm text-slate-400">Permissions are enforced by the API.</p>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <Users aria-hidden="true" className="text-cyan" size={21} />
        <h2 className="text-xl font-bold">Members</h2>
      </div>
      {!canViewMembers ? (
        <div className="card" data-testid="members-access-denied" role="status">
          <div className="flex items-start gap-3">
            <ShieldAlert aria-hidden="true" className="mt-0.5 text-amber-300" size={20} />
            <div>
              <h3 className="font-bold">Member list restricted</h3>
              <p className="mt-1 text-sm text-slate-400">
                Your role can view organisation details but not the member directory.
              </p>
            </div>
          </div>
        </div>
      ) : members.isPending ? (
        <p aria-live="polite" className="text-sm text-slate-400">
          Loading members…
        </p>
      ) : members.isError &&
        members.error instanceof OrganisationApiError &&
        members.error.status === 403 ? (
        <div className="card" data-testid="members-access-denied" role="alert">
          <div className="flex items-start gap-3">
            <ShieldAlert aria-hidden="true" className="mt-0.5 text-amber-300" size={20} />
            <div>
              <h3 className="font-bold">Member list restricted</h3>
              <p className="mt-1 text-sm text-slate-400">
                The API denied access to this organisation member directory.
              </p>
            </div>
          </div>
        </div>
      ) : members.isError ? (
        <OrganisationMessage
          description="The member directory could not be loaded."
          title="Members unavailable"
        />
      ) : members.data.length === 0 ? (
        <p className="card text-sm text-slate-400">No organisation members were found.</p>
      ) : (
        <ul className="grid gap-3" data-testid="member-list">
          {members.data.map((member) => (
            <li
              className="card grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              data-testid="member-row"
              key={member.id}
            >
              <div className="min-w-0">
                <h3 className="truncate font-bold">{member.user.displayName}</h3>
                <p className="truncate text-sm text-slate-400">{member.user.email}</p>
              </div>
              <span className="w-fit rounded-full border border-slate-700 px-3 py-1 text-xs font-bold text-slate-300">
                {member.role}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OrganisationLoading() {
  return (
    <p aria-live="polite" className="text-sm text-slate-400">
      Loading organisation…
    </p>
  );
}

function OrganisationMessage({ title, description }: { title: string; description: string }) {
  return (
    <div className="card" role="alert">
      <h2 className="font-bold">{title}</h2>
      <p className="mt-2 text-sm text-slate-400">{description}</p>
    </div>
  );
}
