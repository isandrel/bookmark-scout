/**
 * Localized, actionable messages for errors from AI SDK calls. The SDK's own messages are English
 * and technical ("No object generated: response did not match schema", "Failed after 3 attempts.
 * Last error: ..."), so they are never shown as they are.
 */

import { AISDKError, APICallError, NoObjectGeneratedError, RetryError } from 'ai';

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
  if (RetryError.isInstance(error)) {
    const last = describeAIError(error.lastError);
    return error.reason === 'maxRetriesExceeded'
      ? t('ai_errorRetriesExhausted', [String(error.errors.length), last])
      : last;
  }
  if (APICallError.isInstance(error)) return describeAPICallError(error);
  if (NoObjectGeneratedError.isInstance(error)) return t('ai_errorNoObject');
  if (AISDKError.isInstance(error)) return t('ai_errorRequestFailed');
  // Errors the extension throws itself (settings checks, AIConnectionError) are localized already.
  return getErrorMessage(error);
}

/** The provider's own words for an HTTP answer `describeAIError` can only name by its status. */
function unrecognizedStatusDetail(error: unknown): string | undefined {
  const last = RetryError.isInstance(error) ? error.lastError : error;
  if (!APICallError.isInstance(last) || last.statusCode === undefined) return undefined;
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
