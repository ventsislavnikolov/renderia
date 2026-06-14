import { TanStackDevtools } from "@tanstack/react-devtools";
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { createClientOnlyFn } from "@tanstack/react-start";
import { useEffect } from "react";

import { DefaultCatchBoundary } from "../components/layout/default-catch-boundary";
import appCss from "../styles.css?url";

// Initialise browser error/performance monitoring. Wrapped as client-only so the
// client SDK never enters the server graph; no-op without a DSN configured.
// Invoked from a mount effect (not module scope) so it never runs during SSR —
// createClientOnlyFn throws if called on the server.
const initSentry = createClientOnlyFn(() => {
	import("../lib/observability/sentry.client").then((module) => {
		module.initSentryClient();
	});
});

export const Route = createRootRoute({
	errorComponent: DefaultCatchBoundary,
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "Renderia",
			},
		],
		links: [
			{ rel: "preconnect", href: "https://fonts.googleapis.com" },
			{
				rel: "preconnect",
				href: "https://fonts.gstatic.com",
				crossOrigin: "anonymous",
			},
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
			},
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	useEffect(() => {
		initSentry();
	}, []);

	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<TanStackDevtools
					config={{
						position: "bottom-right",
					}}
					plugins={[
						{
							name: "Tanstack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
					]}
				/>
				<Scripts />
			</body>
		</html>
	);
}
