import { describe, expect, it } from "bun:test";
import { parseOmniboxKeyword, readOmniboxKeyword } from "./omnibox-file";

describe("readOmniboxKeyword", () => {
  it("reads the configured keyword", () => {
    expect(readOmniboxKeyword()).toMatch(/^[a-z0-9]+$/);
  });

  it("rejects a keyword the address bar could not take as typed", () => {
    expect(() => parseOmniboxKeyword({ keyword: "Bm" })).toThrow(/lowercase/);
    expect(() => parseOmniboxKeyword({ keyword: "b m" })).toThrow(/lowercase/);
    expect(() => parseOmniboxKeyword({})).toThrow(/keyword/);
  });
});
