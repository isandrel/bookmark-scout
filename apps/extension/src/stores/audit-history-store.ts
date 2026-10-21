/**
 * Whether the manager's History is open, and which record to show first: the History button opens
 * it, and a result's View in History opens it on that change's record.
 */
import { create } from 'zustand';

type AuditHistoryView = {
  open: boolean;
  /** The record to expand and scroll to when it opens. */
  focusId: string | null;
  openHistory: (operationId?: string) => void;
  closeHistory: () => void;
};

export const useAuditHistoryView = create<AuditHistoryView>()((set) => ({
  open: false,
  focusId: null,
  openHistory: (operationId) => set({ open: true, focusId: operationId ?? null }),
  closeHistory: () => set({ open: false, focusId: null }),
}));
