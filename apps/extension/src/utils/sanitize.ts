import domPurifyFactory from 'dompurify';

/**
 * Safely strips all HTML tags from a string using DOMPurify.
 * This fixes the CodeQL "Incomplete multi-character sanitization" vulnerability.
 * 
 * We configure DOMPurify to allow NO tags, effectively stripping everything.
 */
export function stripHtmlTags(input: string): string {
  if (!input) return '';

  // DOMPurify requires a window context. In tests or browser, window should exist.
  // Note: dompurify export is a factory function that takes a window.
  // @ts-ignore - types might conflict depending on version/environment, safe to cast or ignore for simple factory usage
  const DOMPurify = domPurifyFactory(window);

  // ALLOWED_TAGS: [] means strip ALL tags.
  return DOMPurify.sanitize(input, { 
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [] 
  });
}

