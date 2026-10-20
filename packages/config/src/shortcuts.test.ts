import { describe, expect, it } from "bun:test";
import { readShortcutConfig } from "./shortcut-file";
import {
	bindingKeyCaps,
	fillShortcutPlaceholders,
	formatBinding,
	formatCommandShortcut,
	isApplePlatform,
	isSameOnEveryPlatform,
	parseShortcutConfig,
	parseShortcutNotes,
	platformOrder,
	SHORTCUT_LITERAL,
	type ShortcutConfig,
	shortcutIds,
	shortcutNoteText,
	shortcutPair,
	shortcutText,
} from "./shortcuts";

// A fixture, so the expectations below do not change when the real defaults do.
const config: ShortcutConfig = {
	display: { primary: "mac" },
	commands: { "quick-save": "Alt+Shift+S" },
	browser: { bookmark_page: "Ctrl+D", open_manager: { other: "Ctrl+Shift+O", mac: "Alt+Command+B" } },
	popup: { focus_search: [{ key: "/" }], recent: [{ key: "ArrowDown", alt: true }] },
	manager: {
		redo: [
			{ key: "y", mod: true, platform: "other" },
			{ key: "z", mod: true, shift: true },
		],
		rename: [
			{ key: "F2", platform: "other" },
			{ key: "Enter", platform: "mac" },
		],
		delete: [{ key: "Delete" }, { key: "Backspace", mod: true, platform: "mac" }],
	},
};

describe("shortcuts config", () => {
	it("reads and validates the extension's shortcuts file", () => {
		const real = readShortcutConfig();
		expect(Object.keys(real.commands).length).toBeGreaterThan(0);
		for (const id of shortcutIds(real)) expect(() => shortcutText(real, id)).not.toThrow();
	});

	it("rejects unknown fields, bad platforms, and keys outside the command format", () => {
		expect(() =>
			parseShortcutConfig({
				display: { primary: "windows" },
				commands: { save: "Alt+Shift+Ö" },
				browser: {},
				popup: { search: [{ key: "/", ctrl: true }] },
				manager: { undo: [{ key: "z", platform: "linux" }] },
			}),
		).toThrow(/display\.primary: must be[\s\S]*commands\.save[\s\S]*ctrl: unknown key[\s\S]*platform: must be/);
		expect(() => parseShortcutConfig({ commands: {}, browser: {}, popup: {} })).toThrow(/manager: missing/);
	});
});

describe("shortcutText", () => {
	it("prints command keys as each platform shows them", () => {
		expect(shortcutText(config, "commands.quick-save")).toEqual({ other: ["Alt+Shift+S"], mac: ["⌥⇧S"] });
		expect(shortcutText(config, "browser.bookmark_page")).toEqual({ other: ["Ctrl+D"], mac: ["⌘D"] });
		expect(shortcutText(config, "browser.open_manager")).toEqual({ other: ["Ctrl+Shift+O"], mac: ["⌥⌘B"] });
	});

	it("keeps each platform's own bindings, in order", () => {
		expect(shortcutText(config, "manager.redo")).toEqual({ other: ["Ctrl+Y", "Ctrl+Shift+Z"], mac: ["⇧⌘Z"] });
		expect(shortcutText(config, "manager.rename")).toEqual({ other: ["F2"], mac: ["Enter"] });
		expect(shortcutText(config, "manager.delete")).toEqual({ other: ["Delete"], mac: ["⌦", "⌘⌫"] });
		expect(shortcutText(config, "popup.recent")).toEqual({ other: ["Alt+↓"], mac: ["⌥↓"] });
	});

	it("tells keys that are the same everywhere apart", () => {
		expect(isSameOnEveryPlatform(shortcutText(config, "popup.focus_search"))).toBe(true);
		expect(isSameOnEveryPlatform(shortcutText(config, "commands.quick-save"))).toBe(false);
	});

	it("throws for an id the config does not define", () => {
		expect(() => shortcutText(config, "manager.nope")).toThrow(/Unknown shortcut "manager.nope"/);
		expect(() => shortcutText(config, "undo")).toThrow(/Unknown shortcut/);
	});
});

describe("formatting", () => {
	it("prints key caps with Apple's symbols on a Mac", () => {
		expect(bindingKeyCaps({ key: "ArrowUp", alt: true }, false)).toEqual(["Alt", "↑"]);
		expect(bindingKeyCaps({ key: "ArrowUp", alt: true }, true)).toEqual(["⌥", "↑"]);
		expect(bindingKeyCaps({ key: "a", mod: true }, false)).toEqual(["Ctrl", "A"]);
		expect(bindingKeyCaps({ key: "a", mod: true }, true)).toEqual(["⌘", "A"]);
	});

	it("spells Enter out in running text", () => {
		expect(formatBinding({ key: "Enter", mod: true }, false)).toBe("Ctrl+Enter");
		expect(formatBinding({ key: "Enter", shift: true }, true)).toBe("⇧Enter");
		expect(formatBinding({ key: " " }, false)).toBe("Space");
	});

	it("reads the browser's command format on each platform", () => {
		expect(formatCommandShortcut("Alt+Shift+S", { apple: false })).toBe("Alt+Shift+S");
		expect(formatCommandShortcut("Alt+Shift+S", { apple: true })).toBe("⌥⇧S");
		expect(formatCommandShortcut("⌥⇧S", { apple: true })).toBe("⌥⇧S");
	});
});

describe("text that names both platforms", () => {
	const otherFirst: ShortcutConfig = { ...config, display: { primary: "other" } };

	it("puts the configured primary platform first", () => {
		expect(platformOrder(config)).toEqual(["mac", "other"]);
		expect(platformOrder(otherFirst)).toEqual(["other", "mac"]);
		expect(shortcutPair(config, "manager.redo")).toEqual({
			primary: { platform: "mac", keys: ["⇧⌘Z"] },
			secondary: { platform: "other", keys: ["Ctrl+Y", "Ctrl+Shift+Z"] },
		});
		expect(shortcutPair(otherFirst, "commands.quick-save").primary).toEqual({ platform: "other", keys: ["Alt+Shift+S"] });
		expect(shortcutPair(config, "popup.focus_search")).toEqual({ primary: { platform: "mac", keys: ["/"] } });
	});

	it("words both platforms from one language's labels, primary first", () => {
		const english = { mac: "{keys} on Mac", other: "{keys} on Windows and Linux", pair: "{primary} ({secondary})" };
		expect(shortcutNoteText(english, ["mac", "other"])).toEqual({
			before: "",
			middle: " on Mac (",
			after: " on Windows and Linux)",
		});
		expect(shortcutNoteText(english, ["other", "mac"])).toEqual({
			before: "",
			middle: " on Windows and Linux (",
			after: " on Mac)",
		});
		const japanese = { mac: "Mac の {keys}", other: "Windows と Linux の {keys}", pair: "{primary}（{secondary}）" };
		expect(shortcutNoteText(japanese, ["mac", "other"])).toEqual({
			before: "Mac の ",
			middle: "（Windows と Linux の ",
			after: "）",
		});
	});

	it("rejects notes without each placeholder once, in order", () => {
		const notes = { mac: "{keys} on Mac", other: "{keys} on Windows and Linux", pair: "{primary} ({secondary})" };
		expect(parseShortcutNotes(notes, "en.json")).toEqual(notes);
		expect(() => parseShortcutNotes({ ...notes, mac: "on Mac" }, "en.json")).toThrow(/en\.json: .*\{keys\} once/);
		expect(() => parseShortcutNotes({ ...notes, pair: "{secondary} ({primary})" }, "en.json")).toThrow(/\{secondary\} once/);
		expect(() => parseShortcutNotes({ mac: notes.mac, other: notes.other }, "en.json")).toThrow(/"pair"/);
	});
});

describe("fillShortcutPlaceholders", () => {
	const format = { mac: "{keys} on Mac", other: "{keys} on Windows and Linux", pair: "{primary} ({secondary})" };

	it("names both platforms, primary first, with the other in parentheses", () => {
		expect(fillShortcutPlaceholders("Press {{SHORTCUT:commands.quick-save}} now", config, format)).toBe(
			"Press ⌥⇧S on Mac (Alt+Shift+S on Windows and Linux) now",
		);
		expect(fillShortcutPlaceholders("{{SHORTCUT:commands.quick-save}}", { ...config, display: { primary: "other" } }, format)).toBe(
			"Alt+Shift+S on Windows and Linux (⌥⇧S on Mac)",
		);
		expect(fillShortcutPlaceholders("{{SHORTCUT:popup.focus_search}}", config, format)).toBe("/");
	});

	it("fills one platform's keys and the n-th way", () => {
		expect(
			fillShortcutPlaceholders("{{SHORTCUT_OTHER:commands.quick-save}} / {{SHORTCUT_MAC:commands.quick-save}}", config, format),
		).toBe("Alt+Shift+S / ⌥⇧S");
		expect(fillShortcutPlaceholders("{{SHORTCUT_OTHER:manager.redo#2}}", config, format)).toBe("Ctrl+Shift+Z");
		expect(() => fillShortcutPlaceholders("{{SHORTCUT:manager.redo#2}}", config, format)).toThrow(/no way 2 on mac/);
		expect(() => fillShortcutPlaceholders("{{SHORTCUT_OTHER:manager.redo#3}}", config, format)).toThrow(/no way 3/);
	});

	it("stays fast on text full of unfinished placeholders", () => {
		const text = "{{SHORTCUT:".repeat(20_000);
		const start = performance.now();
		expect(fillShortcutPlaceholders(text, config, format)).toBe(text);
		expect(performance.now() - start).toBeLessThan(500);
	});
});

describe("SHORTCUT_LITERAL", () => {
	const literals = (text: string) => text.match(SHORTCUT_LITERAL) ?? [];

	it("finds key combinations typed by hand", () => {
		expect(literals("Press Alt+Shift+S on any page")).toEqual(["Alt+Shift+S"]);
		expect(literals("undo with Ctrl+Z and Ctrl+Y")).toEqual(["Ctrl+Z", "Ctrl+Y"]);
		expect(literals("(⌥⇧S on a Mac), ⌘D, ⌘⌫")).toEqual(["⌥⇧S", "⌘D", "⌘⌫"]);
		expect(literals("Ctrl/Cmd+L")).toEqual(["Cmd+L"]);
	});

	it("leaves mouse combinations and plain key names alone", () => {
		expect(literals("Ctrl+click and Shift+click to select; hold Ctrl or Shift")).toEqual([]);
	});
});

describe("isApplePlatform", () => {
	it("is true on macOS, iPadOS, and iOS only", () => {
		expect(isApplePlatform({ userAgentData: { platform: "macOS" } })).toBe(true);
		expect(isApplePlatform({ platform: "MacIntel" })).toBe(true);
		expect(isApplePlatform({ platform: "iPhone" })).toBe(true);
		expect(isApplePlatform({ userAgentData: { platform: "Windows" }, platform: "Win32" })).toBe(false);
		expect(isApplePlatform({ platform: "Linux x86_64" })).toBe(false);
		expect(isApplePlatform({})).toBe(false);
	});
});
