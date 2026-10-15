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
	SHORTCUT_LITERAL,
	type ShortcutConfig,
	shortcutIds,
	shortcutText,
} from "./shortcuts";

// A fixture, so the expectations below do not change when the real defaults do.
const config: ShortcutConfig = {
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
				commands: { save: "Alt+Shift+Ö" },
				browser: {},
				popup: { search: [{ key: "/", ctrl: true }] },
				manager: { undo: [{ key: "z", platform: "linux" }] },
			}),
		).toThrow(/commands\.save[\s\S]*ctrl: unknown key[\s\S]*platform: must be/);
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

describe("fillShortcutPlaceholders", () => {
	it("fills keys for each platform and the n-th way", () => {
		expect(fillShortcutPlaceholders("{{SHORTCUT:commands.quick-save}} / {{SHORTCUT_MAC:commands.quick-save}}", config)).toBe(
			"Alt+Shift+S / ⌥⇧S",
		);
		expect(fillShortcutPlaceholders("{{SHORTCUT:manager.redo#2}}", config)).toBe("Ctrl+Shift+Z");
		expect(() => fillShortcutPlaceholders("{{SHORTCUT:manager.redo#3}}", config)).toThrow(/no way 3/);
	});

	it("stays fast on text full of unfinished placeholders", () => {
		const text = "{{SHORTCUT:".repeat(20_000);
		const start = performance.now();
		expect(fillShortcutPlaceholders(text, config)).toBe(text);
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
