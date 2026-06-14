import { X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Privacy consent banner.
 *
 * Explicit opt-in for cookieless product analytics: Accept turns tracking on,
 * Decline keeps it off, and the close button dismisses the banner for this
 * session without choosing (analytics stays off). Rendered as a labelled
 * region with keyboard-reachable, design-system controls.
 */
export function ConsentBanner(props: {
	onAccept: () => void;
	onDecline: () => void;
}) {
	const [dismissed, setDismissed] = useState(false);
	if (dismissed) {
		return null;
	}

	return (
		<section
			aria-label="Analytics consent"
			className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-[640px] rounded-lg border border-border bg-background p-4 shadow-lg sm:inset-x-auto sm:right-4 sm:left-auto"
		>
			<div className="flex items-start justify-between gap-4">
				<div className="grid gap-1">
					<h2 className="m-0 font-body font-semibold text-[0.9375rem] text-foreground tracking-tight">
						Help improve Renderia
					</h2>
					<p className="m-0 max-w-[60ch] text-[0.8125rem] text-ink-muted leading-5">
						We use cookieless, privacy-friendly analytics to understand which
						features get used. Nothing is tracked until you accept.
					</p>
				</div>
				<Button
					aria-label="Dismiss consent banner"
					className="-mt-1 -mr-1 shrink-0"
					onClick={() => setDismissed(true)}
					size="icon-sm"
					type="button"
					variant="ghost"
				>
					<X aria-hidden="true" className="size-4" />
				</Button>
			</div>
			<div className="mt-3 flex flex-wrap items-center gap-2">
				<Button onClick={props.onAccept} size="sm" type="button">
					Accept
				</Button>
				<Button
					onClick={props.onDecline}
					size="sm"
					type="button"
					variant="outline"
				>
					Decline
				</Button>
			</div>
		</section>
	);
}
