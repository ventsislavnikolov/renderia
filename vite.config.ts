import { cpSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

/**
 * sharp's native binding dlopen()s its libvips shared library from a sibling
 * @img/sharp-libvips-<platform> package (rpath @loader_path/../../...). Nitro's
 * static file-tracer copies the .node binding but never the libvips package —
 * it has no JS entry to resolve and the .so is loaded natively — so sharp fails
 * to load in the lambda, normalizeImageToPng silently returns null, and raw
 * phone JPEGs reach the image-edit API, which rejects them ("400 Invalid image
 * file or mode"). Copy the libvips package(s) next to the binding after build.
 * The platform packages are declared as optionalDependencies so the matching
 * one is installed + discoverable on both the Vercel (linux) and local builds.
 */
function copyLibvipsIntoServerBundle(serverDir: string): void {
	const imgDir = join(process.cwd(), "node_modules", "@img");
	if (!existsSync(imgDir)) return;
	const dest = join(serverDir, "node_modules", "@img");
	for (const name of readdirSync(imgDir)) {
		if (!name.startsWith("sharp-libvips-")) continue;
		cpSync(join(imgDir, name), join(dest, name), {
			recursive: true,
			dereference: true,
		});
	}
}

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
		// @sentry/* must stay external (its OpenTelemetry auto-instrumentation
		// breaks when bundled). traceDeps makes Nitro both externalize it AND
		// trace it into the function's node_modules — externalizing via
		// rollupConfig.external alone leaves the bare import untraced, so the
		// isolated Vercel lambda 500s with ERR_MODULE_NOT_FOUND on every request.
		//
		// The libvips copy is registered as a module that ADDS a `compiled`
		// handler via nitro.hooks.hook — passing it through the config `hooks`
		// key instead replaces the vercel preset's own `compiled` handler that
		// writes .vercel/output/config.json, breaking the deploy with
		// "No Output Directory named 'dist'".
		nitro({
			traceDeps: ["@sentry/tanstackstart-react"],
			// Image generation fans out one OpenAI call per approved angle; even
			// run in parallel a single edit can take >60s, past Vercel's default
			// function timeout (the source of the 504 on /_serverFn/*). Raise the
			// ceiling to 5 minutes — within the Team plan's limit. Billing is by
			// actual execution time, so fast functions are unaffected.
			vercel: {
				functions: {
					maxDuration: 300,
				},
			},
			modules: [
				(nitro) => {
					nitro.hooks.hook("compiled", (instance) => {
						const serverDir = instance.options.output.serverDir;
						if (serverDir) copyLibvipsIntoServerBundle(serverDir);
					});
				},
			],
		}),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
		...sentryPlugins,
	],
}));

export default config;
