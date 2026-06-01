import { beforeEach, describe, expect, it, vi } from "vitest";

const generateLinkMock = vi.fn();
const createSupabaseAdminClientMock = vi.fn(() => ({
	auth: {
		admin: {
			generateLink: generateLinkMock,
		},
	},
}));

vi.mock("../../../src/lib/supabase/server", () => ({
	createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

describe("auth server handlers", () => {
	beforeEach(() => {
		generateLinkMock.mockReset();
		createSupabaseAdminClientMock.mockClear();
		process.env.NODE_ENV = "development";
	});

	it("creates a localhost-only dev login link", async () => {
		generateLinkMock.mockResolvedValue({
			data: {
				properties: {
					action_link: "https://project.supabase.co/auth/v1/verify?token=abc",
				},
			},
			error: null,
		});

		const { __createDevLoginLinkHandler } = await import(
			"../../../src/server/auth"
		);
		const result = await __createDevLoginLinkHandler({
			email: "soavarice@gmail.com",
			redirectTo: "http://localhost:3000/auth/callback",
		});

		expect(result).toStrictEqual({
			actionLink: "https://project.supabase.co/auth/v1/verify?token=abc",
		});
		expect(generateLinkMock).toHaveBeenCalledWith({
			type: "magiclink",
			email: "soavarice@gmail.com",
			options: {
				redirectTo: "http://localhost:3000/auth/callback",
			},
		});
	});

	it("rejects non-local redirects", async () => {
		const { __createDevLoginLinkHandler } = await import(
			"../../../src/server/auth"
		);

		await expect(
			__createDevLoginLinkHandler({
				email: "soavarice@gmail.com",
				redirectTo: "https://example.com/auth/callback",
			})
		).rejects.toThrow("Dev login redirect must stay on localhost");
	});

	it("rejects non-development environments", async () => {
		process.env.NODE_ENV = "production";
		const { __createDevLoginLinkHandler } = await import(
			"../../../src/server/auth"
		);

		await expect(
			__createDevLoginLinkHandler({
				email: "soavarice@gmail.com",
				redirectTo: "http://localhost:3000/auth/callback",
			})
		).rejects.toThrow("Dev login is only available in local development");
	});
});
