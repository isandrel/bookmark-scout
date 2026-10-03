/**
 * A small strict validator for the workspace TOML files. Every check records an issue with
 * the value's path instead of throwing, so one run reports every problem in a file.
 */

export type Issues = string[];

/** Validates `value` found at `path`, records problems in `issues`, and returns the typed value. */
export type Check<T> = (value: unknown, path: string, issues: Issues) => T;

export type Infer<C> = C extends Check<infer T> ? T : never;

type Shape = Record<string, Check<unknown>>;

export class ConfigError extends Error {
	constructor(
		readonly file: string,
		readonly issues: readonly string[],
	) {
		super(`${file} is invalid:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
		this.name = "ConfigError";
	}
}

const isTable = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);

const join = (path: string, key: string) => (path ? `${path}.${key}` : key);

type TextOptions = {
	/** Accept `""` (for values such as store URLs that stay empty until they exist). */
	allowEmpty?: boolean;
	pattern?: RegExp;
	/** What the pattern means, for the error message. */
	hint?: string;
};

export function text(options: TextOptions = {}): Check<string> {
	return (value, path, issues) => {
		if (typeof value !== "string") {
			issues.push(`${path}: expected a string`);
			return "";
		}
		if (value.trim() === "") {
			if (!options.allowEmpty) issues.push(`${path}: must not be empty`);
			return value;
		}
		if (options.pattern && !options.pattern.test(value)) {
			issues.push(`${path}: must be ${options.hint ?? `a string matching ${options.pattern}`}`);
		}
		return value;
	};
}

type UrlOptions = {
	allowEmpty?: boolean;
	/**
	 * `page` (default): any absolute http(s) URL.
	 * `base`: a URL other paths are appended to, so no trailing slash, query, or fragment.
	 * `origin`: a `base` without a path, such as https://example.com.
	 */
	kind?: "page" | "base" | "origin";
};

/** An absolute http(s) URL. */
export function url(options: UrlOptions = {}): Check<string> {
	const base = text({ allowEmpty: options.allowEmpty });
	const kind = options.kind ?? "page";
	return (value, path, issues) => {
		const result = base(value, path, issues);
		if (result.trim() === "") return result;
		let parsed: URL;
		try {
			parsed = new URL(result);
		} catch {
			issues.push(`${path}: must be an absolute URL`);
			return result;
		}
		if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
			issues.push(`${path}: must be an http(s) URL`);
		}
		if (kind !== "page" && (result.endsWith("/") || parsed.search || parsed.hash)) {
			issues.push(`${path}: must not end with a slash, query, or fragment`);
		}
		if (kind === "origin" && parsed.pathname !== "/") {
			issues.push(`${path}: must be an origin such as https://example.com, without a path`);
		}
		return result;
	};
}

export const email = text({ pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, hint: "an email address" });

export const isoDate = text({ pattern: /^\d{4}-\d{2}-\d{2}$/, hint: "a date as YYYY-MM-DD" });

export const isoDateTime = text({
	pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/,
	hint: "a UTC date and time such as 2027-09-30T00:00:00.000Z",
});

export const color = text({ pattern: /^#[0-9a-f]{6}$/i, hint: "a hex color such as #0b7a80" });

export const boolean: Check<boolean> = (value, path, issues) => {
	if (typeof value !== "boolean") issues.push(`${path}: expected true or false`);
	return value === true;
};

export function number(options: { min?: number; max?: number } = {}): Check<number> {
	return (value, path, issues) => {
		if (typeof value !== "number" || Number.isNaN(value)) {
			issues.push(`${path}: expected a number`);
			return 0;
		}
		if (options.min !== undefined && value < options.min) issues.push(`${path}: must be at least ${options.min}`);
		if (options.max !== undefined && value > options.max) issues.push(`${path}: must be at most ${options.max}`);
		return value;
	};
}

export function list<T>(item: Check<T>, options: { minLength?: number; unique?: boolean } = {}): Check<T[]> {
	return (value, path, issues) => {
		if (!Array.isArray(value)) {
			issues.push(`${path}: expected a list`);
			return [];
		}
		if (options.minLength !== undefined && value.length < options.minLength) {
			issues.push(`${path}: needs at least ${options.minLength} entr${options.minLength === 1 ? "y" : "ies"}`);
		}
		if (options.unique && new Set(value).size !== value.length) issues.push(`${path}: has duplicate entries`);
		return value.map((entry, index) => item(entry, `${path}[${index}]`, issues));
	};
}

/** A table with any keys, each value checked by `item`. */
export function record<T>(item: Check<T>): Check<Record<string, T>> {
	return (value, path, issues) => {
		if (!isTable(value)) {
			issues.push(`${path}: expected a table`);
			return {};
		}
		return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, item(entry, join(path, key), issues)]));
	};
}

/** A table with exactly these keys: a missing key or an unknown key is an issue. */
export function table<S extends Shape>(shape: S): Check<{ [K in keyof S]: Infer<S[K]> }> {
	return (value, path, issues) => {
		const source = isTable(value) ? value : {};
		if (!isTable(value)) issues.push(`${path || "file"}: expected a table`);
		for (const key of Object.keys(source)) {
			if (!(key in shape)) issues.push(`${join(path, key)}: unknown key`);
		}
		const result: Record<string, unknown> = {};
		for (const [key, check] of Object.entries(shape)) {
			if (!(key in source)) {
				issues.push(`${join(path, key)}: missing`);
				continue;
			}
			result[key] = check(source[key], join(path, key), issues);
		}
		return result as { [K in keyof S]: Infer<S[K]> };
	};
}

/** Records an issue unless `keys` are exactly `expected` (in any order). */
export function expectKeys(path: string, keys: readonly string[], expected: readonly string[], issues: Issues): void {
	const missing = expected.filter((key) => !keys.includes(key));
	const extra = keys.filter((key) => !expected.includes(key));
	if (missing.length) issues.push(`${path}: missing ${missing.join(", ")}`);
	if (extra.length) issues.push(`${path}: unexpected ${extra.join(", ")}`);
}
