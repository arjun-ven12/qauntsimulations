import type { WorldPackManifest } from '@taskos/world-pack-sdk';

export const commercePackManifest: WorldPackManifest = {
  identifier: 'commerce', version: '0.1.0', name: 'Commerce',
  description: 'Counterfactual checkout, payment, inventory, and concurrency experiments.',
  supportedJourneys: [{ id: 'checkout', name: 'Checkout', steps: [
    { action: 'NAVIGATE', value: '/products/sku-1' }, { action: 'CLICK', selector: '[data-testid="add-to-cart"]' },
    { action: 'CLICK', selector: '[data-testid="checkout"]' }, { action: 'FILL', selector: '[data-testid="email"]', value: 'buyer@example.com' },
    { action: 'CLICK', selector: '[data-testid="place-order"]' }, { action: 'ASSERT', selector: '[data-testid="order-confirmation"]' },
  ] }],
  scenarioTemplates: [
    { id: 'flash-sale', name: 'Flash sale', prompt: 'Stress checkout during a sudden traffic burst.', controls: { concurrency: [10, 25, 50] } },
    { id: 'duplicate-submission', name: 'Duplicate submission', prompt: 'Submit payment twice while the first response is pending.', controls: { doubleSubmit: true } },
    { id: 'delayed-payment', name: 'Delayed payment', prompt: 'Delay payment responses and vary retry timing.', controls: { paymentDelayMs: [500, 2000, 5000] } },
    { id: 'limited-inventory', name: 'Limited inventory', prompt: 'Race multiple customers for scarce inventory.', controls: { inventory: [1, 2], concurrency: [2, 5] } },
  ],
  supportedActors: [
    { id: 'normal', name: 'Normal customer', behaviour: { retryIntervalMs: 0 } },
    { id: 'impatient', name: 'Impatient customer', behaviour: { retryIntervalMs: 300, doubleSubmit: true } },
    { id: 'concurrent', name: 'Concurrent customers', behaviour: { concurrency: 5 } },
  ],
  supportedFaultTypes: ['NETWORK_LATENCY', 'PACKET_LOSS', 'OFFLINE', 'DOUBLE_SUBMIT', 'PAYMENT_DELAY', 'WEBHOOK_REORDER', 'INVENTORY_RACE'],
  supportedInvariants: [
    { id: 'no-duplicate-payment', name: 'No duplicate payment', description: 'One order creates at most one captured payment.', assertion: { type: 'unique', path: 'payments.orderId' } },
    { id: 'no-negative-inventory', name: 'No negative inventory', description: 'Available inventory never falls below zero.', assertion: { type: 'gte', path: 'inventory.available', value: 0 } },
    { id: 'order-payment-consistency', name: 'Order/payment consistency', description: 'Paid orders have exactly one successful payment.', assertion: { type: 'relationship', left: 'order.status', right: 'payment.status' } },
  ],
  safetyConstraints: [
    { type: 'no-real-payments', value: true, description: 'Never interact with a real payment provider.' },
    { type: 'max-concurrency', value: 50, description: 'Bound load against the target.' },
  ],
  evidenceRequirements: ['SCREENSHOT', 'TRACE', 'CONSOLE_LOG', 'NETWORK_LOG', 'WORKER_RESULT'],
  defaultExperimentVariables: { browser: ['CHROMIUM', 'FIREFOX'], latencyMs: [0, 500, 2000], concurrency: [1, 2, 5], userProfile: ['NORMAL', 'IMPATIENT'] },
};
