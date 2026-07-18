import type { Environment } from '../../services/environment-api.js';

export function environmentListSummary(environments: Environment[]) {
  return {
    total: environments.length,
    ready: environments.filter((environment) => environment.validationStatus === 'READY').length,
    defaults: environments.filter((environment) => environment.isDefault).length,
    attention: environments.filter((environment) => environment.validationStatus !== 'READY').length,
  };
}

export function connectionCompleteness(environment: Environment) {
  return [environment.baseUrl, environment.apiBaseUrl, environment.healthCheckUrl].filter(
    (value) => Boolean(value?.trim()),
  ).length;
}

export function resetSchedule(environment: Environment) {
  if (environment.resetConfiguration.mode === 'NONE') return 'No automatic reset';
  const { beforeEachWorld, afterEachWorld } = environment.resetConfiguration;
  if (beforeEachWorld && afterEachWorld) return 'Before and after each World';
  if (beforeEachWorld) return 'Before each World';
  if (afterEachWorld) return 'After each World';
  return 'Run manually';
}

export function validationResultSummary(environment: Environment) {
  if (environment.validationResults.length === 0) return 'No checks recorded';
  const passed = environment.validationResults.filter((result) => result.status === 'PASS').length;
  const warnings = environment.validationResults.filter(
    (result) => result.status === 'WARNING',
  ).length;
  const failed = environment.validationResults.filter((result) => result.status === 'FAIL').length;
  return [
    `${passed} passed`,
    ...(warnings ? [`${warnings} warning${warnings === 1 ? '' : 's'}`] : []),
    ...(failed ? [`${failed} failed`] : []),
  ].join(' · ');
}

export function readableEnvironmentValue(value: string) {
  return value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
