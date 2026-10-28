import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBookmarkHistoryCommands } from '@/hooks/use-bookmark-history';
import * as history from '@/services/bookmark-history';
import { readHook } from './read-hook';

/** The manager's undo and redo commands, from one render. */
function commands() {
  return readHook(useBookmarkHistoryCommands);
}

/** Steps that wait until the test lets them finish, in the order they started. */
function heldSteps() {
  const steps: { step: string; finish: () => void }[] = [];
  const hold = (step: string) =>
    new Promise<null>((resolve) => {
      steps.push({ step, finish: () => resolve(null) });
    });
  vi.spyOn(history, 'undoBookmarkChange').mockImplementation(() => hold('undo'));
  vi.spyOn(history, 'redoBookmarkChange').mockImplementation(() => hold('redo'));
  return steps;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('undo and redo in the manager', () => {
  it('runs a redo pressed while an undo runs once the undo is done, in order', async () => {
    const steps = heldSteps();
    const { undo, redo } = commands();
    undo();
    redo();
    await settle();
    expect(steps.map(({ step }) => step)).toEqual(['undo']);
    steps[0]?.finish();
    await settle();
    expect(steps.map(({ step }) => step)).toEqual(['undo', 'redo']);
    steps[1]?.finish();
  });

  it('drops a held key repeating while a step runs, so letting go stops undoing', async () => {
    const steps = heldSteps();
    const { undo } = commands();
    undo();
    undo(true);
    undo(true);
    await settle();
    steps[0]?.finish();
    await settle();
    expect(steps).toHaveLength(1);
    // Once nothing runs, a repeat is a step again.
    undo(true);
    await settle();
    expect(steps).toHaveLength(2);
    steps[1]?.finish();
  });
});
