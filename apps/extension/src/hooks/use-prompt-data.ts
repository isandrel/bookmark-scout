/**
 * What a task's placeholders read from storage (the user's tags, "About me"), and the skills Ask AI
 * can read, for prompt editor lists and previews, loaded when `taskId` changes; empty until loaded
 * or while there is no task.
 */
import { useEffect, useState } from 'react';

/** The skill list, which only a page can build, for a task whose prompt lists skills. */
async function loadSkillCatalog(taskId: PromptTaskId): Promise<PromptData> {
  if (!PROMPT_TASKS[taskId].variables.some((variable) => variable.name === 'skills')) return {};
  const { askAISkillCatalog, createAskAISkills } = await import('@/services/ask-ai-skills.lazy');
  return { skills: askAISkillCatalog(await createAskAISkills()) };
}

export function usePromptData(taskId: PromptTaskId | undefined): PromptData {
  const [data, setData] = useState<PromptData>({});
  useEffect(() => {
    setData({});
    if (!taskId) return;
    let current = true;
    void loadSkillCatalog(taskId)
      .catch((): PromptData => ({}))
      .then((skills) => loadPromptData(taskId, undefined, skills))
      .then((loaded) => {
        if (current) setData(loaded);
      });
    return () => {
      current = false;
    };
  }, [taskId]);
  return data;
}
