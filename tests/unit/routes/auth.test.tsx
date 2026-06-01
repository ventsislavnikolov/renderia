import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithOtpMock = vi.fn();

vi.mock("../../../src/lib/supabase/browser", () => ({
	supabaseBrowser: {
		auth: {
			signInWithOtp: (...args: unknown[]) => signInWithOtpMock(...args),
		},
	},
}));

import { AuthPage } from "../../../src/components/auth/auth-page";

describe("AuthPage", () => {
	beforeEach(() => {
		signInWithOtpMock.mockResolvedValue({ error: null });
	});

	it("renders the refined login screen and sends a magic link", async () => {
		const user = userEvent.setup();
		render(<AuthPage />);

		expect(
			screen.getByRole("heading", { name: /welcome to renderia/i })
		).toBeDefined();
		expect(screen.getByRole("link", { name: /^renderia$/i })).toHaveAttribute(
			"href",
			"/sign-in"
		);
		expect(
			screen.getByText(/design concepts, rooms, and project notes/i)
		).toBeDefined();

		await user.type(screen.getByLabelText(/^email$/i), "user@example.com");
		await user.click(screen.getByRole("button", { name: /^continue$/i }));

		await waitFor(() => {
			expect(signInWithOtpMock).toHaveBeenCalledWith({
				email: "user@example.com",
				options: {
					emailRedirectTo: "http://localhost:3000/auth/callback",
				},
			});
		});
		expect(
			await screen.findByText(/check your email for the sign-in link/i)
		).toBeDefined();
	});
});
