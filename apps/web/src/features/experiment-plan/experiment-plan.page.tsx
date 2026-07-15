import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { PageHeading } from '../../components/page-heading.js';
import { investigationApi } from '../../services/api/index.js';

export function ExperimentPlanPage() {
  const { investigationId = 'investigation_demo_checkout' } = useParams();
  const { data } = useQuery({
    queryKey: ['investigation', investigationId],
    queryFn: () => investigationApi.getInvestigation(investigationId),
  });
  if (!data) return <div>Loading investigation…</div>;
  return (
    <>
      <PageHeading
        eyebrow={data.status}
        title="Investigation queued"
        description="The frozen product contract is ready for the local runtime to orchestrate."
        action={
          <Link
            to={`/investigations/${data.id}/live`}
            className="rounded-lg bg-cyan px-4 py-2 font-bold text-ink"
          >
            View progress
          </Link>
        }
      />
      <section className="card max-w-xl">
        <h2 className="font-bold">Initial world budget</h2>
        <p className="mt-3 text-3xl font-bold text-cyan">{data.progress.totalWorlds}</p>
        <p className="text-sm text-slate-400">Worlds currently belonging to this investigation.</p>
      </section>
    </>
  );
}
