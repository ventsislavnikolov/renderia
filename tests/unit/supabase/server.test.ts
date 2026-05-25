import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Supabase server client constructs at module level if you call the
// factory at import time, so we mock @supabase/supabase-js to keep
// `createSupabaseServerClient` from reaching the network and to capture
// constructor arguments.
const createClientMock = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
	createClient: (...args: unknown[]) => createClientMock(...args),
}));

import {
	createSupabaseServerClient,
	readBearerToken,
	requireAuthedSupabase,
	requireUserId,
} from "../../../src/lib/supabase/server";

describe("supabase server helpers", () => {
	beforeEach(() => {
		createClientMock.mockReset();
		vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
		vi.stubEnv("SUPABASE_SECRET_KEY", "sk-secret");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("createSupabaseServerClient", () => {
		it("uses the secret key and persists no session", () => {
			createClientMock.mockReturnValueOnce({ id: "client" });

			const client = createSupabaseServerClient();

			expect(client).toEqual({ id: "client" });
			expect(createClientMock).toHaveBeenCalledWith(
				"https://example.supabase.co",
				"sk-secret",
				expect.objectContaining({ auth: { persistSession: false } }),
			);
			// no Authorization header when no access token is provided
			const opts = createClientMock.mock.calls[0]?.[2] as { global?: unknown };
			expect(opts.global).toBeUndefined();
		});

		it("forwards a bearer access token via Authorization header", () => {
			createClientMock.mockReturnValueOnce({ id: "client" });

			createSupabaseServerClient("user-jwt");

			const opts = createClientMock.mock.calls[0]?.[2] as {
				global: { headers: Record<string, string> };
			};
			expect(opts.global.headers.Authorization).toBe("Bearer user-jwt");
		});
	});

	describe("requireUserId", () => {
		it("returns the user id when present", () => {
			expect(requireUserId("user-1")).toBe("user-1");
		});

		it("throws when null or empty", () => {
			expect(() => requireUserId(null)).toThrow("Authentication required");
			expect(() => requireUserId("")).toThrow("Authentication required");
		});
	});

	describe("readBearerToken", () => {
		it("returns the token from a Bearer header", () => {
			expect(readBearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
		});

		it("is case-insensitive on the scheme", () => {
			expect(readBearerToken("bearer abc")).toBe("abc");
		});

		it("returns undefined for missing or malformed headers", () => {
			expect(readBearerToken(undefined)).toBeUndefined();
			expect(readBearerToken(null)).toBeUndefined();
			expect(readBearerToken("")).toBeUndefined();
			expect(readBearerToken("Basic xyz")).toBeUndefined();
		});
	});

	describe("requireAuthedSupabase", () => {
		it("throws when no access token is provided", async () => {
			await expect(requireAuthedSupabase(undefined)).rejects.toThrow(
				"Authentication required",
			);
		});

		it("throws when getUser returns an error", async () => {
			createClientMock.mockReturnValueOnce({
				auth: {
					getUser: vi.fn().mockResolvedValue({
						data: { user: null },
						error: { message: "bad jwt" },
					}),
				},
			});

			await expect(requireAuthedSupabase("bad")).rejects.toThrow(
				"Authentication required",
			);
		});

		it("returns the user id and a request-scoped client on success", async () => {
			const getUser = vi
				.fn()
				.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
			createClientMock.mockReturnValueOnce({ auth: { getUser } });

			const result = await requireAuthedSupabase("user-jwt");

			expect(result.userId).toBe("user-1");
			expect(result.supabase).toBeDefined();
			// Bearer token was forwarded when constructing the client
			const opts = createClientMock.mock.calls[0]?.[2] as {
				global: { headers: Record<string, string> };
			};
			expect(opts.global.headers.Authorization).toBe("Bearer user-jwt");
			// getUser was called with the same token (defensive — handlers should
			// verify the token rather than trust the request envelope).
			expect(getUser).toHaveBeenCalledWith("user-jwt");
		});
	});
});
