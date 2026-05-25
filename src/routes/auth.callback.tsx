import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "../lib/supabase/browser";

export const Route = createFileRoute("/auth/callback")({
	ssr: false,
	component: AuthCallback,
});

function AuthCallback() {
	const navigate = useNavigate();
	const [errorMessage, setErrorMessage] = useState("");

	useEffect(() => {
		let cancelled = false;

		async function completeSignIn() {
			const url = new URL(window.location.href);
			const code = url.searchParams.get("code");
			const errorDescription = url.searchParams.get("error_description");

			if (errorDescription) {
				if (!cancelled) setErrorMessage(errorDescription);
				return;
			}

			if (code) {
				const { error } =
					await supabaseBrowser.auth.exchangeCodeForSession(code);
				if (cancelled) return;
				if (error) {
					setErrorMessage(error.message);
					return;
				}
			}

			const { data } = await supabaseBrowser.auth.getSession();
			if (cancelled) return;
			if (data.session) {
				await navigate({ to: "/projects" });
			} else {
				setErrorMessage(
					"Sign-in link did not establish a session. Request a new link.",
				);
			}
		}

		completeSignIn();
		return () => {
			cancelled = true;
		};
	}, [navigate]);

	return (
		<main className="auth-page">
			<div className="auth-card">
				<h1>Signing you in…</h1>
				{errorMessage ? (
					<>
						<p role="alert">{errorMessage}</p>
						<a href="/auth">Back to sign-in</a>
					</>
				) : (
					<output className="workspace-status">Confirming your email…</output>
				)}
			</div>
		</main>
	);
}
