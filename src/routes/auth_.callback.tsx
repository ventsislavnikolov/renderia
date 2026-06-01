import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "../lib/supabase/browser";

export const Route = createFileRoute("/auth_/callback")({
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
			const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
			const accessToken = hashParams.get("access_token");
			const refreshToken = hashParams.get("refresh_token");

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

			if (accessToken && refreshToken) {
				const { error } = await supabaseBrowser.auth.setSession({
					access_token: accessToken,
					refresh_token: refreshToken,
				});
				if (cancelled) return;
				if (error) {
					setErrorMessage(error.message);
					return;
				}
				window.history.replaceState({}, document.title, url.pathname);
			}

			const { data } = await supabaseBrowser.auth.getSession();
			if (cancelled) return;
			if (data.session) {
				await navigate({ to: "/projects" });
			} else {
				setErrorMessage(
					"Sign-in link did not establish a session. Request a new link."
				);
			}
		}

		completeSignIn();
		return () => {
			cancelled = true;
		};
	}, [navigate]);

	return (
		<main className="grid min-h-screen place-items-center bg-background px-6">
			<div className="grid w-full max-w-md gap-4 border border-border bg-surface p-8 text-center">
				<h1 className="m-0 font-display font-medium text-2xl text-foreground italic tracking-tight">
					Signing you in…
				</h1>
				{errorMessage ? (
					<>
						<p
							className="m-0 font-medium text-[0.9375rem] text-destructive"
							role="alert"
						>
							{errorMessage}
						</p>
						<a
							className="text-[0.875rem] text-foreground underline"
							href="/sign-in"
						>
							Back to sign-in
						</a>
					</>
				) : (
					<output className="block text-[0.9375rem] text-ink-muted italic">
						Confirming your email…
					</output>
				)}
			</div>
		</main>
	);
}
