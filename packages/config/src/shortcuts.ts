/**
 * Keyboard shortcuts: the shape of `apps/extension/config/ui/shortcuts.toml`, the one place every
 * shortcut is defined, and the rules that turn a shortcut into key caps or text. The extension,
 * the docs, the website, and the README generator all format keys here, so Ctrl versus Cmd, the
 * Apple symbols, and key names never differ between them.
 *
 * Pure (no `node:fs`), so the extension imports it too (`@bookmark-scout/config/shortcuts`).
 * Build scripts read the file with `readShortcutConfig` from `@bookmark-scout/config`.
 */
import { boolean, type Check, type Issues, list, record, table, text } from "./schema";

/** A key in a page of the extension. `key` is `KeyboardEvent.key` ("/", "j", "ArrowUp"). */
export type KeyBinding = {
	key: string;
	alt?: boolean;
	/** Required Shift state. Ignored for punctuation, whose Shift state depends on the layout. */
	shift?: boolean;
	/** Ctrl, or Cmd on Apple platforms. Manager only. */
	mod?: boolean;
};

/** Which platforms a binding applies to: Apple's (`mac`) or every other one (`other`). */
export type ShortcutPlatform = "mac" | "other";

export type ConfiguredBinding = KeyBinding & { platform?: ShortcutPlatform };

/**
 * Keys in the browser's command format (`Alt+Shift+S`, MDN's `commands` manifest key), where
 * `Ctrl` is Command on Apple platforms; or different keys per platform.
 */
export type CommandKeys = string | { other: string; mac: string };

export type ShortcutConfig = {
	/** The extension's browser commands, by manifest command name, with the keys they suggest. */
	commands: Record<string, string>;
	/** The browser's own keys that the extension acts on or its documentation names. */
	browser: Record<string, CommandKeys>;
	/** Popup and side panel. */
	popup: Record<string, ConfiguredBinding[]>;
	/** The bookmark manager page. */
	manager: Record<string, ConfiguredBinding[]>;
};

export type ShortcutSection = keyof ShortcutConfig;

export const SHORTCUT_SECTIONS: readonly ShortcutSection[] = ["commands", "browser", "popup", "manager"];

/** One shortcut, written `section.name`: `commands.quick-save`, `manager.undo`. */
export type ShortcutId = `${ShortcutSection}.${string}`;

// ---------------------------------------------------------------------------------------------
// Validation

const BINDING_FIELDS = ["key", "alt", "shift", "mod", "platform"];

const binding: Check<ConfiguredBinding> = (value, path, issues) => {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		issues.push(`${path}: expected a table such as { key = "/" }`);
		return { key: "" };
	}
	const source = value as Record<string, unknown>;
	for (const field of Object.keys(source)) {
		if (!BINDING_FIELDS.includes(field)) issues.push(`${path}.${field}: unknown key`);
	}
	const result: ConfiguredBinding = { key: text()(source.key, `${path}.key`, issues) };
	for (const field of ["alt", "shift", "mod"] as const) {
		if (source[field] !== undefined) result[field] = boolean(source[field], `${path}.${field}`, issues);
	}
	if (source.platform !== undefined) {
		if (source.platform !== "mac" && source.platform !== "other") {
			issues.push(`${path}.platform: must be "mac" or "other"`);
		} else {
			result.platform = source.platform;
		}
	}
	return result;
};

const MODIFIER_NAMES = ["Ctrl", "Alt", "Command", "MacCtrl", "Shift"];
const COMMAND_KEY =
	/^(?:[A-Z0-9]|F(?:[1-9]|1[0-9])|Comma|Period|Home|End|PageUp|PageDown|Space|Insert|Delete|Up|Down|Left|Right)$/;

/** Keys in the browser's command format: up to two modifiers, then one key. */
const commandText: Check<string> = (value, path, issues) => {
	const result = text()(value, path, issues);
	const parts = result.split("+");
	const key = parts.at(-1) ?? "";
	const modifiers = parts.slice(0, -1);
	if (!COMMAND_KEY.test(key) || modifiers.length > 2 || modifiers.some((name) => !MODIFIER_NAMES.includes(name))) {
		issues.push(`${path}: must be keys in the browser's command format, such as Alt+Shift+S`);
	}
	return result;
};

const commandKeys: Check<CommandKeys> = (value, path, issues) =>
	typeof value === "string"
		? commandText(value, path, issues)
		: table({ other: commandText, mac: commandText })(value, path, issues);

const bindings = list(binding, { minLength: 1 });

/** Validates parsed `shortcuts.toml`, recording every problem in `issues`. */
export const shortcutConfigSchema: Check<ShortcutConfig> = table({
	commands: record(commandText),
	browser: record(commandKeys),
	popup: record(bindings),
	manager: record(bindings),
});

/** Validates parsed `shortcuts.toml`; throws listing every problem. */
export function parseShortcutConfig(raw: unknown, file = "shortcuts.toml"): ShortcutConfig {
	const issues: Issues = [];
	const config = shortcutConfigSchema(raw, "", issues);
	if (issues.length > 0) throw new Error(`${file} is invalid:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
	return config;
}

// ---------------------------------------------------------------------------------------------
// Key caps: the keys to press, one string per key, as the keyboard prints them

/** The configured bindings that apply on one platform, without the platform field. */
export function bindingsForPlatform(bindings: readonly ConfiguredBinding[], apple: boolean): KeyBinding[] {
	const platform: ShortcutPlatform = apple ? "mac" : "other";
	return bindings
		.filter((entry) => !entry.platform || entry.platform === platform)
		.map(({ platform: _platform, ...entry }) => entry);
}

/** Key caps as printed on keyboards, for keys whose `KeyboardEvent.key` name is not. */
const KEY_CAP_LABELS: Readonly<Record<string, string>> = {
	ArrowUp: "↑",
	ArrowDown: "↓",
	ArrowLeft: "←",
	ArrowRight: "→",
	Enter: "↵",
	Escape: "Esc",
	Control: "Ctrl",
	" ": "Space",
};

/** Apple keyboards print symbols on these keys, and macOS menus name them the same way. */
const APPLE_KEY_CAP_LABELS: Readonly<Record<string, string>> = {
	...KEY_CAP_LABELS,
	Alt: "⌥",
	Shift: "⇧",
	Meta: "⌘",
	Backspace: "⌫",
	Delete: "⌦",
};

/**
 * Modifier names (`aria-keyshortcuts` names) in the order each platform prints them: Ctrl, Alt,
 * Shift elsewhere; ⌥⇧⌘ on Apple platforms.
 */
export function bindingModifiers(entry: KeyBinding, apple: boolean): string[] {
	const alt = entry.alt ? ["Alt"] : [];
	const shift = entry.shift ? ["Shift"] : [];
	if (!entry.mod) return [...alt, ...shift];
	return apple ? [...alt, ...shift, "Meta"] : ["Control", ...alt, ...shift];
}

/** The key as printed: a letter typed with Ctrl or Cmd shows in capitals, as on the keycap. */
function bindingKeyName(entry: KeyBinding): string {
	return entry.mod && entry.key.length === 1 ? entry.key.toUpperCase() : entry.key;
}

/** The keys to press for a binding, modifiers first: `['Alt', '↑']`, or `['⌥', '↑']` on a Mac. */
export function bindingKeyCaps(entry: KeyBinding, apple: boolean): string[] {
	const labels = apple ? APPLE_KEY_CAP_LABELS : KEY_CAP_LABELS;
	return [...bindingModifiers(entry, apple), bindingKeyName(entry)].map((key) => labels[key] ?? key);
}

/** An `aria-keyshortcuts` value for the bindings, e.g. `Alt+ArrowUp Backspace`. */
export function ariaKeyShortcuts(bindings: readonly KeyBinding[], apple: boolean): string {
	return bindings.map((entry) => [...bindingModifiers(entry, apple), bindingKeyName(entry)].join("+")).join(" ");
}

/** Apple keyboards print symbols for modifiers, as macOS menus do. */
const APPLE_COMMAND_MODIFIER_CAPS: Readonly<Record<string, string>> = {
	Command: "⌘",
	MacCtrl: "⌃",
	Ctrl: "⌘",
	Alt: "⌥",
	Shift: "⇧",
};
const OTHER_COMMAND_MODIFIER_CAPS: Readonly<Record<string, string>> = { MacCtrl: "Ctrl" };
const COMMAND_KEY_CAPS: Readonly<Record<string, string>> = {
	Up: "↑",
	Down: "↓",
	Left: "←",
	Right: "→",
	Comma: ",",
	Period: ".",
};

/**
 * The key caps of a command shortcut as the browser reports it: Firefox and Chrome on Windows and
 * Linux write `Alt+Shift+S`, and Chrome on macOS writes glyphs such as `⌥⇧S`. On Apple platforms
 * the command format's `Ctrl` means Command.
 */
export function commandShortcutKeyCaps(shortcut: string, { apple }: { apple: boolean }): string[] {
	if (!shortcut) return [];
	if (!shortcut.includes("+")) {
		// Chrome on macOS: modifier glyphs, then the key ("⌥⇧S", "⌘F5"); or a lone key ("F5").
		const glyphs = /^[⌘⌃⌥⇧]*/.exec(shortcut)?.[0] ?? "";
		const key = shortcut.slice(glyphs.length);
		return [...glyphs, ...(key ? [COMMAND_KEY_CAPS[key] ?? key] : [])];
	}
	const parts = shortcut.split("+");
	const modifierCaps = apple ? APPLE_COMMAND_MODIFIER_CAPS : OTHER_COMMAND_MODIFIER_CAPS;
	return parts.map((part, index) =>
		index < parts.length - 1 ? (modifierCaps[part] ?? part) : (COMMAND_KEY_CAPS[part] ?? part),
	);
}

/** A command shortcut as text, the way the browser shows it: `Alt+Shift+S`, or `⌥⇧S` on a Mac. */
export function formatCommandShortcut(shortcut: string, options: { apple: boolean }): string {
	return commandShortcutKeyCaps(shortcut, options).join(options.apple ? "" : "+");
}

/**
 * Whether two command shortcuts press the same keys, whichever way each is written: Chrome on
 * macOS reports `⌘D` for the manifest's `Ctrl+D`, and Firefox's `Ctrl` is Command on a Mac.
 */
export function isSameCommandShortcut(first: string, second: string, options: { apple: boolean }): boolean {
	const caps = (shortcut: string) => commandShortcutKeyCaps(shortcut, options).join("\u0000");
	return first !== "" && second !== "" && caps(first) === caps(second);
}

// ---------------------------------------------------------------------------------------------
// Text for documentation: each configured shortcut on each platform

/** Key names spelled out in running text, where a keycap symbol would be unclear. */
const TEXT_KEY_NAMES: Readonly<Record<string, string>> = { "↵": "Enter" };

/** A binding as running text: `Ctrl+Shift+Z` elsewhere, `⌘⇧Z` on a Mac, `Alt+↓`, `Enter`. */
export function formatBinding(entry: KeyBinding, apple: boolean): string {
	const caps = bindingKeyCaps(entry, apple).map((cap) => TEXT_KEY_NAMES[cap] ?? cap);
	return caps.join(apple ? "" : "+");
}

/** The ways to press one shortcut on each platform, as text; usually one each. */
export type ShortcutText = { other: string[]; mac: string[] };

/** Every shortcut id in the config, in file order. */
export function shortcutIds(config: ShortcutConfig): ShortcutId[] {
	return SHORTCUT_SECTIONS.flatMap((section) =>
		Object.keys(config[section]).map((name) => `${section}.${name}` as ShortcutId),
	);
}

/** The shortcut `id` as text on each platform; throws for an id the config does not define. */
export function shortcutText(config: ShortcutConfig, id: string): ShortcutText {
	const dot = id.indexOf(".");
	const section = id.slice(0, dot) as ShortcutSection;
	const name = id.slice(dot + 1);
	const entry = dot > 0 && SHORTCUT_SECTIONS.includes(section) ? config[section][name] : undefined;
	if (entry === undefined) {
		throw new Error(`Unknown shortcut "${id}"; defined: ${shortcutIds(config).join(", ")}`);
	}
	if (section === "commands" || section === "browser") {
		const keys = entry as CommandKeys;
		const other = typeof keys === "string" ? keys : keys.other;
		const mac = typeof keys === "string" ? keys : keys.mac;
		return {
			other: [formatCommandShortcut(other, { apple: false })],
			mac: [formatCommandShortcut(mac, { apple: true })],
		};
	}
	const list = entry as ConfiguredBinding[];
	return {
		other: bindingsForPlatform(list, false).map((binding) => formatBinding(binding, false)),
		mac: bindingsForPlatform(list, true).map((binding) => formatBinding(binding, true)),
	};
}

/** Whether a shortcut is pressed the same way on every platform (`/`, `Esc`). */
export function isSameOnEveryPlatform(text: ShortcutText): boolean {
	return text.other.length === text.mac.length && text.other.every((keys, index) => keys === text.mac[index]);
}

/**
 * One way to press a shortcut as text, for a placeholder argument `<id>` or `<id>#<n>` (the n-th
 * way, from 1; the first by default): `commands.quick-save` gives `Alt+Shift+S`, or `⌥⇧S` on a Mac.
 */
export function shortcutPlaceholderText(config: ShortcutConfig, argument: string, platform: ShortcutPlatform): string {
	const [id = "", position = "1"] = argument.split("#");
	const ways = shortcutText(config, id)[platform];
	const index = Number(position) - 1;
	const keys = ways[index];
	if (!Number.isInteger(index) || keys === undefined) {
		throw new Error(`Shortcut "${id}" has no way ${position} on ${platform}; it has ${ways.length}`);
	}
	return keys;
}

/**
 * `{{SHORTCUT:<id>}}` and `{{SHORTCUT_MAC:<id>}}` (optionally `<id>#<n>`) in website messages and
 * README templates: the shortcut's keys elsewhere and on a Mac.
 */
export const SHORTCUT_PLACEHOLDER = /\{\{SHORTCUT(_MAC)?:([^}]+)\}\}/g;

/** Replaces every shortcut placeholder in `text`; throws for an unknown shortcut. */
export function fillShortcutPlaceholders(text: string, config: ShortcutConfig): string {
	return text.replace(SHORTCUT_PLACEHOLDER, (_match, mac: string | undefined, argument: string) =>
		shortcutPlaceholderText(config, argument, mac ? "mac" : "other"),
	);
}

/**
 * Text that looks like a typed key combination (`Alt+Shift+S`, `⌘⇧Z`, `Ctrl+Y`), for checks that
 * no document spells a shortcut out by hand. Mouse combinations (`Ctrl+click`) do not match.
 */
export const SHORTCUT_LITERAL =
	/(?:\b(?:(?:Ctrl|Control|Alt|Shift|Cmd|Command|Option|Opt)\+)+(?:F\d{1,2}(?![0-9])|Enter|Backspace|Delete|Space|Tab|Esc|Escape|Home|End|PageUp|PageDown|[↑↓←→]|[A-Za-z0-9](?![A-Za-z0-9]))|[⌘⌥⇧⌃]+(?:F\d{1,2}|[↑↓←→⌫⌦↩↵]|[A-Za-z0-9](?![A-Za-z0-9])))/g;
