import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabaseBrowser } from "../lib/supabase/browser";

export const Route = createFileRoute("/auth")({
	component: AuthPage,
});

function AuthPage() {
	const [email, setEmail] = useState("");
	const [message, setMessage] = useState("");

	async function sendMagicLink(event: React.FormEvent) {
		event.preventDefault();
		const { error } = await supabaseBrowser.auth.signInWithOtp({
			email,
			options: { emailRedirectTo: window.location.origin },
		});
		setMessage(
			error ? error.message : "Check your email for the sign-in link.",
		);
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
						required
					/>
				</label>
				<button type="submit">Send magic link</button>
				{message ? <output>{message}</output> : null}
			</form>
		</main>
	);
}
