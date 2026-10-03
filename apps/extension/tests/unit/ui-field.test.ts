import { parseHTML } from 'linkedom';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OptionsPanel } from '@/components/options/OptionsPanel';
import { Field, type FieldControlProps } from '@/components/ui/field';

/** Parses rendered markup into a body element to query. */
function parse(html: string) {
  return parseHTML(`<!doctype html><html><body>${html}</body></html>`).document.body;
}

/** Renders a Field with an input and returns its markup as a parsed body. */
function renderField(props: Omit<Parameters<typeof Field>[0], 'children'>) {
  const controls: FieldControlProps[] = [];
  const html = renderToStaticMarkup(
    createElement(Field, {
      ...props,
      children: (control: FieldControlProps) => {
        controls.push(control);
        return createElement('input', control);
      },
    }),
  );
  return { root: parse(html), control: controls[0] };
}

describe('Field', () => {
  it('labels the control and describes it by its description', () => {
    const { root, control } = renderField({
      id: 'name',
      label: 'Name',
      description: 'Shown in lists',
    });
    expect(control).toEqual({
      id: 'name',
      'aria-labelledby': 'name-label',
      'aria-describedby': 'name-description',
    });
    const label = root.querySelector('label');
    expect(label?.id).toBe('name-label');
    expect(label?.getAttribute('for')).toBe('name');
    expect(root.querySelector('#name-description')?.textContent).toBe('Shown in lists');
    expect(root.querySelector('[role="alert"]')).toBeNull();
  });

  it('marks the control invalid and announces the error', () => {
    const { root, control } = renderField({
      id: 'key',
      label: 'API Key',
      description: 'Stored locally',
      error: 'Wrong format',
    });
    expect(control['aria-describedby']).toBe('key-description key-error');
    expect(control['aria-invalid']).toBe(true);
    const alert = root.querySelector('[role="alert"]');
    expect(alert?.id).toBe('key-error');
    expect(alert?.textContent).toBe('Wrong format');
  });

  it('describes nothing when there is no description or error', () => {
    const { control } = renderField({ id: 'plain', label: 'Plain' });
    expect(control).toEqual({ id: 'plain', 'aria-labelledby': 'plain-label' });
  });

  it('puts the badge after the label and the actions after the control in a setting row', () => {
    const { root } = renderField({
      id: 'setting-theme',
      label: 'Theme',
      description: 'Light or dark',
      layout: 'setting',
      badge: createElement('span', { 'data-testid': 'badge' }, 'Modified'),
      actions: createElement('button', { type: 'button' }, 'Reset'),
    });
    const [left, right] = Array.from(root.children);
    expect(left.querySelector('label + [data-testid="badge"]')).not.toBeNull();
    expect(right.querySelector('input + button')?.textContent).toBe('Reset');
  });
});

describe('OptionsPanel', () => {
  it('names the section by its heading and ids its description', () => {
    const html = renderToStaticMarkup(
      createElement(
        OptionsPanel,
        {
          id: 'ai-activity',
          'data-testid': 'ai-activity',
          title: 'AI activity',
          description: 'Recent calls',
          actions: createElement('button', { type: 'button' }, 'Record'),
        },
        createElement('ul'),
      ),
    );
    const section = parse(html).querySelector('section');
    expect(section?.getAttribute('aria-labelledby')).toBe('ai-activity-heading');
    expect(section?.dataset.testid).toBe('ai-activity');
    expect(section?.querySelector('#ai-activity-heading')?.textContent).toBe('AI activity');
    expect(section?.querySelector('#ai-activity-description')?.textContent).toBe('Recent calls');
    expect(section?.querySelector('button')?.textContent).toBe('Record');
  });
});
