import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function NotFound() {
	return (
		<main className="grid min-h-screen place-items-center bg-background px-6">
			<div className="grid w-full max-w-md gap-4 border border-border bg-surface p-8 text-center">
				<h1 className="m-0 font-display font-medium text-3xl text-foreground italic tracking-tight">
					Page not found
				</h1>
				<p className="m-0 text-[0.9375rem] text-ink-muted">
					That URL does not match any page in renderia.
				</p>
				<Button asChild className="justify-self-center">
					<Link to="/">Back to home</Link>
				</Button>
			</div>
		</main>
	);
}
