/**
 * Password protection for backup files, with the browser's Web Crypto only: the password becomes
 * an AES-GCM 256 key through PBKDF2-SHA-256 with a random salt and the iteration count from
 * `config/data/backup.toml`, and the text is encrypted with a random IV. Everything needed to open
 * the file except the password (the salt, the IV, and the iteration count) is written beside the
 * text, so the count can be raised later and older files still open.
 *
 * The readable header (`additionalData`) is authenticated with the text: GCM's tag fails when a
 * byte of either was changed, as it does for a wrong password, so a changed file is never
 * imported. The two cannot be told apart. The password is never stored or logged, and there is
 * no way to recover it.
 */
import { z } from 'zod';

/** Random salt length in bytes (NIST SP 800-132 asks for at least 16). */
const SALT_BYTES = 16;
/** AES-GCM's standard 96-bit IV. */
const IV_BYTES = 12;
const KEY_BITS = 256;

/** How a protected part of a file was encrypted, written beside it. */
export const backupEncryptionSchema = z.strictObject({
  kdf: z.strictObject({
    name: z.literal('PBKDF2'),
    hash: z.literal('SHA-256'),
    iterations: z.number().int().positive(),
    salt: z.string().min(1),
  }),
  cipher: z.strictObject({
    name: z.literal('AES-GCM'),
    length: z.literal(KEY_BITS),
    iv: z.string().min(1),
  }),
});

export type BackupEncryption = z.infer<typeof backupEncryptionSchema>;

/** The password was wrong, or the file was changed after it was saved. */
export class BackupPasswordError extends Error {
  constructor() {
    super(t('backup_errorPassword'));
    this.name = 'BackupPasswordError';
  }
}

const encoder = new TextEncoder();

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: KEY_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypts `text` with `password`, binding `header` (left readable) to it. Resolves to the
 * parameters and the encrypted text, both for the file.
 */
export async function encryptBackupText(
  text: string,
  password: string,
  header: string,
  iterations: number = BACKUP_LIMITS.pbkdf2Iterations.value,
): Promise<{ encryption: BackupEncryption; data: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt, iterations);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(header) },
    key,
    encoder.encode(text),
  );
  return {
    encryption: {
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: bytesToBase64(salt) },
      cipher: { name: 'AES-GCM', length: KEY_BITS, iv: bytesToBase64(iv) },
    },
    data: bytesToBase64(new Uint8Array(encrypted)),
  };
}

/** Whether a file's iteration count is one this release opens (`[encryption]`'s min to max). */
export function isAcceptedIterationCount(iterations: number): boolean {
  const { min, max } = BACKUP_LIMITS.pbkdf2Iterations;
  return iterations >= min && iterations <= max;
}

/**
 * The text `encryptBackupText` encrypted. Rejects with `BackupPasswordError` for a wrong password
 * or a changed file (header, parameters, or text), and with `error_invalidBackupFile` for
 * parameters this release does not accept.
 */
export async function decryptBackupText(
  encryption: BackupEncryption,
  data: string,
  password: string,
  header: string,
): Promise<string> {
  if (!isAcceptedIterationCount(encryption.kdf.iterations)) {
    throw new Error(t('error_invalidBackupFile'));
  }
  let salt: Uint8Array<ArrayBuffer>;
  let iv: Uint8Array<ArrayBuffer>;
  let encrypted: Uint8Array<ArrayBuffer>;
  try {
    salt = base64ToBytes(encryption.kdf.salt);
    iv = base64ToBytes(encryption.cipher.iv);
    encrypted = base64ToBytes(data);
  } catch {
    throw new BackupPasswordError();
  }
  const key = await deriveKey(password, salt, encryption.kdf.iterations);
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: encoder.encode(header) },
      key,
      encrypted,
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new BackupPasswordError();
  }
}
