import { describe, expect, it } from "bun:test";
import { readSettingDefault } from "./setting-defaults";

describe("readSettingDefault", () => {
	it("reads a plain default and one written with its bounds", () => {
		expect(readSettingDefault("behavior.links.open_target")).toBe("new_tab");
		expect(typeof readSettingDefault("behavior.links.confirm_open_above")).toBe("number");
	});

	it("throws for a path no settings file defines", () => {
		expect(() => readSettingDefault("behavior.links.nope")).toThrow(/No setting default/);
		expect(() => readSettingDefault("behavior")).toThrow(/<file>\.<section>\.<key>/);
	});
});
