import { describe, expect, it } from 'vitest';
import {
  invariantDefaults,
  invariantFormErrors,
  invariantTemplates,
  templateName,
  templateValue,
  toInvariantInput,
} from './invariant-form.model.js';

describe('Invariant form model', () => {
  it('selects the exact duplicate-payment template contract', () => {
    const value = templateValue(invariantTemplates[0]!);
    expect(toInvariantInput(value)).toEqual({
      name: 'No duplicate payment',
      description: 'A customer must never be charged twice for one checkout.',
      type: 'NO_DUPLICATE_PAYMENT',
      severity: 'CRITICAL',
      enabled: true,
      configuration: { requestPatterns: ['/api/payments'], methods: ['POST'] },
    });
  });

  it('selects the exact duplicate-order template contract', () => {
    const value = templateValue(invariantTemplates[1]!);
    expect(toInvariantInput(value)).toEqual({
      name: 'No duplicate order',
      description: 'A checkout must never create more than one order.',
      type: 'NO_DUPLICATE_ORDER',
      severity: 'HIGH',
      enabled: true,
      configuration: {
        requestPatterns: ['/api/orders'],
        methods: ['POST'],
        orderIdSelector: '[data-testid="order-id"]',
      },
    });
  });

  it('preserves supported severity selection and the enabled toggle', () => {
    const value = { ...templateValue(invariantTemplates[0]!), severity: 'LOW' as const, enabled: false };
    expect(toInvariantInput(value)).toMatchObject({ severity: 'LOW', enabled: false });
  });

  it('exposes only the two supported evaluator identifiers', () => {
    expect(invariantTemplates.map((template) => template.type)).toEqual([
      'NO_DUPLICATE_PAYMENT',
      'NO_DUPLICATE_ORDER',
    ]);
    expect(templateName('NO_DUPLICATE_PAYMENT')).toBe('No duplicate payment');
    expect(templateName('NO_DUPLICATE_ORDER')).toBe('No duplicate order');
  });

  it('rejects incomplete and unsupported structured values', () => {
    const value = invariantDefaults();
    value.description = 'short';
    value.configuration.requestPatterns = ['.*'];
    value.configuration.methods = [];
    expect(invariantFormErrors(value)).toMatchObject({
      name: expect.any(String),
      description: expect.any(String),
      requestPatterns: expect.any(String),
      methods: expect.any(String),
    });
  });
});
