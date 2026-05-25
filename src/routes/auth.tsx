import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabaseBrowser } from "../lib/supabase/browser";

export const Route = createFileRoute("/auth")({
	component: AuthPage,
});

function AuthPage() {
	const [email, setEmail] = useState("");
	const [errorMessage, setErrorMessage] = useState("");
	const [successMessage, setSuccessMessage] = useState("");

	async function sendMagicLink(event: React.FormEvent) {
		event.preventDefault();
		setErrorMessage("");
		setSuccessMessage("");
		const { error } = await supabaseBrowser.auth.signInWithOtp({
			email,
			options: {
				emailRedirectTo: `${window.location.origin}/auth/callback`,
			},
		});
		if (error) {
			setErrorMessage(error.message);
		} else {
			setSuccessMessage("Check your email for the sign-in link.");
		}
	}

	return (
		<main className="auth-page">
			<form onSubmit={sendMagicLink} className="auth-card">
				<h1>Renderia</h1>
				<p>Sign in to manage renovation concepts for your house.</p>
				<label>
					Email
					<input
						value={email}
						onChange={(event) => setEmail(event.target.value)}
						type="email"
						autoComplete="email"
						inputMode="email"
						required
					/>
				</label>
				<button type="submit">Send magic link</button>
				{errorMessage ? <p role="alert">{errorMessage}</p> : null}
				{successMessage ? <output>{successMessage}</output> : null}
			</form>
		</main>
	);
}
