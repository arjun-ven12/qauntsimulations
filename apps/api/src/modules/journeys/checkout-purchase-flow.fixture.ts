import type { CreateJourneyInput } from './journeys.types.js';

export function checkoutPurchaseFlowFixture(environmentId: string): CreateJourneyInput {
  return {
    name: 'Checkout Purchase Flow',
    description:
      'Adds the test product to the cart, completes a controlled mock checkout and confirms that an order ID exists.',
    environmentId,
    startPath: '/products/test-product',
    state: 'DRAFT',
    completionCondition: {
      type: 'VISIBLE',
      selector: '[data-testid="order-id"]',
    },
    steps: [
      step(0, 'GOTO', null, '/products/test-product'),
      step(1, 'ASSERT_VISIBLE', '[data-testid="product-page"]'),
      step(2, 'CLICK', '[data-testid="add-to-cart"]'),
      step(3, 'ASSERT_VISIBLE', '[data-testid="cart-item"]'),
      step(4, 'CLICK', '[data-testid="open-cart"]'),
      step(5, 'CLICK', '[data-testid="checkout-button"]'),
      step(6, 'ASSERT_VISIBLE', '[data-testid="checkout-form"]'),
      step(7, 'SCREENSHOT', null, null, {
        name: 'checkout-form-loaded',
        screenshotCheckpointName: 'checkout-form-loaded',
      }),
      step(8, 'FILL', '[data-testid="email-input"]', 'customer@example.test'),
      step(9, 'CLICK', '[data-testid="pay-button"]'),
      step(10, 'WAIT_FOR', '[data-testid="payment-status"]', null, {
        expectedState: 'VISIBLE',
        timeoutMs: 30_000,
      }),
      step(11, 'WAIT_FOR', '[data-testid="order-confirmation"]', null, {
        expectedState: 'VISIBLE',
        timeoutMs: 30_000,
      }),
      step(12, 'ASSERT_VISIBLE', '[data-testid="order-id"]'),
      step(13, 'SCREENSHOT', null, null, {
        name: 'order-confirmation',
        screenshotCheckpointName: 'order-confirmation',
      }),
    ],
  };
}

function step(
  order: number,
  action: CreateJourneyInput['steps'][number]['action'],
  selector: string | null,
  value: string | null = null,
  metadata: CreateJourneyInput['steps'][number]['metadata'] = {},
) {
  return { order, action, selector, value, metadata };
}
