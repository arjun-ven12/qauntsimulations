import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { builtInTemplate } from './template-model.js';
import { TemplateManager } from './template-manager.js';

describe('TemplateManager', () => {
  it('renders searchable immutable built-ins and complete custom-template actions', () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <TemplateManager
          builtIns={[
            builtInTemplate('PROJECT', 'project-blank', 'Blank project', 'Start clean.', {
              name: '',
            }),
          ]}
          category="PROJECT"
          onApply={() => undefined}
          payloadSchema={z.object({ name: z.string() })}
          preview={(payload) => <span>{payload.name || 'Untitled'}</span>}
          value={{ name: 'Current project' }}
        />
      </QueryClientProvider>,
    );
    expect(html).toContain('Search templates');
    expect(html).toContain('Filter templates');
    expect(html).toContain('Blank project');
    expect(html).toContain('Built-in');
    expect(html).toContain('Apply template');
    expect(html).toContain('Save current');
    expect(html).toContain('Import JSON');
    expect(html).toContain('Export JSON');
    expect(html).not.toContain('Delete');
  });
});
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
