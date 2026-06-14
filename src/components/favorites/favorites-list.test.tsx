import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FavoriteImagePayload } from "@/server/generation";

// `Link` needs a router context we don't want to stand up here — render it as
// a plain anchor so we can assert on the surrounding accessible names instead.
vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		...props
	}: {
		children?: React.ReactNode;
		[key: string]: unknown;
	}) => <a {...props}>{children}</a>,
}));

vi.mock("@/lib/server-client/auth-headers", () => ({
	getAuthHeaders: () => Promise.resolve({}),
	UNAUTHENTICATED_ERROR: "UNAUTHENTICATED",
}));

const listFavoriteImages = vi.fn();
vi.mock("@/server/generation", () => ({
	listFavoriteImages: (args: unknown) => listFavoriteImages(args),
	setImageFavorite: () => Promise.resolve(),
}));

import { FavoritesList } from "./favorites-list";

const sampleImage: FavoriteImagePayload = {
	id: "img-1",
	signedUrl: "https://example.test/variation.png",
	variationIndex: 0,
	contents: null,
	createdAt: "2026-06-14T00:00:00.000Z",
	taskId: "task-1",
	taskTitle: "Living room refresh",
	projectId: "project-1",
	projectName: "Lake House",
};

describe("FavoritesList accessible names", () => {
	beforeEach(() => {
		listFavoriteImages.mockReset();
		listFavoriteImages.mockResolvedValue({ images: [sampleImage] });
	});

	it("names the remove-favorite control and hides its decorative icon", async () => {
		const { container } = render(<FavoritesList />);

		const button = await screen.findByRole("button", {
			name: "Remove Lake House variation 1 from favorites",
		});
		expect(button).toBeInTheDocument();

		// The star is decoration inside an already-labelled control, so it must
		// not be exposed to assistive technology.
		const icon = container.querySelector("button svg");
		expect(icon).not.toBeNull();
		expect(icon).toHaveAttribute("aria-hidden", "true");
	});

	it("gives the project link a visible design-system focus ring", async () => {
		render(<FavoritesList />);

		const link = await screen.findByText("Lake House");
		expect(link.className).toContain("focus-visible:ring-[3px]");
		expect(link.className).toContain("focus-visible:ring-ring/50");
	});
});
