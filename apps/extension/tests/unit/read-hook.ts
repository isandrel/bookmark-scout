import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

type ProbeProps = { useHook: () => unknown; report: (value: unknown) => void };

// At module level, so React sees one component type across renders.
function Probe({ useHook, report }: ProbeProps) {
  report(useHook());
  return null;
}

/** What a hook returns in one server render, for a hook that only runs inside a component. */
export function readHook<T>(useHook: () => T): T {
  let found: { value: T } | undefined;
  renderToStaticMarkup(
    createElement(Probe, {
      useHook,
      // Probe passes back what useHook returned, so the value is a T.
      report: (value) => {
        found = { value: value as T };
      },
    }),
  );
  if (!found) throw new Error('The hook probe did not render');
  return found.value;
}
