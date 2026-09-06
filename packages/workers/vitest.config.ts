import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { exclude: ["**/node_modules/**", "tests/node/**"] },
	plugins: [
		cloudflareTest({
			wrangler: { configPath: "./wrangler.toml" },
		}),
	],
});
