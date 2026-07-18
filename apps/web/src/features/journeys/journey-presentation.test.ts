import { describe, expect, it } from 'vitest';
import type { JourneyStepInput, JourneyValidationCheck } from './journey-api.js';
import {
  checksForStep,
  groupJourneySteps,
  humanStepLabel,
  isSensitiveStep,
  phaseTone,
  technicalActionLabel,
} from './journey-presentation.js';
import { checkoutTemplate } from './journey-form.model.js';

describe('Journey presentation', () => {
  it('groups the checkout journey deterministically without changing step order', () => {
    const steps = checkoutTemplate('environment-1').steps;
    const first = groupJourneySteps(steps);
    const second = groupJourneySteps([...steps].reverse());

    expect(first.map((phase) => [phase.title, phase.steps.length])).toEqual([
      ['Product', 2],
      ['Cart', 3],
      ['Checkout', 3],
      ['Payment', 2],
      ['Confirmation', 2],
    ]);
    expect(second.map((phase) => phase.title)).toEqual(first.map((phase) => phase.title));
    expect(first.flatMap((phase) => phase.steps.map((step) => step.order))).toEqual(
      steps.map((step) => step.order),
    );
  });

  it('falls back to action-based phases for unknown application language', () => {
    const phases = groupJourneySteps([
      step(0, 'GOTO', null, '/unknown'),
      step(1, 'CLICK', '#continue'),
      step(2, 'FILL', '#reference', 'ABC'),
      step(3, 'ASSERT_VISIBLE', '#result'),
      step(4, 'WAIT_FOR', '#done'),
    ]);
    expect(phases.map((phase) => phase.title)).toEqual([
      'Navigation',
      'Interaction',
      'Assertions',
      'Completion',
    ]);
  });

  it('derives business labels and retains readable technical fallbacks', () => {
    expect(humanStepLabel(step(0, 'CLICK', '[data-testid="add-to-cart"]'))).toBe(
      'Add item to cart',
    );
    expect(humanStepLabel(step(1, 'ASSERT_VISIBLE', '#unfamiliar-result'))).toBe(
      'Confirm element is visible',
    );
    expect(technicalActionLabel('ASSERT_VISIBLE')).toBe('Assert visible');
  });

  it('preserves selectors and masks only sensitive values', () => {
    const password = step(0, 'FILL', '[name="password"]', 'secret');
    const email = step(1, 'FILL', '[name="email"]', 'customer@example.test');
    expect(password.selector).toBe('[name="password"]');
    expect(isSensitiveStep(password)).toBe(true);
    expect(isSensitiveStep(email)).toBe(false);
  });

  it('maps real validation checks to phase states and step explanations', () => {
    const phase = groupJourneySteps([step(2, 'CLICK', '#continue')])[0]!;
    const passed = [check('PASSED', 2)];
    const warning = [check('WARNING', 2)];
    const failed = [check('FAILED', 2)];

    expect(phaseTone(phase, 'DRAFT')).toBe('neutral');
    expect(phaseTone(phase, 'READY', passed)).toBe('pass');
    expect(phaseTone(phase, 'READY', warning)).toBe('pending');
    expect(phaseTone(phase, 'INVALID', failed)).toBe('fail');
    expect(phaseTone(phase, 'DRAFT', [], true)).toBe('neutral');
    expect(checksForStep(failed, 2)).toEqual(failed);
    expect(checksForStep(failed, 1)).toEqual([]);
  });
});

function step(
  order: number,
  action: JourneyStepInput['action'],
  selector: string | null,
  value: string | null = null,
): JourneyStepInput {
  return { order, action, selector, value, metadata: {} };
}

function check(
  status: JourneyValidationCheck['status'],
  stepOrder: number,
): JourneyValidationCheck {
  return { key: `check-${status}`, status, message: `${status} explanation`, stepOrder };
}
