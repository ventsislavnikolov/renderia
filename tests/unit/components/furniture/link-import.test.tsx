import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { extractMock, importMock, getAuthHeadersMock } = vi.hoisted(() => ({
	extractMock: vi.fn(),
	importMock: vi.fn(),
	getAuthHeadersMock: vi.fn(() => Promise.resolve({})),
}));

vi.mock("../../../../src/lib/server-client/auth-headers", () => ({
	UNAUTHENTICATED_ERROR: "UNAUTHENTICATED",
	getAuthHeaders: getAuthHeadersMock,
}));

vi.mock("../../../../src/server/furniture-import", () => ({
	extractFurnitureCandidate: (...args: unknown[]) => extractMock(...args),
	importFurnitureItem: (...args: unknown[]) => importMock(...args),
}));

import { LinkImport } from "../../../../src/components/furniture/link-import";

const CANDIDATE = {
	sourceUrl: "https://jysk.bg/divani/divan-gistrup",
	candidate: {
		name: "GISTRUP 3-seat sofa",
		photos: [
			"https://jysk.bg/cdn/gistrup-1.jpg",
			"https://jysk.bg/cdn/gistrup-2.jpg",
		],
		brand: "JYSK",
		price: 799,
		currency: "BGN",
	},
};

beforeEach(() => {
	extractMock.mockReset();
	importMock.mockReset();
	getAuthHeadersMock.mockClear();
});

async function importLink(url = "https://jysk.bg/divani/divan-gistrup") {
	const user = userEvent.setup();
	await user.type(screen.getByPlaceholderText(/paste a product link/i), url);
	await user.click(screen.getByRole("button", { name: /import from link/i }));
	return user;
}

describe("LinkImport", () => {
	it("pre-fills an editable confirm form from the extraction candidate", async () => {
		extractMock.mockResolvedValue(CANDIDATE);
		render(<LinkImport onSaved={vi.fn()} />);

		await importLink();

		expect(
			await screen.findByDisplayValue("GISTRUP 3-seat sofa")
		).toBeInTheDocument();
		expect(screen.getByDisplayValue("JYSK")).toBeInTheDocument();
		expect(screen.getByDisplayValue("799")).toBeInTheDocument();
		expect(screen.getByDisplayValue("BGN")).toBeInTheDocument();
		// All photos shown; the first is the default Reference Image.
		const photoButtons = screen.getAllByRole("button", {
			name: /use photo \d+ as the reference image/i,
		});
		expect(photoButtons).toHaveLength(2);
		expect(photoButtons[0]).toHaveAttribute("aria-pressed", "true");
		expect(photoButtons[1]).toHaveAttribute("aria-pressed", "false");
	});

	it("imports the picked photo with the edited fields, then resets", async () => {
		extractMock.mockResolvedValue(CANDIDATE);
		importMock.mockResolvedValue({ id: "item-9" });
		const onSaved = vi.fn();
		render(<LinkImport onSaved={onSaved} />);

		const user = await importLink();
		await screen.findByDisplayValue("GISTRUP 3-seat sofa");

		// Pick the second photo as the Reference Image.
		const photoButtons = screen.getAllByRole("button", {
			name: /use photo \d+ as the reference image/i,
		});
		await user.click(photoButtons[1]);
		expect(photoButtons[1]).toHaveAttribute("aria-pressed", "true");

		await user.click(screen.getByRole("button", { name: /save to library/i }));

		await waitFor(() => expect(importMock).toHaveBeenCalledTimes(1));
		expect(importMock.mock.calls[0][0].data).toMatchObject({
			sourceUrl: "https://jysk.bg/divani/divan-gistrup",
			photoUrl: "https://jysk.bg/cdn/gistrup-2.jpg",
			label: "GISTRUP 3-seat sofa",
			brand: "JYSK",
			price: 799,
			currency: "BGN",
		});
		expect(onSaved).toHaveBeenCalledWith({ id: "item-9" });
		// Form resets to the paste-URL entry.
		await waitFor(() =>
			expect(screen.getByPlaceholderText(/paste a product link/i)).toHaveValue(
				""
			)
		);
	});

	it("surfaces an actionable error when extraction fails", async () => {
		extractMock.mockRejectedValue(
			new Error("The page couldn't be reached. Add the item manually.")
		);
		render(<LinkImport onSaved={vi.fn()} />);

		await importLink();

		const alert = await screen.findByRole("alert");
		expect(alert).toHaveTextContent(/couldn't be reached.*manually/i);
		// Nothing persisted, still on the entry step.
		expect(importMock).not.toHaveBeenCalled();
		expect(
			screen.getByRole("button", { name: /import from link/i })
		).toBeInTheDocument();
	});

	it("gives each reference-photo button a visible design-system focus ring", async () => {
		extractMock.mockResolvedValue(CANDIDATE);
		render(<LinkImport onSaved={vi.fn()} />);

		await importLink();
		const photoButtons = await screen.findAllByRole("button", {
			name: /use photo \d+ as the reference image/i,
		});
		for (const button of photoButtons) {
			expect(button.className).toContain("focus-visible:ring-[3px]");
			expect(button.className).toContain("focus-visible:ring-ring/50");
		}
	});

	it("discards the draft on cancel without saving", async () => {
		extractMock.mockResolvedValue(CANDIDATE);
		render(<LinkImport onSaved={vi.fn()} />);

		const user = await importLink();
		await screen.findByDisplayValue("GISTRUP 3-seat sofa");

		await user.click(screen.getByRole("button", { name: /cancel/i }));

		expect(importMock).not.toHaveBeenCalled();
		expect(screen.getByPlaceholderText(/paste a product link/i)).toHaveValue(
			""
		);
	});
});
