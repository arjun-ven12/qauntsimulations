import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { PageHeading } from '../../components/page-heading.js';
import { investigationApi } from '../../services/api/index.js';

export function LiveWorldLabPage() {
  const { investigationId = 'investigation_demo_checkout' } = useParams();
  const { data } = useQuery({
    queryKey: ['investigation', investigationId],
    queryFn: () => investigationApi.getInvestigation(investigationId),
    refetchInterval: 2000,
  });
  if (!data) return <div>Connecting to the lab…</div>;

  const { totalWorlds, ...classified } = data.progress;
  const counts = Object.entries(classified).map(([name, value]) => ({ name, value }));
  const completed = data.progress.passed + data.progress.failed + data.progress.flaky;
  const percentage = totalWorlds === 0 ? 0 : Math.round((completed / totalWorlds) * 100);

  return (
    <>
      <PageHeading
        eyebrow={data.status}
        title="Live WorldLab"
        description="Polling the frozen InvestigationProgress contract."
      />
      <div className="mb-5 h-2 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full bg-cyan" style={{ width: `${percentage}%` }} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="font-bold">World activity</h2>
          <div className="mt-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={counts}>
                <XAxis dataKey="name" stroke="#64748b" />
                <Tooltip />
                <Bar dataKey="value" fill="#41d9e8" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="card">
          <h2 className="font-bold">Recent events</h2>
          <ol className="mt-4 space-y-4">
            {data.recentEvents.map((event) => (
              <li key={event.id} className="border-l-2 border-cyan/40 pl-4">
                <div className="font-medium">{event.message}</div>
                <time className="text-xs text-slate-500">
                  {new Date(event.createdAt).toLocaleTimeString()}
                </time>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
