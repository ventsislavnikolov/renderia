import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabaseBrowser } from "../lib/supabase/browser";

export const Route = createFileRoute("/auth")({
	component: AuthPage,
});

function AuthPage() {
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
		<main className="grid min-h-screen place-items-center bg-background px-6">
			<Card className="w-full max-w-md border-border bg-surface">
				<CardHeader>
					<CardTitle className="font-display font-medium text-3xl text-foreground italic">
						Renderia
					</CardTitle>
					<CardDescription className="font-body text-ink-muted">
						Sign in to manage renovation concepts for your house.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form className="grid gap-4" onSubmit={sendMagicLink}>
						<label
							className="grid gap-2 font-body font-semibold text-[0.6875rem] text-ink-subtle uppercase tracking-[0.08em]"
							htmlFor="auth-email"
						>
							Email
							<Input
								autoComplete="email"
								className="text-base normal-case tracking-normal"
								id="auth-email"
								inputMode="email"
								onChange={(event) => setEmail(event.target.value)}
								required
								type="email"
								value={email}
							/>
						</label>
						<Button
							className="w-full"
							disabled={submitting || email.length === 0}
							type="submit"
						>
							{submitting ? "Sending…" : "Send magic link"}
						</Button>
						{errorMessage ? (
							<p
								className="m-0 font-medium text-[0.875rem] text-destructive"
								role="alert"
							>
								{errorMessage}
							</p>
						) : null}
						{successMessage ? (
							<output className="block text-[0.875rem] text-ink-muted">
								{successMessage}
							</output>
						) : null}
					</form>
				</CardContent>
			</Card>
		</main>
	);
}
