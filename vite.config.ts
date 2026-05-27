import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const config = defineConfig(({ isSsrBuild }) => ({
	resolve: { tsconfigPaths: true },
	build: isSsrBuild
		? undefined
		: {
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
	],
}));

export default config;
