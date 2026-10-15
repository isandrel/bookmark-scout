/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { bestLanguageMatch } from "./language-preference";

const SUPPORTED = ["en", "ja", "ko", "zh-CN", "zh-TW", "es", "de", "fr", "pt-BR"];

describe("bestLanguageMatch", () => {
    test("matches exact tags case-insensitively", () => {
        expect(bestLanguageMatch(["ja"], SUPPORTED)).toBe("ja");
        expect(bestLanguageMatch(["zh-tw"], SUPPORTED)).toBe("zh-TW");
        expect(bestLanguageMatch(["pt-BR"], SUPPORTED)).toBe("pt-BR");
    });

    test("matches a regional or bare tag to the same language", () => {
        expect(bestLanguageMatch(["ja-JP"], SUPPORTED)).toBe("ja");
        expect(bestLanguageMatch(["en-GB"], SUPPORTED)).toBe("en");
        expect(bestLanguageMatch(["de-AT"], SUPPORTED)).toBe("de");
        expect(bestLanguageMatch(["es-419"], SUPPORTED)).toBe("es");
        expect(bestLanguageMatch(["pt"], SUPPORTED)).toBe("pt-BR");
        expect(bestLanguageMatch(["pt-PT"], SUPPORTED)).toBe("pt-BR");
    });

    test("tells Traditional from Simplified Chinese", () => {
        expect(bestLanguageMatch(["zh"], SUPPORTED)).toBe("zh-CN");
        expect(bestLanguageMatch(["zh-SG"], SUPPORTED)).toBe("zh-CN");
        expect(bestLanguageMatch(["zh-Hans"], SUPPORTED)).toBe("zh-CN");
        expect(bestLanguageMatch(["zh-HK"], SUPPORTED)).toBe("zh-TW");
        expect(bestLanguageMatch(["zh-MO"], SUPPORTED)).toBe("zh-TW");
        expect(bestLanguageMatch(["zh-Hant"], SUPPORTED)).toBe("zh-TW");
    });

    test("uses the first browser language that fits anything", () => {
        expect(bestLanguageMatch(["en-US", "ja"], SUPPORTED)).toBe("en");
        expect(bestLanguageMatch(["nl", "ko"], SUPPORTED)).toBe("ko");
        expect(bestLanguageMatch(["not a tag", "fr-CA"], SUPPORTED)).toBe("fr");
        expect(bestLanguageMatch(["nl", "sv"], SUPPORTED)).toBeUndefined();
        expect(bestLanguageMatch([], SUPPORTED)).toBeUndefined();
    });
});
