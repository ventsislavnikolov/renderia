import { Link } from "@tanstack/react-router";

export function NotFound() {
	return (
		<main className="auth-page">
			<div className="auth-card">
				<h1>Page not found</h1>
				<p>That URL does not match any page in renderia.</p>
				<Link to="/">Back to home</Link>
			</div>
		</main>
	);
}
