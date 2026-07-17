import { useQuery } from '@tanstack/react-query';
import { environmentApi } from '../../services/environment-api.js';

export function EnvironmentSelector({
  projectId,
  value,
  onChange,
}: {
  projectId: string;
  value?: string;
  onChange: (id: string) => void;
}) {
  const query = useQuery({
    queryKey: ['environments', projectId],
    queryFn: () => environmentApi.list(projectId),
  });
  if (query.isPending) return <p className="text-sm text-slate-400">Loading environments…</p>;
  if (query.isError)
    return <p className="text-sm text-red-300">Environments could not be loaded.</p>;
  const first = query.data[0];
  if (!first) return <p className="text-sm text-slate-400">No environments exist for this project.</p>;
  const selected = value ?? query.data.find((environment) => environment.isDefault)?.id ?? first.id;
  return (
    <label className="block text-sm font-medium">
      Environment
      <select
        aria-label="Environment"
        className="mt-1 w-full"
        onChange={(event) => onChange(event.target.value)}
        value={selected}
      >
        {query.data.map((environment) => (
          <option key={environment.id} value={environment.id}>
            {environment.name} · {environment.type} · {environment.validationStatus}
          </option>
        ))}
      </select>
    </label>
  );
}
