import type { InvariantEvaluationResult } from '@taskos/execution-contracts'; import { matchesRequestPattern, paymentPatterns } from '../faults/network-faults.js'; import type { InvariantDefinition, InvariantEvaluationContext, InvariantEvaluator } from './invariant-evaluator.interface.js'; import { configuredMethods, configuredPatterns } from './invariant-evaluator.interface.js';
export class NoDuplicatePaymentInvariant implements InvariantEvaluator {
  readonly type = 'NO_DUPLICATE_PAYMENT' as const;
  async evaluate(invariant: InvariantDefinition, context: InvariantEvaluationContext): Promise<InvariantEvaluationResult> {
    const patterns = configuredPatterns(invariant.config, paymentPatterns(context.job)); const methods = configuredMethods(invariant.config);
    const matching = context.networkEvents.filter((event) => methods.includes(event.method.toUpperCase()) && matchesRequestPattern(event.url, patterns)); const actionTimestamps = context.journeyActions.flatMap((action) => action.interactionTimestamps ?? []);
    const evidenceReferences = matching.map((event) => `network-event:${event.id}`); if (context.networkEvidencePath) evidenceReferences.push(context.networkEvidencePath);
    return { invariantId: invariant.id, type: this.type, passed: matching.length <= 1, expected: { maximumPaymentRequestsPerCheckout: 1, patterns, methods }, observed: { matchingRequestCount: matching.length, requests: matching.map((event) => ({ timestamp: event.requestTimestamp, url: event.url, method: event.method, statusCode: event.statusCode })), actionTimestamps }, confidence: matching.length > 1 ? 0.98 : 0.9, evidenceReferences, explanation: matching.length <= 1 ? `Observed ${matching.length} payment-creation request for this checkout attempt.` : `Observed ${matching.length} payment-creation requests for one deterministic checkout attempt.` };
  }
}
