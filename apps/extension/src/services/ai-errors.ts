/**
 * Localized, actionable messages for errors from AI SDK calls. The SDK's own messages are English
 * and technical ("No object generated: response did not match schema", "Failed after 3 attempts.
 * Last error: ..."), so they are never shown as they are.
 */

import type { APICallError, RetryError } from 'ai';

/**
 * The SDK's `isInstance` checks without loading the SDK, which every page would then download:
 * each SDK error carries a global `Symbol.for('vercel.ai.error.<name>')` marker, which the SDK
 * provides so errors are recognized across package versions.
 */
const SDK_ERROR_MARKER = 'vercel.ai.error';

function isSDKError(error: unknown, name?: string): error is Error {
  const marker = Symbol.for(name ? `${SDK_ERROR_MARKER}.${name}` : SDK_ERROR_MARKER);
  return typeof error === 'object' && error !== null && Reflect.get(error, marker) === true;
}

const isRetryError = (error: unknown): error is RetryError => isSDKError(error, 'AI_RetryError');
const isAPICallError = (error: unknown): error is APICallError =>
  isSDKError(error, 'AI_APICallError');

/** Statuses with one meaning whatever the provider. */
const STATUS_MESSAGES: Readonly<Record<number, MessageKey>> = {
  401: 'ai_connErrorInvalidKey',
  403: 'ai_connErrorForbidden',
  404: 'ai_connErrorNotFound',
  429: 'ai_connErrorRateLimited',
};

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function describeAPICallError(error: APICallError): string {
  const { statusCode, url } = error;
  // Without a status the request never got an answer (offline, refused, blocked).
  if (statusCode === undefined) return t('ai_connErrorUnreachable', hostOf(url));
  const key = STATUS_MESSAGES[statusCode];
  return key ? t(key) : t('ai_connErrorHttp', [String(statusCode), hostOf(url)]);
}

/** A message for a failed AI request that the UI can show in the user's language. */
export function describeAIError(error: unknown): string {
  if (isRetryError(error)) {
    const last = describeAIError(error.lastError);
    return error.reason === 'maxRetriesExceeded'
      ? t('ai_errorRetriesExhausted', [String(error.errors.length), last])
      : last;
  }
  if (isAPICallError(error)) return describeAPICallError(error);
  if (isSDKError(error, 'AI_NoObjectGeneratedError')) return t('ai_errorNoObject');
  if (isSDKError(error)) return t('ai_errorRequestFailed');
  // Errors the extension throws itself (settings checks, AIConnectionError) are localized already.
  return getErrorMessage(error);
}

/** The provider's own words for an HTTP answer `describeAIError` can only name by its status. */
function unrecognizedStatusDetail(error: unknown): string | undefined {
  const last = isRetryError(error) ? error.lastError : error;
  if (!isAPICallError(last) || last.statusCode === undefined) return undefined;
  if (STATUS_MESSAGES[last.statusCode]) return undefined;
  return last.message.trim() || undefined;
}

/**
 * `describeAIError`, plus the provider's own message when the status alone says nothing useful
 * (an HTTP 400 for an unknown model, say), for chats where the user can act on it.
 */
export function describeAIErrorWithDetail(error: unknown): string {
  const description = describeAIError(error);
  const detail = unrecognizedStatusDetail(error);
  return detail ? t('ai_errorProviderDetail', [description, detail]) : description;
}
