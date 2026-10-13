import type { Api, Model } from "@earendil-works/pi-ai";

export function formatModelPricing(model: Pick<Model<Api>, "cost">): string {
	const { input, output, cacheRead } = model.cost;
	return `r$${input} cr$${cacheRead} w$${output}`;
}
