import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabaseBrowser } from "@/lib/supabase/browser";

export function AuthPage() {
	const [email, setEmail] = useState("");
	const [errorMessage, setErrorMessage] = useState("");
	const [successMessage, setSuccessMessage] = useState("");
	const [submitting, setSubmitting] = useState(false);

	async function sendMagicLink(event: React.FormEvent) {
		event.preventDefault();
		setErrorMessage("");
		setSuccessMessage("");
		setSubmitting(true);
		const { error } = await supabaseBrowser.auth.signInWithOtp({
			email,
			options: {
				emailRedirectTo: `${window.location.origin}/auth/callback`,
			},
		});
		setSubmitting(false);
		if (error) {
			setErrorMessage(error.message);
		} else {
			setSuccessMessage("Check your email for the sign-in link.");
		}
	}

	return (
		<main className="min-h-screen bg-background text-foreground">
			<div className="mx-auto grid min-h-screen w-full max-w-[1120px] grid-rows-[auto_1fr_auto] px-6 py-5 sm:px-8">
				<header className="flex items-center justify-between">
					<a
						className="font-body font-semibold text-[1rem] text-foreground no-underline"
						href="/sign-in"
					>
						Renderia
					</a>
					<span className="hidden items-center gap-2 text-[0.8125rem] text-ink-muted sm:inline-flex">
						<Sparkles aria-hidden="true" className="size-3.5" />
						AI renovation workspace
					</span>
				</header>

				<section className="grid items-center gap-12 py-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,420px)]">
					<div className="hidden max-w-[560px] lg:grid lg:gap-8">
						<div className="grid gap-4">
							<p className="m-0 font-medium text-[0.8125rem] text-ink-muted">
								Design concepts, rooms, and project notes in one focused place.
							</p>
							<h1 className="m-0 max-w-[12ch] font-body font-semibold text-[3.25rem] text-foreground leading-[1.04]">
								Renovate from a clearer brief.
							</h1>
						</div>
						<div className="grid max-w-[440px] overflow-hidden rounded-lg border border-border bg-background shadow-xs">
							{[
								"Create a project",
								"Add rooms and photos",
								"Generate design directions",
							].map((item, index) => (
								<div
									className="flex items-center gap-3 border-border border-b px-4 py-3.5 last:border-b-0"
									key={item}
								>
									<span className="inline-flex size-7 items-center justify-center rounded-md bg-surface font-medium text-[0.8125rem] text-ink-muted">
										{index + 1}
									</span>
									<span className="font-medium text-[0.9375rem] text-foreground">
										{item}
									</span>
									<CheckCircle2
										aria-hidden="true"
										className="ml-auto size-4 text-ink-subtle"
									/>
								</div>
							))}
						</div>
					</div>

					<div className="mx-auto grid w-full max-w-[400px] gap-7">
						<div className="grid gap-2 text-center">
							<h2 className="m-0 font-body font-semibold text-[1.875rem] text-foreground">
								Welcome to Renderia
							</h2>
							<p className="m-0 text-[0.9375rem] text-ink-muted leading-6">
								Continue with your email to open your renovation workspace.
							</p>
						</div>

						<form className="grid gap-4" onSubmit={sendMagicLink}>
							<label
								className="grid gap-2 font-body font-medium text-[0.8125rem] text-foreground"
								htmlFor="auth-email"
							>
								Email
								<Input
									autoComplete="email"
									className="h-11 bg-background px-3.5 text-[0.9375rem]"
									id="auth-email"
									inputMode="email"
									onChange={(event) => setEmail(event.target.value)}
									placeholder="you@example.com"
									required
									type="email"
									value={email}
								/>
							</label>
							<Button
								className="h-11 w-full"
								disabled={submitting || email.length === 0}
								type="submit"
							>
								{submitting ? "Sending..." : "Continue"}
								{submitting ? null : (
									<ArrowRight aria-hidden="true" className="size-4" />
								)}
							</Button>
							{errorMessage ? (
								<p
									className="m-0 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 font-medium text-[0.875rem] text-destructive"
									role="alert"
								>
									{errorMessage}
								</p>
							) : null}
							{successMessage ? (
								<output className="block rounded-md border border-border bg-surface px-3 py-2 text-[0.875rem] text-ink-muted">
									{successMessage}
								</output>
							) : null}
						</form>

						<p className="m-0 text-center text-[0.8125rem] text-ink-subtle leading-5">
							We'll send a one-time sign-in link. No password required.
						</p>
					</div>
				</section>

				<footer className="flex justify-center text-[0.75rem] text-ink-subtle">
					Secure access for your private project workspace.
				</footer>
			</div>
		</main>
	);
}
