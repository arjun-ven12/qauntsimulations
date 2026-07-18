import type {
  JourneyStepInput,
  JourneyValidationCheck,
  JourneyValidationStatus,
} from './journey-api.js';

export type JourneyPhaseTone = 'pass' | 'running' | 'pending' | 'fail' | 'neutral';

export interface JourneyPhase<TStep extends JourneyStepInput = JourneyStepInput> {
  id: string;
  title: string;
  description: string;
  steps: TStep[];
}

const knownPhases = [
  {
    key: 'Product',
    pattern: /product|catalog|item-detail|pdp/i,
    description: 'Find and review the product',
  },
  { key: 'Cart', pattern: /cart|basket|bag/i, description: 'Build and review the cart' },
  {
    key: 'Checkout',
    pattern: /checkout|email|address|shipping|customer/i,
    description: 'Provide checkout details',
  },
  {
    key: 'Payment',
    pattern: /payment|pay-button|billing|card/i,
    description: 'Submit and confirm payment',
  },
  {
    key: 'Confirmation',
    pattern: /confirmation|order-id|order[_-]?number|success/i,
    description: 'Confirm the completed order',
  },
] as const;

const fallbackPhase = {
  GOTO: ['Navigation', 'Open the required route'],
  CLICK: ['Interaction', 'Interact with the application'],
  FILL: ['Interaction', 'Enter required information'],
  WAIT_FOR: ['Completion', 'Wait for the expected result'],
  ASSERT_VISIBLE: ['Assertions', 'Confirm the expected interface'],
  SCREENSHOT: ['Assertions', 'Capture supporting evidence'],
} as const;

export function groupJourneySteps<TStep extends JourneyStepInput>(
  steps: readonly TStep[],
): JourneyPhase<TStep>[] {
  const phases: JourneyPhase<TStep>[] = [];
  for (const step of [...steps].sort((left, right) => left.order - right.order)) {
    const inferred = inferPhase(step);
    const previous = phases.at(-1);
    if (previous?.title === inferred.title) {
      previous.steps.push(step);
      continue;
    }
    phases.push({
      id: `${slug(inferred.title)}-${phases.length + 1}`,
      title: inferred.title,
      description: inferred.description,
      steps: [step],
    });
  }
  return phases;
}

export function humanStepLabel(step: JourneyStepInput): string {
  const source = `${step.selector ?? ''} ${step.value ?? ''} ${step.metadata.name ?? ''}`;
  const known: Array<[RegExp, string]> = [
    [/add-to-cart|add[_ -]?item/i, 'Add item to cart'],
    [/open-cart|view-cart/i, 'Open cart'],
    [/cart-item/i, 'Confirm cart item'],
    [/checkout-button|start-checkout/i, 'Start checkout'],
    [/checkout-form/i, 'Confirm checkout form'],
    [/email/i, step.action === 'FILL' ? 'Enter customer email' : 'Confirm customer email'],
    [/pay-button|submit-payment/i, 'Submit payment'],
    [/payment-status|payment-response/i, 'Wait for payment response'],
    [/order-confirmation/i, 'Confirm order created'],
    [/order-id|order[_-]?number/i, 'Verify order ID'],
    [/product-page/i, 'Confirm product loaded'],
  ];
  const match = known.find(([pattern]) => pattern.test(source));
  if (match) return match[1];
  if (step.metadata.name?.trim()) return readable(step.metadata.name);
  if (step.action === 'GOTO') return routeLabel(step.value);
  return actionLabel(step.action);
}

export function technicalActionLabel(action: JourneyStepInput['action']): string {
  return {
    GOTO: 'Open page',
    CLICK: 'Click element',
    FILL: 'Fill field',
    WAIT_FOR: 'Wait for element',
    ASSERT_VISIBLE: 'Assert visible',
    SCREENSHOT: 'Capture screenshot',
  }[action];
}

export function phaseTone(
  phase: JourneyPhase,
  validationStatus: JourneyValidationStatus,
  checks: readonly JourneyValidationCheck[] = [],
  validating = false,
): JourneyPhaseTone {
  const orders = new Set(phase.steps.map((step) => step.order));
  const relevant = checks.filter(
    (check) => check.stepOrder !== undefined && orders.has(check.stepOrder),
  );
  if (relevant.some((check) => check.status === 'FAILED')) return 'fail';
  if (relevant.some((check) => check.status === 'WARNING')) return 'pending';
  if (validating) return 'neutral';
  if (validationStatus === 'READY') return 'pass';
  return 'neutral';
}

export function checksForStep(
  checks: readonly JourneyValidationCheck[],
  order: number,
): JourneyValidationCheck[] {
  return checks.filter((check) => check.stepOrder === order);
}

export function isSensitiveStep(step: JourneyStepInput): boolean {
  return /password|passcode|secret|token|credential|card|cvv|cvc/i.test(
    `${step.selector ?? ''} ${step.metadata.name ?? ''}`,
  );
}

function inferPhase(step: JourneyStepInput): { title: string; description: string } {
  const source = `${step.selector ?? ''} ${step.value ?? ''} ${step.metadata.name ?? ''}`;
  const known = knownPhases.find((phase) => phase.pattern.test(source));
  if (known) return { title: known.key, description: known.description };
  const [title, description] = fallbackPhase[step.action];
  return { title, description };
}

function actionLabel(action: JourneyStepInput['action']): string {
  return {
    GOTO: 'Open page',
    CLICK: 'Click element',
    FILL: 'Enter value',
    WAIT_FOR: 'Wait for element',
    ASSERT_VISIBLE: 'Confirm element is visible',
    SCREENSHOT: 'Capture screenshot',
  }[action];
}

function routeLabel(value: string | null): string {
  if (!value) return 'Open application';
  if (/product/i.test(value)) return 'Open product page';
  const segment = value.split(/[?#]/)[0]?.split('/').filter(Boolean).at(-1);
  return segment ? `Open ${readable(segment)} page` : 'Open application';
}

function readable(value: string): string {
  const normalised = value.replace(/[-_]+/g, ' ').trim();
  return normalised ? normalised.charAt(0).toUpperCase() + normalised.slice(1) : 'Unnamed step';
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
