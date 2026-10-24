/**
 * Password protection of backup files (`lib/backup-crypto.ts`) and how a protected file opens:
 * the manifest stays readable, a wrong password or a changed byte imports nothing, and the
 * iteration count comes from the config.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { saveStoredAIProviderConfig } from '@/lib/ai-provider-storage';
import { addAIService } from '@/lib/ai-services-storage';
import { BACKUP_LIMITS } from '@/lib/backup-config';
import {
  BackupPasswordError,
  decryptBackupText,
  encryptBackupText,
  isAcceptedIterationCount,
} from '@/lib/backup-crypto';
import { saveSettings } from '@/lib/settings-storage';
import { makeBackupFile, openBackup, unlockBackup } from '@/services/backup';
import { stubManifestVersion } from './backup-helpers';

const FAST = BACKUP_LIMITS.pbkdf2Iterations.min;

beforeEach(async () => {
  fakeBrowser.reset();
  await saveSettings({ language: 'en', theme: 'dark' });
  setLanguage('en');
  stubManifestVersion();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Flips one base64 character of `text` at `index` to another valid one. */
const flip = (text: string, index: number) =>
  `${text.slice(0, index)}${text[index] === 'A' ? 'B' : 'A'}${text.slice(index + 1)}`;

describe('backup password protection', () => {
  it('round-trips text, with a random salt and IV each time', async () => {
    const one = await encryptBackupText('secret text', 'correct horse', 'header', FAST);
    const two = await encryptBackupText('secret text', 'correct horse', 'header', FAST);
    expect(one.encryption.kdf).toMatchObject({ name: 'PBKDF2', hash: 'SHA-256', iterations: FAST });
    expect(one.encryption.cipher).toMatchObject({ name: 'AES-GCM', length: 256 });
    expect(one.encryption.kdf.salt).not.toBe(two.encryption.kdf.salt);
    expect(one.encryption.cipher.iv).not.toBe(two.encryption.cipher.iv);
    expect(one.data).not.toContain('secret');
    expect(await decryptBackupText(one.encryption, one.data, 'correct horse', 'header')).toBe(
      'secret text',
    );
  });

  it('refuses a wrong password, a changed byte, and a changed header the same way', async () => {
    const { encryption, data } = await encryptBackupText('text', 'right password', 'header', FAST);
    await expect(decryptBackupText(encryption, data, 'wrong password', 'header')).rejects.toThrow(
      BackupPasswordError,
    );
    await expect(
      decryptBackupText(encryption, flip(data, 4), 'right password', 'header'),
    ).rejects.toThrow('The password is wrong, or the file was changed after it was saved.');
    await expect(
      decryptBackupText(encryption, data, 'right password', 'header changed'),
    ).rejects.toThrow(BackupPasswordError);
  });

  it('uses the configured iteration count and refuses a file asking for more than allowed', async () => {
    const { encryption, data } = await encryptBackupText('text', 'password!', 'h');
    expect(encryption.kdf.iterations).toBe(BACKUP_LIMITS.pbkdf2Iterations.value);
    expect(isAcceptedIterationCount(BACKUP_LIMITS.pbkdf2Iterations.max + 1)).toBe(false);
    expect(isAcceptedIterationCount(BACKUP_LIMITS.pbkdf2Iterations.min - 1)).toBe(false);
    const greedy = {
      ...encryption,
      kdf: { ...encryption.kdf, iterations: BACKUP_LIMITS.pbkdf2Iterations.max + 1 },
    };
    await expect(decryptBackupText(greedy, data, 'password!', 'h')).rejects.toThrow(
      'Invalid backup file',
    );
  });

  it('keeps the manifest readable and opens the protected parts only with the password', async () => {
    const service = await addAIService('openai', 'Work');
    await saveStoredAIProviderConfig(service.id, { apiKey: 'sk-synthetic-protected' });
    const built = await makeBackupFile({
      categories: ['settings', 'aiServices', 'aiServiceKeys'],
      protection: 'all',
      password: 'a long enough password',
    });
    expect(built.filename).toMatch(/_protected\.json$/);
    expect(built.json).not.toContain('sk-synthetic-protected');
    expect(built.json).not.toContain('dark');
    const file = JSON.parse(built.json);
    expect(file).toMatchObject({ format: 'bookmark-scout-backup', formatVersion: 2 });
    expect(file.sections).toEqual({});

    const opened = await openBackup(built.json);
    if (!opened) throw new Error('not a backup');
    expect(opened.parts.map(({ id, locked, count }) => ({ id, locked, count }))).toEqual([
      { id: 'settings', locked: true, count: 2 },
      { id: 'aiServices', locked: true, count: 1 },
      { id: 'aiServiceKeys', locked: true, count: 1 },
    ]);
    await expect(unlockBackup(opened, 'not the password')).rejects.toThrow(BackupPasswordError);

    const unlocked = await unlockBackup(opened, 'a long enough password');
    expect(unlocked.parts.every((part) => !part.locked && !part.invalid)).toBe(true);
    expect(JSON.stringify(unlocked.sections)).toContain('sk-synthetic-protected');
  });

  it('protects only the keys when asked, leaving the other parts readable', async () => {
    const service = await addAIService('openai', 'Work');
    await saveStoredAIProviderConfig(service.id, { apiKey: 'sk-synthetic-keys-only' });
    const built = await makeBackupFile({
      categories: ['settings', 'aiServices', 'aiServiceKeys'],
      protection: 'secrets',
      password: 'a long enough password',
    });
    expect(built.json).not.toContain('sk-synthetic-keys-only');
    const opened = await openBackup(built.json);
    expect(opened?.parts.map(({ id, locked }) => [id, locked])).toEqual([
      ['settings', false],
      ['aiServices', false],
      ['aiServiceKeys', true],
    ]);
    expect(Object.keys(opened?.sections ?? {})).toEqual(['settings', 'aiServices']);
  });

  it('refuses a protected file whose manifest was changed', async () => {
    const built = await makeBackupFile({
      categories: ['settings'],
      protection: 'all',
      password: 'a long enough password',
    });
    const file = JSON.parse(built.json);
    file.categories[0].count = 99;
    const opened = await openBackup(JSON.stringify(file));
    if (!opened) throw new Error('not a backup');
    await expect(unlockBackup(opened, 'a long enough password')).rejects.toThrow(
      BackupPasswordError,
    );
  });
});
