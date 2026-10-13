import { describe, expect, it } from "vitest";
import { formatModelPricing } from "../src/utils/model-pricing.ts";

describe("model pricing", () => {
	it("shows all four catalog prices per million without rounding small rates", () => {
		expect(formatModelPricing({ cost: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 } })).toBe(
			"r$0.1 cr$0.01 w$0.5",
		);
	});
	it("shows zero prices for free models", () => {
		expect(formatModelPricing({ cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } })).toBe("r$0 cr$0 w$0");
	});
});
