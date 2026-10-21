/**
 * The English text agents and models read, from `config/ai/agent-text.toml`: what each bookmark
 * action does and what each field of its input and output means (the JSON Schema descriptions
 * Ask AI and local agents see), and the fields of the answers models give. Kept out of the code
 * so it is edited in one place; models read it, users never see it, so it is not translated.
 * No React: the background, the pages, and the AI host page use it.
 */
import { z } from 'zod';

const texts = readConfig(
  'ai/agent-text',
  z.record(z.string(), z.record(z.string(), z.string().min(1))),
);

/** The text at `key` ("<section>.<field>"); throws for a key the file lacks. */
export function agentText(key: string): string {
  const [section = '', field = ''] = key.split('.');
  const text = texts[section]?.[field];
  if (text === undefined) throw new Error(`No text "${key}" in config/ai/agent-text.toml`);
  return text;
}

/** Every key the file defines, for the test that checks each one is used. */
export function agentTextKeys(): string[] {
  return Object.entries(texts).flatMap(([section, fields]) =>
    Object.keys(fields).map((field) => `${section}.${field}`),
  );
}
