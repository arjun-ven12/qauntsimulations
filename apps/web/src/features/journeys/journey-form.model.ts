import type {
  JourneyAction,
  JourneyInput,
  JourneyStepInput,
} from './journey-api.js';

export type ExecutableJourneyAction = Exclude<JourneyAction, 'SCREENSHOT'>;
export interface BuilderStep extends JourneyStepInput {
  clientId: string;
  action: ExecutableJourneyAction;
}
export interface JourneyFormValue extends Omit<JourneyInput, 'steps'> {
  steps: BuilderStep[];
  validationStatus: 'DRAFT' | 'READY' | 'INVALID';
}

let nextClientId = 1;
export function clientId() {
  return `journey-step-${nextClientId++}`;
}

export function journeyDefaults(environmentId = ''): JourneyFormValue {
  return {
    name: '',
    description: null,
    environmentId,
    startPath: '/',
    state: 'DRAFT',
    completionCondition: { type: 'VISIBLE', selector: '' },
    validationStatus: 'DRAFT',
    steps: [newStep('GOTO')],
  };
}

export function toFormValue(input: JourneyInput & { validationStatus?: JourneyFormValue['validationStatus'] }): JourneyFormValue {
  return {
    ...input,
    validationStatus: input.validationStatus ?? 'DRAFT',
    steps: input.steps
      .filter((step): step is JourneyStepInput & { action: ExecutableJourneyAction } => step.action !== 'SCREENSHOT')
      .map((step, order) => ({ ...step, order, metadata: { ...step.metadata }, clientId: clientId() })),
  };
}

export function toJourneyInput(value: JourneyFormValue): JourneyInput {
  return {
    name: value.name.trim(),
    description: value.description?.trim() || null,
    environmentId: value.environmentId,
    startPath: value.startPath.trim(),
    state: value.state,
    completionCondition:
      value.completionCondition.type === 'VISIBLE'
        ? { type: 'VISIBLE', selector: value.completionCondition.selector.trim() }
        : {
            type: 'TEXT',
            selector: value.completionCondition.selector.trim(),
            expectedText: value.completionCondition.expectedText,
          },
    steps: normaliseSteps(value.steps).map(({ clientId: _clientId, ...step }) => step),
  };
}

export function newStep(action: ExecutableJourneyAction = 'CLICK'): BuilderStep {
  return {
    clientId: clientId(),
    order: 0,
    action,
    selector: action === 'GOTO' ? null : '',
    value: action === 'GOTO' ? '/' : action === 'FILL' ? '' : null,
    metadata:
      action === 'WAIT_FOR' ? { expectedState: 'VISIBLE', timeoutMs: 30_000 } : {},
  };
}

export function normaliseSteps(steps: BuilderStep[]) {
  return steps.map((step, order) => ({ ...step, order, metadata: { ...step.metadata } }));
}

export function addStep(steps: BuilderStep[], action: ExecutableJourneyAction = 'CLICK') {
  return normaliseSteps([...steps, newStep(action)]);
}

export function removeStep(steps: BuilderStep[], index: number) {
  return normaliseSteps(steps.filter((_, current) => current !== index));
}

export function duplicateStep(steps: BuilderStep[], index: number) {
  const source = steps[index];
  if (!source) return steps;
  const copy = { ...source, clientId: clientId(), metadata: { ...source.metadata } };
  return normaliseSteps([...steps.slice(0, index + 1), copy, ...steps.slice(index + 1)]);
}

export function moveStep(steps: BuilderStep[], index: number, direction: -1 | 1) {
  const destination = index + direction;
  if (destination < 0 || destination >= steps.length) return steps;
  const next = [...steps];
  [next[index], next[destination]] = [next[destination]!, next[index]!];
  return normaliseSteps(next);
}

export function changeAction(step: BuilderStep, action: ExecutableJourneyAction): BuilderStep {
  const next = newStep(action);
  return {
    ...next,
    clientId: step.clientId,
    order: step.order,
    metadata: {
      ...next.metadata,
      ...(step.metadata.name ? { name: step.metadata.name } : {}),
      ...(step.metadata.screenshotCheckpoint
        ? {
            screenshotCheckpoint: true,
            screenshotCheckpointName: step.metadata.screenshotCheckpointName,
          }
        : {}),
    },
  };
}

export function checkoutTemplate(environmentId: string): JourneyFormValue {
  const step = (
    action: ExecutableJourneyAction,
    selector: string | null = null,
    value: string | null = null,
    metadata: BuilderStep['metadata'] = {},
  ): BuilderStep => ({ clientId: clientId(), order: 0, action, selector, value, metadata });
  return {
    name: 'Checkout Purchase Flow',
    description:
      'Adds the test product to the cart, completes a controlled mock checkout and confirms that an order ID exists.',
    environmentId,
    startPath: '/products/test-product',
    state: 'DRAFT',
    completionCondition: { type: 'VISIBLE', selector: '[data-testid="order-id"]' },
    validationStatus: 'DRAFT',
    steps: normaliseSteps([
      step('GOTO', null, '/products/test-product'),
      step('ASSERT_VISIBLE', '[data-testid="product-page"]'),
      step('CLICK', '[data-testid="add-to-cart"]'),
      step('ASSERT_VISIBLE', '[data-testid="cart-item"]'),
      step('CLICK', '[data-testid="open-cart"]'),
      step('CLICK', '[data-testid="checkout-button"]'),
      step('ASSERT_VISIBLE', '[data-testid="checkout-form"]', null, {
        name: 'checkout-form-loaded',
        screenshotCheckpoint: true,
        screenshotCheckpointName: 'checkout-form-loaded',
      }),
      step('FILL', '[data-testid="email-input"]', 'customer@example.test'),
      step('CLICK', '[data-testid="pay-button"]'),
      step('WAIT_FOR', '[data-testid="payment-status"]', null, {
        expectedState: 'VISIBLE',
        timeoutMs: 30_000,
      }),
      step('WAIT_FOR', '[data-testid="order-confirmation"]', null, {
        expectedState: 'VISIBLE',
        timeoutMs: 30_000,
      }),
      step('ASSERT_VISIBLE', '[data-testid="order-id"]', null, {
        name: 'order-confirmation',
        screenshotCheckpoint: true,
        screenshotCheckpointName: 'order-confirmation',
      }),
    ]),
  };
}

export function formErrors(value: JourneyFormValue) {
  const errors: Record<string, string> = {};
  if (!value.name.trim()) errors.name = 'Journey name is required.';
  if (!value.environmentId) errors.environmentId = 'Select an Environment.';
  if (!value.startPath.trim()) errors.startPath = 'Start path or URL is required.';
  if (!value.steps.length) errors.steps = 'Add at least one executable step.';
  value.steps.forEach((step, index) => {
    if (step.action === 'GOTO' && !step.value?.trim()) errors[`step-${index}-value`] = 'Path or URL is required.';
    if (['CLICK', 'FILL', 'WAIT_FOR', 'ASSERT_VISIBLE'].includes(step.action) && !step.selector?.trim())
      errors[`step-${index}-selector`] = 'Selector is required.';
    if (step.action === 'FILL' && step.value === null) errors[`step-${index}-value`] = 'Value is required.';
    if (step.action === 'WAIT_FOR' && (!step.metadata.timeoutMs || step.metadata.timeoutMs <= 0))
      errors[`step-${index}-timeout`] = 'Enter a positive timeout.';
    if (step.metadata.screenshotCheckpoint && !step.metadata.screenshotCheckpointName?.trim())
      errors[`step-${index}-checkpoint`] = 'Checkpoint name is required.';
  });
  if (!value.completionCondition.selector.trim()) errors.completionSelector = 'Completion selector is required.';
  return errors;
}

export function reviewFor(value: JourneyFormValue) {
  return {
    executableSteps: value.steps.length,
    screenshots: value.steps.filter((step) => step.metadata.screenshotCheckpoint).length,
    assertions: value.steps.filter((step) => step.action === 'ASSERT_VISIBLE').length,
  };
}

export function stepDescription(step: BuilderStep) {
  const label = step.metadata.name;
  if (label) return label;
  if (step.action === 'GOTO') return `Open ${step.value || 'a path'}`;
  if (step.action === 'CLICK') return `Click ${step.selector || 'an element'}`;
  if (step.action === 'FILL') return `Fill ${step.selector || 'a field'}`;
  if (step.action === 'WAIT_FOR') return `Wait for ${step.selector || 'an element'}`;
  return `Confirm ${step.selector || 'an element'} is visible`;
}
