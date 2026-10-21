import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { saveStoredAIProviderConfig } from '@/lib/ai-provider-storage';
import { addAIService } from '@/lib/ai-services-storage';
import { defaultSettings } from '@/lib/settings-schema';
import { saveSettings } from '@/lib/settings-storage';
import { ASK_AI_WEB_SEARCH_TOOL, createAskAIAgent, supportsWebSearch } from '@/services/ai-agent';
import { buildAskAIAgent } from '@/services/ai-agent.lazy';
import { formatToday, getPromptVariables, PROMPT_TASKS } from '@/services/prompt-config';

// Wraps the real builder, so the options Ask AI passes can be read.
vi.mock('@/services/ai-agent.lazy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/ai-agent.lazy')>();
  return { ...actual, buildAskAIAgent: vi.fn(actual.buildAskAIAgent) };
});

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

  it('stops after as many model calls as the Most Steps per Answer setting', async () => {
    const service = await addAIService('openai');
    await saveStoredAIProviderConfig(service.id, { apiKey: 'sk-synthetic' });
    const maxSteps = async () => {
      vi.mocked(buildAskAIAgent).mockClear();
      await createAskAIAgent();
      return vi.mocked(buildAskAIAgent).mock.calls[0]?.[0].maxSteps;
    };
    expect(await maxSteps()).toBe(defaultSettings.askAiMaxSteps);
    await saveSettings({ askAiMaxSteps: 3 });
    expect(await maxSteps()).toBe(3);
  });
});
