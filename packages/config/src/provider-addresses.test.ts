import { describe, expect, it } from "bun:test";
import { readProviderAddress, readProviderAddresses } from "./provider-addresses";

describe("readProviderAddress", () => {
	it("reads a provider's default address, whole or its host", () => {
		expect(readProviderAddress("ollama")).toStartWith("http://localhost:");
		expect(readProviderAddress("ollama", "host")).toBe(new URL(readProviderAddress("ollama")).host);
	});

	it("leaves out providers without a default address, and throws for them", () => {
		expect(readProviderAddresses()).not.toHaveProperty("azure");
		expect(() => readProviderAddress("azure")).toThrow(/No provider/);
		expect(() => readProviderAddress("nope")).toThrow(/No provider/);
	});
});
