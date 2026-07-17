import type { InvariantEvaluationResult } from '@taskos/execution-contracts'; import { matchesRequestPattern, paymentPatterns } from '../faults/network-faults.js'; import type { InvariantDefinition, InvariantEvaluationContext, InvariantEvaluator } from './invariant-evaluator.interface.js'; import { configuredMethods, configuredPatterns } from './invariant-evaluator.interface.js';
export class NoDuplicatePaymentInvariant implements InvariantEvaluator {
  readonly type = 'NO_DUPLICATE_PAYMENT' as const;
  async evaluate(invariant: InvariantDefinition, context: InvariantEvaluationContext): Promise<InvariantEvaluationResult> {
    const patterns = configuredPatterns(invariant.config, paymentPatterns(context.job)); const methods = configuredMethods(invariant.config);
    const matching = context.networkEvents.filter((event) => methods.includes(event.method.toUpperCase()) && matchesRequestPattern(event.url, patterns)); const actionTimestamps = context.journeyActions.filter((action) => action.type === 'submitPayment').flatMap((action) => action.interactionTimestamps ?? []);
    const evidenceReferences = matching.map((event) => `network-event:${event.id}`); if (context.networkEvidencePath) evidenceReferences.push(context.networkEvidencePath);
    return { invariantId: invariant.id, type: this.type, passed: matching.length <= 1, expected: { maximumPaymentRequests: 1 }, observed: { paymentRequests: matching.length, requestIds: matching.map((event) => event.id), timestamps: matching.map((event) => event.requestTimestamp), correlations: matching.map((event) => event.correlationKey).filter(Boolean), actionTimestamps }, confidence: matching.length > 1 ? 0.98 : 0.9, evidenceReferences, explanation: matching.length <= 1 ? `Observed ${matching.length} qualifying payment request for this checkout attempt.` : `Observed ${matching.length} qualifying payment requests for one deterministic checkout attempt.` };
  }
}
