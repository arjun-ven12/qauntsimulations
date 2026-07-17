import { describe, expect, it } from 'vitest';
import {
  addStep,
  changeAction,
  checkoutTemplate,
  duplicateStep,
  formErrors,
  journeyDefaults,
  moveStep,
  newStep,
  removeStep,
  reviewFor,
  toJourneyInput,
} from './journey-form.model.js';

describe('Journey Builder model', () => {
  it('starts with one contiguous GOTO step', () => {
    const value = journeyDefaults('environment-1');
    expect(value.steps).toMatchObject([{ order: 0, action: 'GOTO' }]);
  });

  it('populates the exact checkout template contract', () => {
    const value = checkoutTemplate('environment-1');
    expect(value.name).toBe('Checkout Purchase Flow');
    expect(value.steps).toHaveLength(12);
    expect(value.steps.map((step) => step.action)).toEqual([
      'GOTO',
      'ASSERT_VISIBLE',
      'CLICK',
      'ASSERT_VISIBLE',
      'CLICK',
      'CLICK',
      'ASSERT_VISIBLE',
      'FILL',
      'CLICK',
      'WAIT_FOR',
      'WAIT_FOR',
      'ASSERT_VISIBLE',
    ]);
    expect(value.steps[6]?.metadata).toMatchObject({
      screenshotCheckpoint: true,
      screenshotCheckpointName: 'checkout-form-loaded',
    });
    expect(value.steps[11]?.metadata).toMatchObject({
      screenshotCheckpoint: true,
      screenshotCheckpointName: 'order-confirmation',
    });
    expect(value.completionCondition).toEqual({
      type: 'VISIBLE',
      selector: '[data-testid="order-id"]',
    });
  });

  it('adds a step and keeps positions contiguous', () => {
    const steps = addStep(journeyDefaults().steps, 'CLICK');
    expect(steps.map((step) => step.order)).toEqual([0, 1]);
  });

  it('removes a step without leaving a position gap', () => {
    const steps = removeStep(checkoutTemplate('environment-1').steps, 3);
    expect(steps).toHaveLength(11);
    expect(steps.map((step) => step.order)).toEqual([...Array(11).keys()]);
  });

  it('duplicates with a new frontend identity', () => {
    const source = checkoutTemplate('environment-1').steps;
    const steps = duplicateStep(source, 2);
    expect(steps[2]?.action).toBe(steps[3]?.action);
    expect(steps[2]?.clientId).not.toBe(steps[3]?.clientId);
    expect(steps.map((step) => step.order)).toEqual([...Array(13).keys()]);
  });

  it('moves a step up or down and renumbers it', () => {
    const source = checkoutTemplate('environment-1').steps;
    const moved = moveStep(source, 2, -1);
    expect(moved[1]?.selector).toBe('[data-testid="add-to-cart"]');
    expect(moved.map((step) => step.order)).toEqual([...Array(12).keys()]);
  });

  it('provides action-specific defaults', () => {
    expect(newStep('WAIT_FOR')).toMatchObject({
      action: 'WAIT_FOR',
      metadata: { expectedState: 'VISIBLE', timeoutMs: 30_000 },
    });
    expect(newStep('FILL')).toMatchObject({ action: 'FILL', selector: '', value: '' });
    expect(newStep('GOTO')).toMatchObject({ action: 'GOTO', selector: null, value: '/' });
  });

  it('changes action without losing screenshot metadata', () => {
    const source = {
      ...newStep('CLICK'),
      metadata: {
        screenshotCheckpoint: true,
        screenshotCheckpointName: 'before-submit',
      },
    };
    expect(changeAction(source, 'WAIT_FOR')).toMatchObject({
      action: 'WAIT_FOR',
      metadata: {
        expectedState: 'VISIBLE',
        timeoutMs: 30_000,
        screenshotCheckpoint: true,
        screenshotCheckpointName: 'before-submit',
      },
    });
  });

  it('requires action-specific fields and checkpoint names', () => {
    const value = journeyDefaults('environment-1');
    value.name = 'Example';
    value.steps = [
      {
        ...newStep('WAIT_FOR'),
        selector: '',
        metadata: { expectedState: 'VISIBLE', timeoutMs: 0, screenshotCheckpoint: true },
      },
    ];
    expect(formErrors(value)).toMatchObject({
      'step-0-selector': 'Selector is required.',
      'step-0-timeout': 'Enter a positive timeout.',
      'step-0-checkpoint': 'Checkpoint name is required.',
      completionSelector: 'Completion selector is required.',
    });
  });

  it('updates review totals for screenshots and assertions', () => {
    expect(reviewFor(checkoutTemplate('environment-1'))).toEqual({
      executableSteps: 12,
      screenshots: 2,
      assertions: 4,
    });
  });

  it('submits only backend fields and preserves the form value', () => {
    const value = checkoutTemplate('environment-1');
    const firstClientId = value.steps[0]!.clientId;
    const input = toJourneyInput(value);
    expect(input.steps[0]).not.toHaveProperty('clientId');
    expect(value.steps[0]?.clientId).toBe(firstClientId);
    expect(input.steps.map((step) => step.order)).toEqual([...Array(12).keys()]);
  });
});
