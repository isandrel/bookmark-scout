/**
 * Centralized Pino logger for the extension.
 * Provides structured JSON logging with level filtering.
 */

import pino from 'pino';

// Create browser-compatible logger
const logger = pino({
  browser: {
    asObject: true,
  },
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
});

// Named child loggers for different modules
export const aiLogger = logger.child({ module: 'ai' });
export const bookmarkLogger = logger.child({ module: 'bookmark' });
export const settingsLogger = logger.child({ module: 'settings' });
export const uiLogger = logger.child({ module: 'ui' });

export default logger;
