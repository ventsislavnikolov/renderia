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
		// Every extracted photo is kept by default.
		const keepBoxes = screen.getAllByRole("checkbox", {
			name: /keep photo \d+/i,
		});
		expect(keepBoxes).toHaveLength(2);
		for (const box of keepBoxes) expect(box).toBeChecked();
	});

	it("keeps all photos by default and imports them with the picked active one", async () => {
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
		// Both photos kept; the second is the active Reference Image.
		expect(importMock.mock.calls[0][0].data).toMatchObject({
			sourceUrl: "https://jysk.bg/divani/divan-gistrup",
			photoUrls: [
				"https://jysk.bg/cdn/gistrup-1.jpg",
				"https://jysk.bg/cdn/gistrup-2.jpg",
			],
			activePhotoIndex: 1,
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

	it("excludes an unchecked photo from the import", async () => {
		extractMock.mockResolvedValue(CANDIDATE);
		importMock.mockResolvedValue({ id: "item-7" });
		render(<LinkImport onSaved={vi.fn()} />);

		const user = await importLink();
		await screen.findByDisplayValue("GISTRUP 3-seat sofa");

		// Drop the first photo; the second becomes the active Reference Image.
		const keepBoxes = screen.getAllByRole("checkbox", {
			name: /keep photo \d+/i,
		});
		await user.click(keepBoxes[0]);

		await user.click(screen.getByRole("button", { name: /save to library/i }));

		await waitFor(() => expect(importMock).toHaveBeenCalledTimes(1));
		expect(importMock.mock.calls[0][0].data).toMatchObject({
			photoUrls: ["https://jysk.bg/cdn/gistrup-2.jpg"],
			activePhotoIndex: 0,
		});
	});

	it("keeps at most the photo cap by default and disables keeping the rest", async () => {
		const photos = Array.from(
			{ length: 8 },
			(_, index) => `https://jysk.bg/cdn/p-${index}.jpg`
		);
		extractMock.mockResolvedValue({
			...CANDIDATE,
			candidate: { ...CANDIDATE.candidate, photos },
		});
		importMock.mockResolvedValue({ id: "item-cap" });
		render(<LinkImport onSaved={vi.fn()} />);

		const user = await importLink();
		await screen.findByDisplayValue("GISTRUP 3-seat sofa");

		const keepBoxes = screen.getAllByRole("checkbox", {
			name: /keep photo \d+/i,
		});
		// First six kept; the extras are unchecked and can't be added (cap of 6).
		for (let index = 0; index < 6; index++) {
			expect(keepBoxes[index]).toBeChecked();
		}
		for (let index = 6; index < 8; index++) {
			expect(keepBoxes[index]).not.toBeChecked();
			expect(keepBoxes[index]).toBeDisabled();
		}

		await user.click(screen.getByRole("button", { name: /save to library/i }));
		await waitFor(() => expect(importMock).toHaveBeenCalledTimes(1));
		expect(importMock.mock.calls[0][0].data.photoUrls).toHaveLength(6);
	});

	it("promotes another kept photo when the active one is unchecked", async () => {
		extractMock.mockResolvedValue(CANDIDATE);
		render(<LinkImport onSaved={vi.fn()} />);

		const user = await importLink();
		await screen.findByDisplayValue("GISTRUP 3-seat sofa");

		const photoButtons = screen.getAllByRole("button", {
			name: /use photo \d+ as the reference image/i,
		});
		expect(photoButtons[0]).toHaveAttribute("aria-pressed", "true");

		// Uncheck the active (first) photo — the second is promoted to active.
		const keepBoxes = screen.getAllByRole("checkbox", {
			name: /keep photo \d+/i,
		});
		await user.click(keepBoxes[0]);
		expect(photoButtons[1]).toHaveAttribute("aria-pressed", "true");
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
