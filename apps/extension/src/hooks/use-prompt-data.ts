/**
 * What a task's placeholders read from storage (the user's tags, "About me"), for prompt editor
 * lists and previews, loaded when `taskId` changes; empty until loaded or while there is no task.
 */
import { useEffect, useState } from 'react';

export function usePromptData(taskId: PromptTaskId | undefined): PromptData {
  const [data, setData] = useState<PromptData>({});
  useEffect(() => {
    setData({});
    if (!taskId) return;
    let current = true;
    void loadPromptData(taskId).then((loaded) => {
      if (current) setData(loaded);
    });
    return () => {
      current = false;
    };
  }, [taskId]);
  return data;
}
