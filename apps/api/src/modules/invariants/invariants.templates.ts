import type { InvariantTemplate } from './invariants.types.js';

export const invariantTemplates: readonly InvariantTemplate[] = [
  {
    id: 'no-duplicate-payment',
    displayName: 'No duplicate payment',
    description: 'A customer must never be charged twice for one checkout.',
    type: 'NO_DUPLICATE_PAYMENT',
    suggestedSeverity: 'CRITICAL',
    configuration: { requestPatterns: ['/api/payments'], methods: ['POST'] },
  },
  {
    id: 'no-duplicate-order',
    displayName: 'No duplicate order',
    description: 'A checkout must never create more than one order.',
    type: 'NO_DUPLICATE_ORDER',
    suggestedSeverity: 'HIGH',
    configuration: {
      requestPatterns: ['/api/orders'],
      methods: ['POST'],
      orderIdSelector: '[data-testid="order-id"]',
    },
  },
] as const;
