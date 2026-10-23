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
    redirect: z.array(status).min(1),
    opaque: status,
    named: z.strictObject({ bad_request: status, unauthorized: status, forbidden: status }),
  }),
);

export const HTTP_STATUS = {
  min: httpConfig.status_min,
  max: httpConfig.status_max,
  serverErrorMin: httpConfig.server_error_min,
  badRequest: httpConfig.named.bad_request,
  unauthorized: httpConfig.named.unauthorized,
  forbidden: httpConfig.named.forbidden,
  /** What fetch reports for a response it hides, such as a redirect it did not follow. */
  opaque: httpConfig.opaque,
} as const;

/** Any status a response can have. */
export const httpStatusCodeSchema = status.min(HTTP_STATUS.min).max(HTTP_STATUS.max);

const NULL_BODY_STATUSES: ReadonlySet<number> = new Set(httpConfig.null_body);
const REDIRECT_STATUSES: ReadonlySet<number> = new Set(httpConfig.redirect);

/** Whether `status` is a client or server error (4xx or 5xx). */
export function isHttpErrorStatus(status: number): boolean {
  return status >= httpConfig.error_min;
}

/** Whether `status` sends the request on to the address in the Location header. */
export function isRedirectStatus(status: number): boolean {
  return REDIRECT_STATUSES.has(status);
}

/** Whether a response with `status` has no body. */
export function isNullBodyStatus(status: number): boolean {
  return NULL_BODY_STATUSES.has(status);
}

/** The class a status is in, such as "4xx" for 404. */
export function httpStatusClass(status: number): string {
  return `${Math.floor(status / httpConfig.class_size)}${httpConfig.class_label_suffix}`;
}
