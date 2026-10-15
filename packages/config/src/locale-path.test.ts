/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { localeOfPath, localizedSegments, pathInLocale, splitLocale } from "./locale-path";

const routing = { defaultLocale: "en", locales: ["en", "ja", "zh-TW"] };

describe("locale paths", () => {
	test("splits the language prefix off, with none for the default language", () => {
		expect(splitLocale(["ja", "faq"], routing)).toEqual({ locale: "ja", slugs: ["faq"] });
		expect(splitLocale(["faq"], routing)).toEqual({ locale: "en", slugs: ["faq"] });
		expect(splitLocale([], routing)).toEqual({ locale: "en", slugs: [] });
		expect(localeOfPath("/zh-TW/guides/search", routing)).toBe("zh-TW");
		expect(localeOfPath("/", routing)).toBe("en");
	});

	test("builds segments with a prefix only for other languages", () => {
		expect(localizedSegments("en", ["faq"], routing)).toEqual(["faq"]);
		expect(localizedSegments("ja", ["faq"], routing)).toEqual(["ja", "faq"]);
	});

	test("switches a page to another language without doubling or leaving a prefix", () => {
		const slash = { trailingSlash: true };
		expect(pathInLocale("/privacy/", "ja", routing, slash)).toBe("/ja/privacy/");
		expect(pathInLocale("/ja/privacy/", "en", routing, slash)).toBe("/privacy/");
		expect(pathInLocale("/ja/privacy/", "zh-TW", routing, slash)).toBe("/zh-TW/privacy/");
		expect(pathInLocale("/ja/", "en", routing, slash)).toBe("/");
		expect(pathInLocale("/", "ja", routing, slash)).toBe("/ja/");
		expect(pathInLocale("/en/support/", "ja", routing, slash)).toBe("/ja/support/");
		expect(pathInLocale("/ja/faq", "en", routing)).toBe("/faq");
	});
});
