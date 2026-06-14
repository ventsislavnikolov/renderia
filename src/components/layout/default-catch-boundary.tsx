import { captureException } from "@sentry/tanstackstart-react";
import { Link, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

/**
 * Root error boundary. Reports the error to Sentry (no-op without a DSN) and
 * renders a recoverable fallback instead of a blank screen.
 */
export function DefaultCatchBoundary({ error }: { error: Error }) {
	const router = useRouter();
	captureException(error);

	return (
		<main className="grid min-h-screen place-items-center bg-background px-6">
			<div className="grid w-full max-w-md gap-4 border border-border bg-surface p-8 text-center">
				<h1 className="m-0 font-display font-medium text-3xl text-foreground italic tracking-tight">
					Something went wrong
				</h1>
				<p className="m-0 text-[0.9375rem] text-ink-muted">
					An unexpected error occurred. The team has been notified.
				</p>
				<div className="flex justify-center gap-3">
					<Button
						onClick={() => {
							router.invalidate();
						}}
						type="button"
						variant="outline"
					>
						Try again
					</Button>
					<Button asChild>
						<Link to="/">Back to home</Link>
					</Button>
				</div>
			</div>
		</main>
	);
}
