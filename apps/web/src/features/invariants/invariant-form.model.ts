import type {
  Invariant,
  InvariantConfiguration,
  InvariantInput,
  InvariantSeverity,
  InvariantType,
  InvariantValidationStatus,
} from './invariant-api.js';

export interface InvariantFormValue extends InvariantInput {
  validationStatus: InvariantValidationStatus;
}

export interface InvariantTemplate {
  id: 'no-duplicate-payment' | 'no-duplicate-order';
  displayName: string;
  description: string;
  type: InvariantType;
  suggestedSeverity: InvariantSeverity;
  configuration: InvariantConfiguration;
}

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

export function invariantDefaults(): InvariantFormValue {
  return {
    name: '',
    description: '',
    type: 'NO_DUPLICATE_PAYMENT',
    severity: 'CRITICAL',
    enabled: true,
    configuration: { requestPatterns: ['/api/payments'], methods: ['POST'] },
    validationStatus: 'DRAFT',
  };
}

export function templateValue(template: InvariantTemplate): InvariantFormValue {
  return {
    name: template.displayName,
    description: template.description,
    type: template.type,
    severity: template.suggestedSeverity,
    enabled: true,
    configuration: structuredClone(template.configuration),
    validationStatus: 'DRAFT',
  };
}

export function toFormValue(invariant: Invariant): InvariantFormValue {
  if (!invariant.type || !invariant.configuration || !invariant.severity)
    throw new Error('Unsupported legacy Invariants cannot be edited.');
  return {
    name: invariant.name,
    description: invariant.description,
    type: invariant.type,
    severity: invariant.severity,
    enabled: invariant.enabled,
    configuration: structuredClone(invariant.configuration),
    validationStatus: invariant.validationStatus,
  };
}

export function toInvariantInput(value: InvariantFormValue): InvariantInput {
  const configuration: InvariantConfiguration = {
    requestPatterns: value.configuration.requestPatterns.map((pattern) => pattern.trim()),
    methods: [...value.configuration.methods],
    ...(value.type === 'NO_DUPLICATE_ORDER' && value.configuration.orderIdSelector?.trim()
      ? { orderIdSelector: value.configuration.orderIdSelector.trim() }
      : {}),
  };
  return {
    name: value.name.trim(),
    description: value.description.trim(),
    type: value.type,
    severity: value.severity,
    enabled: value.enabled,
    configuration,
  };
}

export function invariantFormErrors(value: InvariantFormValue) {
  const errors: Record<string, string> = {};
  if (!value.name.trim()) errors.name = 'Invariant name is required.';
  else if (value.name.trim().length > 200) errors.name = 'Use 200 characters or fewer.';
  const description = value.description.trim();
  if (description.length < 10) errors.description = 'Describe the rule in at least 10 characters.';
  else if (description.length > 2_000) errors.description = 'Use 2,000 characters or fewer.';
  else if (!isPlainLanguage(description))
    errors.description = 'Use a plain-language rule, not executable content.';
  if (!(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).includes(value.severity))
    errors.severity = 'Select a supported severity.';
  if (!(['NO_DUPLICATE_PAYMENT', 'NO_DUPLICATE_ORDER'] as const).includes(value.type))
    errors.type = 'Select a supported evaluator.';
  if (!value.configuration.requestPatterns.length)
    errors.requestPatterns = 'Add at least one request path.';
  else if (value.configuration.requestPatterns.length > 20)
    errors.requestPatterns = 'Use no more than 20 request paths.';
  else if (
    value.configuration.requestPatterns.some(
      (pattern) => !/^\/[A-Za-z0-9/_-]+$/.test(pattern.trim()) || pattern.trim().length > 200,
    )
  )
    errors.requestPatterns = 'Paths must start with / and contain only letters, numbers, /, _ or -.';
  if (!value.configuration.methods.length)
    errors.methods = 'Select at least one HTTP method.';
  if (
    value.type === 'NO_DUPLICATE_ORDER' &&
    value.configuration.orderIdSelector &&
    (value.configuration.orderIdSelector.length > 500 ||
      /[<>]|javascript:|script\b/i.test(value.configuration.orderIdSelector))
  )
    errors.orderIdSelector = 'Enter a safe selector of 500 characters or fewer.';
  return errors;
}

export function templateName(type: InvariantType) {
  return invariantTemplates.find((template) => template.type === type)?.displayName ?? type;
}

export function valuesMatch(left: InvariantFormValue, right: InvariantFormValue) {
  return JSON.stringify(toInvariantInput(left)) === JSON.stringify(toInvariantInput(right));
}

function isPlainLanguage(value: string) {
  const executablePatterns = [
    /```/,
    /<script\b/i,
    /javascript:/i,
    /\b(?:bash|powershell|cmd\.exe|node|python)\s+(?:-[a-z]+\s+)?["']/i,
    /\b(?:rm|chmod|chown|curl|wget)\s+-/i,
    /\b(?:select\s+.+\s+from|insert\s+into|drop\s+table|alter\s+table|delete\s+from)\b/i,
    /(?:\.\.\/|file:\/\/|\/etc\/|[A-Za-z]:\\)/,
    /diff --git|\*\*\* Begin Patch/i,
    /\bfunction\s*\(|=>\s*[{(]/,
  ];
  return !executablePatterns.some((pattern) => pattern.test(value));
}
