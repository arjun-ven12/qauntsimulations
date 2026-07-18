import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeading } from '../../components/page-heading.js';
import { MappedSemanticBadge } from '../../components/semantic-status.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { PanelState } from '../runtime/runtime-components.js';
import { repairVerificationApi, repairVerificationInputSchema, type RepairVerificationInput } from './repair-verification-api.js';
import { useRepairVerification } from './use-repair-verification.js';
import { repairVerificationStatus, validationStatus } from '../runtime/semantic-status.js';

type RepairVerificationDraft = Omit<RepairVerificationInput, 'acknowledgement'> & { acknowledgement: boolean };

export function RepairVerificationCreatePage() {
  const { investigationId = '', findingId = '' } = useParams();
  const editable = useAuthStore((state) => state.permissions.includes('EDIT_PROJECTS'));
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [input, setInput] = useState<RepairVerificationDraft>({ environmentId: '', deploymentVersion: '', notes: '', acknowledgement: false });
  const [preflight, setPreflight] = useState<Awaited<ReturnType<typeof repairVerificationApi.preflight>> | null>(null);
  const [preflightPayload, setPreflightPayload] = useState<string | null>(null);
  const environments = useQuery({ queryKey: ['repair-verification', 'targets', findingId], queryFn: () => repairVerificationApi.targets(findingId), enabled: Boolean(findingId) });
  const validate = useMutation({
    mutationFn: (value: RepairVerificationInput) => repairVerificationApi.preflight(findingId, value),
    onSuccess: (result, value) => { setPreflight(result); setPreflightPayload(payloadKey(value)); },
  });
  const create = useMutation({
    mutationFn: (value: RepairVerificationInput) => repairVerificationApi.create(findingId, value, crypto.randomUUID()),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['repair-verifications', 'finding', findingId] });
      navigate(`/investigations/${investigationId}/findings/${findingId}/repair-verifications/${created.repairVerificationId}`);
    },
  });
  const update = (next: RepairVerificationDraft) => { setInput(next); setPreflight(null); setPreflightPayload(null); };
  const normalizedPayload = input.acknowledgement ? formPayload(input) : null;
  const submitPreflight = () => { if (normalizedPayload) validate.mutate(normalizedPayload); };
  if (!findingId || !investigationId) return <PanelState title="Finding not found">The URL does not identify a Finding to verify.</PanelState>;
  if (!editable) return <PanelState title="Repair Verification requires edit access">Your current organisation role cannot queue a Repair Verification.</PanelState>;
  const error = validate.error ?? create.error;
  const selected = environments.data?.environments.find((environment) => environment.id === input.environmentId);
  const currentPayload = normalizedPayload ? payloadKey(normalizedPayload) : null;
  const eligible = preflight?.eligibility.status === 'ELIGIBLE' && preflightPayload === currentPayload;
  return <section className="mx-auto max-w-3xl">
    <PageHeading eyebrow="Repair verification" title="Verify the repair" description="Replay the persisted minimum reproduction, passing controls, and bounded regression Worlds against a target Environment." action={<Link className="rounded-lg border border-slate-700 px-4 py-2 text-sm" to={`/investigations/${investigationId}/findings/${findingId}`}>Back to Finding</Link>} />
    <div className="card mt-6 space-y-5">
      <label className="block text-sm font-medium">Target Environment
        <span className="mt-1 block text-sm font-normal text-slate-400">Select the repaired deployment environment that should be verified.</span>
        {environments.isLoading ? <span className="mt-2 block text-sm text-slate-400">Loading persisted Environments…</span> : null}
        {environments.isError ? <span role="alert" className="mt-2 block text-sm text-red-300">Target Environments could not be loaded. The Finding may be unavailable or outside this organisation.</span> : null}
        {!environments.isLoading && !environments.isError && environments.data?.environments.length === 0 ? <span className="mt-2 block text-sm text-slate-400">No Environments are configured for this Finding’s Project.</span> : null}
        {!environments.isLoading && !environments.isError && environments.data?.environments.length && !environments.data.environments.some((environment) => environment.selectable) ? <span className="mt-2 block text-sm text-amber-200">No READY Environments are available for Repair Verification.</span> : null}
        <select className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 disabled:opacity-50" value={input.environmentId} disabled={environments.isLoading || Boolean(environments.error)} onChange={(event) => update({ ...input, environmentId: event.target.value })}><option value="">Select a READY Environment</option>{environments.data?.environments.map((environment) => <option key={environment.id} value={environment.id} disabled={!environment.selectable}>{environment.name}{environment.type ? ` · ${environment.type}` : ''} · {environment.status}{environment.disabledReason ? ` — ${environment.disabledReason}` : ''}</option>)}</select>
      </label>
      {input.environmentId && (!selected || !selected.selectable) ? <p className="text-sm text-amber-200">The selected Environment is no longer available. Select a READY Environment and check readiness again.</p> : null}
      <label className="block text-sm font-medium">Deployment version <input className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 p-3" value={input.deploymentVersion} onChange={(event) => update({ ...input, deploymentVersion: event.target.value })} placeholder="Optional commit SHA or deployment reference" /></label>
      <label className="block text-sm font-medium">Notes <textarea className="mt-2 min-h-24 w-full rounded-lg border border-slate-700 bg-slate-950 p-3" value={input.notes} onChange={(event) => update({ ...input, notes: event.target.value })} /></label>
      <label className="flex gap-3 text-sm"><input type="checkbox" checked={input.acknowledgement} onChange={(event) => update({ ...input, acknowledgement: event.target.checked })} />I acknowledge this runs only against the selected authorised Environment.</label>
      {error instanceof Error ? <p role="alert" className="text-sm text-red-300">{error.message}</p> : null}
      {preflight ? <PreflightResult result={preflight} /> : null}
      <div className="flex flex-wrap gap-3"><button className="rounded-lg border border-cyan px-4 py-2 font-semibold text-cyan disabled:opacity-50" disabled={validate.isPending || !input.acknowledgement || !selected?.selectable} onClick={submitPreflight}>Check readiness</button><button className="rounded-lg bg-cyan px-4 py-2 font-bold text-slate-950 disabled:opacity-50" disabled={!eligible || create.isPending || !normalizedPayload} onClick={() => { if (normalizedPayload) create.mutate(normalizedPayload); }}>Queue verification</button></div>
    </div>
  </section>;
}

function PreflightResult({ result }: { result: Awaited<ReturnType<typeof repairVerificationApi.preflight>> }) {
  const preview = result.eligibility.planPreview;
  return <div className="rounded-xl border border-slate-700 bg-slate-950 p-4"><div className="flex items-center gap-2"><MappedSemanticBadge status={validationStatus(result.eligibility.status)} /><span className="text-sm">{preview ? `${preview.worlds.length} proposed Worlds (maximum ${preview.maximumWorldCount})` : 'No verification plan is available.'}</span></div>{result.eligibility.issues.map((issue) => <p className="mt-2 text-sm text-[var(--status-fail)]" key={issue.code}>{issue.message}</p>)}{result.eligibility.warnings.map((warning) => <p className="mt-2 text-sm text-[var(--status-pending)]" key={warning.code}>{warning.message}</p>)}{preview ? <div className="mt-4 space-y-3 text-sm"><p><span className="text-slate-500">Reused Journey:</span> <strong>{preview.journey.name}</strong></p><div><span className="text-slate-500">Selected Invariants:</span><ul className="mt-1 list-inside list-disc">{preview.invariants.map((invariant) => <li key={invariant.id}>{invariant.type} · {invariant.severity}</li>)}</ul></div><div><span className="text-slate-500">Proposed Worlds:</span><ul className="mt-1 list-inside list-disc text-slate-300">{preview.worlds.map((world) => <li key={world.key}>{world.purpose.replaceAll('_', ' ').toLowerCase()}: {world.reason}</li>)}</ul></div></div> : null}</div>;
}

function payloadKey(input: RepairVerificationInput) { return JSON.stringify({ environmentId: input.environmentId, deploymentVersion: input.deploymentVersion ?? '', notes: input.notes ?? '', acknowledgement: input.acknowledgement }); }

function formPayload(input: RepairVerificationDraft): RepairVerificationInput {
  return repairVerificationInputSchema.parse({
    environmentId: input.environmentId,
    acknowledgement: input.acknowledgement,
    ...((input.deploymentVersion ?? '').trim() ? { deploymentVersion: (input.deploymentVersion ?? '').trim() } : {}),
    ...((input.notes ?? '').trim() ? { notes: (input.notes ?? '').trim() } : {}),
  });
}

export function RepairVerificationDetailPage() {
  const { investigationId = '', findingId = '', verificationId = '' } = useParams();
  const detail = useRepairVerification(verificationId);
  const editable = useAuthStore((state) => state.permissions.includes('EDIT_PROJECTS'));
  const queryClient = useQueryClient();
  const cancel = useMutation({ mutationFn: () => repairVerificationApi.cancel(verificationId), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['repair-verification', verificationId] }) });
  if (detail.isLoading) return <PanelState title="Loading Repair Verification">Loading prepared plan and execution status…</PanelState>;
  if (detail.error || !detail.data) return <PanelState title="Repair Verification unavailable" retry={() => void detail.refetch()}>{detail.error instanceof Error ? detail.error.message : 'Rift could not load this verification.'}</PanelState>;
  const item = detail.data;
  return <section className="mx-auto max-w-3xl"><PageHeading eyebrow="Repair verification" title="Repair Verification result" description="The result is derived from the prepared minimal reproduction, original controls, and bounded regression Worlds." action={<Link className="rounded-lg border border-slate-700 px-4 py-2 text-sm" to={`/investigations/${investigationId}/findings/${findingId}`}>Back to Finding</Link>} />
    <div className="card mt-6"><div className="flex flex-wrap items-center gap-3"><MappedSemanticBadge status={repairVerificationStatus(item.executionStatus, item.verificationResult)} />{item.verificationResult ? <strong>{item.verificationResult.replaceAll('_', ' ')}</strong> : <span>Awaiting result</span>}</div>{item.comparison ? <p className="mt-4 text-sm text-slate-300">{item.comparison.reason}</p> : null}{item.failure ? <p className="mt-4 text-sm text-[var(--status-fail)]">{item.failure.message}</p> : null}{item.executionStatus === 'QUEUED' && editable ? <button className="mt-5 rounded-lg border border-red-400 px-4 py-2 text-sm text-red-200" disabled={cancel.isPending} onClick={() => cancel.mutate()}>Cancel queued verification</button> : null}</div>
    <div className="card mt-5"><h2 className="font-bold">Prepared scope</h2><p className="mt-2 text-sm text-slate-400">This run is immutable and limited to the persisted plan. No adaptive or unbounded follow-up Worlds are added.</p></div></section>;
}
