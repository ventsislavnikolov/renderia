import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

// Upload source maps to Sentry only when an auth token is present (CI/Vercel).
// Without it the plugin is omitted entirely, so local builds stay offline.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const sentryPlugins = sentryAuthToken
	? [
			sentryVitePlugin({
				authToken: sentryAuthToken,
				org: process.env.SENTRY_ORG,
				project: process.env.SENTRY_PROJECT,
				release: { name: process.env.SENTRY_RELEASE },
			}),
		]
	: [];

const config = defineConfig(({ isSsrBuild }) => ({
	resolve: { tsconfigPaths: true },
	build: isSsrBuild
		? undefined
		: {
				// Source maps are required for Sentry to resolve stack traces.
				sourcemap: Boolean(sentryAuthToken),
				rolldownOptions: {
					output: {
						codeSplitting: {
							groups: [
								{
									name: "vendor-react",
									test: /node_modules[\\/](react|react-dom)[\\/]/,
									priority: 2,
								},
								{
									name: "vendor-tanstack",
									test: /node_modules[\\/]@tanstack[\\/]/,
									priority: 1,
								},
							],
						},
					},
				},
			},
	plugins: [
		devtools(),
		nitro({ rollupConfig: { external: [/^@sentry\//] } }),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
		...sentryPlugins,
	],
}));

export default config;
