/**
 * Centralized structured logger for the extension: each entry goes to the console as one object
 * with the time, level, module, the fields passed, and the message, filtered by level.
 */

const LEVELS = { debug: 20, info: 30, warn: 40, error: 50 } as const;
type LogLevel = keyof typeof LEVELS;

/** Release builds log `info` and above; development builds also log `debug`. */
const LOG_LEVELS = { production: 'info', development: 'debug' } as const satisfies Record<
  string,
  LogLevel
>;

const minimumLevel =
  LEVELS[process.env.NODE_ENV === 'production' ? LOG_LEVELS.production : LOG_LEVELS.development];

/** Log fields first and the message second (`log.error({ error }, 'Failed to ...')`), or a message alone. */
type LogMethod = (fieldsOrMessage: Record<string, unknown> | string, message?: string) => void;
type Logger = Record<LogLevel, LogMethod>;

function createLogger(module: string): Logger {
  const method =
    (level: LogLevel): LogMethod =>
    (fieldsOrMessage, message) => {
      if (LEVELS[level] < minimumLevel) return;
      const fields =
        typeof fieldsOrMessage === 'string'
          ? { msg: fieldsOrMessage }
          : { ...fieldsOrMessage, msg: message };
      console[level]({ time: Date.now(), level: LEVELS[level], module, ...fields });
    };
  return {
    debug: method('debug'),
    info: method('info'),
    warn: method('warn'),
    error: method('error'),
  };
}

export const aiLogger = createLogger('ai');
export const bookmarkLogger = createLogger('bookmark');
export const settingsLogger = createLogger('settings');
export const uiLogger = createLogger('ui');
