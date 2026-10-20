/**
 * Files dropped from the computer onto an element, with Pragmatic drag and drop's external
 * adapter (`dropTargetForExternal`, `containsFiles`, `getFiles`). Use it wherever a page has a
 * file button, so the same file can be dropped instead: the button stays the keyboard way.
 *
 * `fileDragActive` is true while files are dragged anywhere over the page (to show the drop
 * target), and `over` while they are over the element. Only files `accept` takes are passed on;
 * with none left, `onReject` explains why.
 */
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import {
  dropTargetForExternal,
  monitorForExternal,
} from '@atlaskit/pragmatic-drag-and-drop/external/adapter';
import { containsFiles } from '@atlaskit/pragmatic-drag-and-drop/utils/contains-files';
import { getFiles } from '@atlaskit/pragmatic-drag-and-drop/utils/get-files';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

type FileDropOptions = {
  /** Whether a dropped file is one this target takes (by name or type). */
  accept: (file: File) => boolean;
  onFiles: (files: File[]) => void;
  /** Called when a drop held files but none this target takes. */
  onReject?: (files: File[]) => void;
  /** Turns the target off (for example while a previous file is still being read). */
  disabled?: boolean;
};

export function useFileDrop<T extends HTMLElement>(options: FileDropOptions) {
  const ref = useRef<T>(null);
  const [element, setElement] = useState<T | null>(null);
  const [over, setOver] = useState(false);
  const [fileDragActive, setFileDragActive] = useState(false);

  // Registrations outlive renders, so they read the latest options through a ref.
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  useLayoutEffect(() => {
    if (ref.current !== element) setElement(ref.current);
  });

  useEffect(() => {
    if (!element) return;
    return combine(
      monitorForExternal({
        canMonitor: containsFiles,
        onDragStart: () => setFileDragActive(true),
        onDrop: () => setFileDragActive(false),
      }),
      dropTargetForExternal({
        element,
        canDrop: (args) => containsFiles(args) && !latest.current.disabled,
        onDragEnter: () => setOver(true),
        onDragLeave: () => setOver(false),
        onDrop: ({ source }) => {
          setOver(false);
          const files = getFiles({ source });
          const accepted = files.filter(latest.current.accept);
          if (accepted.length > 0) latest.current.onFiles(accepted);
          else if (files.length > 0) latest.current.onReject?.(files);
        },
      }),
    );
  }, [element]);

  return { ref, over, fileDragActive };
}
