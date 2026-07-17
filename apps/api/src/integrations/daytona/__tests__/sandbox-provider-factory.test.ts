import { describe, expect, it } from 'vitest';
import { createSandboxProvider, DaytonaSandboxProvider, renderSandboxCommand } from '../daytona-sandbox.service.js';

describe('Daytona sandbox provider', () => {
  it('requires credentials and maps the supported EU target', () => {
    expect(() => createSandboxProvider({ daytonaApiKey: '', target: 'eu' })).toThrow('DAYTONA_API_KEY');
    expect(createSandboxProvider({ daytonaApiKey: 'test-key', target: 'eu' })).toBeInstanceOf(DaytonaSandboxProvider);
  });

  it('quotes every command token before passing fixed commands to the SDK shell', () => {
    expect(renderSandboxCommand({ executable: 'node', args: ['worker.mjs', "a'b"] }))
      .toBe("'node' 'worker.mjs' 'a'\\''b'");
  });
});
