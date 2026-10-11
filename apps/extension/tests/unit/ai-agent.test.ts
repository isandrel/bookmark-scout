import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { saveStoredAIProviderConfig } from '@/lib/ai-provider-storage';
import { addAIService } from '@/lib/ai-services-storage';
import { saveSettings } from '@/lib/settings-storage';
import { ASK_AI_WEB_SEARCH_TOOL, createAskAIAgent, supportsWebSearch } from '@/services/ai-agent';
import { formatToday, getPromptVariables, PROMPT_TASKS } from '@/services/prompt-config';

describe('Ask AI setup', () => {
  it('offers web search only for providers with a built-in search tool', () => {
    expect(['openai', 'anthropic', 'google', 'xai'].every(supportsWebSearch)).toBe(true);
    expect(supportsWebSearch('custom')).toBe(false);
    expect(supportsWebSearch('ollama')).toBe(false);
  });

  it('has an editable prompt that knows today', () => {
    expect(PROMPT_TASKS.ask_ai.system).toContain('{{today}}');
    expect(formatToday(new Date('2026-10-02T12:00:00Z'))).toBe('2026-10-02');
    expect(getPromptVariables('ask_ai', {} as Settings).today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('Ask AI web search', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await saveSettings({ language: 'en', aiEnabled: true });
    setLanguage('en');
  });

  it("adds the provider's web search only while the setting is on", async () => {
    const service = await addAIService('openai');
    await saveStoredAIProviderConfig(service.id, { apiKey: 'sk-synthetic' });
    const toolNames = async () => Object.keys((await createAskAIAgent()).tools);

    expect(await toolNames()).not.toContain(ASK_AI_WEB_SEARCH_TOOL);
    await saveSettings({ askAiWebSearch: true });
    expect(await toolNames()).toContain(ASK_AI_WEB_SEARCH_TOOL);
  });
});
