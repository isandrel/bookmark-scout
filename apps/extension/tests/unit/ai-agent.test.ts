import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { saveStoredAIProviderConfig } from '@/lib/ai-provider-storage';
import { addAIService } from '@/lib/ai-services-storage';
import { defaultSettings } from '@/lib/settings-schema';
import { saveSettings } from '@/lib/settings-storage';
import { supportsWebSearch } from '@/services/ai-agent';
import { askAISetup } from '@/services/ask-ai-background';
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
    const webSearch = async () => {
      const setup = await askAISetup('chat');
      return setup.ok && setup.webSearch;
    };
    expect(await webSearch()).toBe(false);
    await saveSettings({ askAiWebSearch: true });
    expect(await webSearch()).toBe(true);
  });

  it('passes on the Most Steps per Answer setting, the prompt, and the actions turned on', async () => {
    const service = await addAIService('openai');
    await saveStoredAIProviderConfig(service.id, { apiKey: 'sk-synthetic' });
    const setup = async () => {
      const result = await askAISetup('chat');
      if (!result.ok) throw new Error(result.error);
      return result;
    };
    expect((await setup()).maxSteps).toBe(defaultSettings.askAiMaxSteps);
    expect((await setup()).tools).toContain('listFolders');
    expect((await setup()).system).toContain(formatToday());
    await saveSettings({ askAiMaxSteps: 3, askAiDisabledActions: ['listFolders'] });
    expect((await setup()).maxSteps).toBe(3);
    expect((await setup()).tools).not.toContain('listFolders');
  });

  it('says what to fix when no AI service is set up', async () => {
    expect(await askAISetup('chat')).toMatchObject({ ok: false });
  });
});
