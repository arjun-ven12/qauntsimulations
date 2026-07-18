import type { ReactNode } from 'react';
import type { SemanticStatusDefinition, SemanticTone } from '../features/runtime/semantic-status.js';

type SemanticProps = { tone: SemanticTone; label: string; accessibleText?: string; icon?: ReactNode };

export function SemanticBadge({ tone, label, accessibleText = `${label} status`, icon }: SemanticProps) {
  return <span aria-label={accessibleText} className={`rift-semantic-status rift-semantic-status--${tone}`} data-tone={tone}>{icon}{label}</span>;
}
export function MappedSemanticBadge({ status }: { status: SemanticStatusDefinition }) {
  return <SemanticBadge accessibleText={status.accessibleText} label={status.label} tone={status.tone} />;
}
export function SemanticStatus({ tone, label, accessibleText = `${label} status`, icon }: SemanticProps) {
  return <span aria-label={accessibleText} className={`rift-semantic-label rift-semantic-label--${tone}`} data-tone={tone}><SemanticDot pulse={tone === 'running'} tone={tone} />{icon}{label}</span>;
}
export function MappedSemanticStatus({ status }: { status: SemanticStatusDefinition }) {
  return <SemanticStatus accessibleText={status.accessibleText} label={status.label} tone={status.tone} />;
}
export function SemanticDot({ tone, pulse = false }: { tone: SemanticTone; pulse?: boolean }) {
  return <span aria-hidden="true" className={`rift-semantic-dot rift-semantic-dot--${tone}${pulse ? ' rift-semantic-dot--pulse' : ''}`} data-tone={tone} />;
}
