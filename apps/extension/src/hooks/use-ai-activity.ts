/**
 * React hook over `lib/ai-activity-storage.ts`, which stays free of React for the background.
 */

/** Live log and recording switch for React, following calls made from any page. */
export function useAIActivity(): {
  entries: AIActivityEntry[];
  recording: boolean;
  setRecording: (recording: boolean) => Promise<void>;
} {
  const { value: entries } = useStoredValue(aiActivityValue);
  const { value: recording } = useStoredValue(aiActivityRecordingValue);
  return {
    entries,
    recording,
    setRecording: async (next: boolean) => {
      await aiActivityRecordingValue.set(next);
      // Turning recording off also drops what was recorded.
      if (!next) await clearAIActivity();
    },
  };
}
