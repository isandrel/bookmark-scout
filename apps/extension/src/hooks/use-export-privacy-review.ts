import { useState } from 'react';
import type { BookmarkTreeNode } from '@/types';

type PendingExportReview = {
  items: ExportPrivacyItem[];
  write: (nodes: BookmarkTreeNode[]) => void;
  onError: (error: unknown) => void;
  original: BookmarkTreeNode[];
  redacted: BookmarkTreeNode[];
};

type ExportReviewRequest = {
  /** The nodes the export is built from; they are redacted if the user chooses to. */
  nodes: BookmarkTreeNode[];
  /** The bookmarks that actually reach the file, when fewer than `nodes` (AI context limits). */
  reviewNodes?: BookmarkTreeNode[];
  includeUrls: boolean;
  /** Reports a failure of a write that runs after the dialog closes. */
  onError: (error: unknown) => void;
};

/**
 * Runs an export directly when it holds nothing sensitive, and otherwise holds it until the user
 * picks the original or redacted file in `ExportPrivacyReviewDialog`, or cancels.
 */
export function useExportPrivacyReview() {
  const { value: sensitiveParams } = useSetting('privacyScannerSensitiveParams');
  const { value: emailDetection } = useSetting('privacyScannerEmailDetection');
  const [pending, setPending] = useState<PendingExportReview | null>(null);

  const reviewBeforeExport = (
    request: ExportReviewRequest,
    write: (nodes: BookmarkTreeNode[]) => void,
  ) => {
    const options = { sensitiveParams, emailDetection, includeUrls: request.includeUrls };
    const items = reviewExportPrivacy(request.reviewNodes ?? request.nodes, options);
    if (items.length === 0) {
      write(request.nodes);
      return;
    }
    setPending({
      items,
      write,
      onError: request.onError,
      original: request.nodes,
      redacted: redactBookmarkNodes(request.nodes, options),
    });
  };

  const finish = (choice: 'original' | 'redacted') => {
    if (!pending) return;
    setPending(null);
    try {
      pending.write(choice === 'redacted' ? pending.redacted : pending.original);
    } catch (error) {
      pending.onError(error);
    }
  };

  return {
    reviewBeforeExport,
    dialogProps: {
      items: pending?.items ?? null,
      onCancel: () => setPending(null),
      onExportOriginal: () => finish('original'),
      onExportRedacted: () => finish('redacted'),
    },
  };
}
