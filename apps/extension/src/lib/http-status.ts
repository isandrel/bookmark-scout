/** HTTP status codes from config/network/http.toml: one source for every check of a status. */
import { z } from 'zod';

const status = z.number().int();

const httpConfig = readConfig(
  'network/http',
  z.strictObject({
    status_min: status,
    status_max: status,
    error_min: status,
    server_error_min: status,
    class_size: z.number().int().positive(),
    class_label_suffix: z.string().min(1),
    null_body: z.array(status),
    named: z.strictObject({ bad_request: status, forbidden: status }),
  }),
);

export const HTTP_STATUS = {
  min: httpConfig.status_min,
  max: httpConfig.status_max,
  serverErrorMin: httpConfig.server_error_min,
  badRequest: httpConfig.named.bad_request,
  forbidden: httpConfig.named.forbidden,
} as const;

/** Any status a response can have. */
export const httpStatusCodeSchema = status.min(HTTP_STATUS.min).max(HTTP_STATUS.max);

const NULL_BODY_STATUSES: ReadonlySet<number> = new Set(httpConfig.null_body);

/** Whether `status` is a client or server error (4xx or 5xx). */
export function isHttpErrorStatus(status: number): boolean {
  return status >= httpConfig.error_min;
}

/** Whether a response with `status` has no body. */
export function isNullBodyStatus(status: number): boolean {
  return NULL_BODY_STATUSES.has(status);
}

/** The class a status is in, such as "4xx" for 404. */
export function httpStatusClass(status: number): string {
  return `${Math.floor(status / httpConfig.class_size)}${httpConfig.class_label_suffix}`;
}
