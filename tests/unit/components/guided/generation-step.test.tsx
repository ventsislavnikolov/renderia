import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the auth headers + server fns at the module boundary so the
// component can be exercised without any real network or Supabase client.
vi.mock("../../../../src/lib/server-client/auth-headers", () => ({
	UNAUTHENTICATED_ERROR: "UNAUTHENTICATED",
	getAuthHeaders: vi.fn().mockResolvedValue({ Authorization: "Bearer test" }),
}));

const generateMock = vi.fn();
const setFavoriteMock = vi.fn();
const listImagesMock = vi.fn();

vi.mock("../../../../src/server/generation", () => ({
	generateRenovationImages: (...args: unknown[]) => generateMock(...args),
	listGeneratedImages: (...args: unknown[]) => listImagesMock(...args),
	setImageFavorite: (...args: unknown[]) => setFavoriteMock(...args),
}));

import { GenerationStep } from "../../../../src/components/guided/generation-step";

function makeImage(index: number, isFavorite = false) {
	return {
		id: `img-${index}`,
		storagePath: `user-1/job-1-${index}.png`,
		signedUrl: `https://signed/job-1-${index}.png`,
		variationIndex: index,
		isFavorite,
	};
}

const TASK_ID = "22222222-2222-2222-2222-222222222222";

describe("GenerationStep", () => {
	beforeEach(() => {
		generateMock.mockReset();
		setFavoriteMock.mockReset();
		// Default: no prior batch — preserves the existing "auto-generate on
		// mount" assertions. Tests that exercise the rehydrate path override
		// this with a non-empty resolved value.
		listImagesMock.mockReset().mockResolvedValue({ jobId: null, images: [] });
	});

	it("calls generateRenovationImages on mount and renders the returned variations", async () => {
		generateMock.mockResolvedValueOnce({
			data: {
				jobId: "job-1",
				images: [makeImage(0), makeImage(1), makeImage(2), makeImage(3)],
			},
		});

		render(
			<GenerationStep
				brief="# Test"
				briefId={null}
				prompt="PRESERVE EXACTLY"
				taskId={TASK_ID}
			/>
		);

		await waitFor(() => {
			expect(generateMock).toHaveBeenCalledTimes(1);
		});
		expect(generateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					taskId: TASK_ID,
					prompt: "PRESERVE EXACTLY",
					count: 4,
				}),
			})
		);

		// All four variation cards render with signed URLs.
		const imgs = await screen.findAllByRole("img");
		expect(imgs).toHaveLength(4);
		expect(imgs[0]?.getAttribute("src")).toContain("job-1-0.png");
		expect(
			screen.getByText(/Generated outputs are visual concepts/i)
		).toBeDefined();
	});

	it("toggles favorite via setImageFavorite and reflects the change", async () => {
		generateMock.mockResolvedValueOnce({
			data: { jobId: "job-1", images: [makeImage(0)] },
		});
		setFavoriteMock.mockResolvedValueOnce({
			id: "img-0",
			is_favorite: true,
			storage_path: "user-1/job-1-0.png",
			variation_index: 0,
		});
		const user = userEvent.setup();

		render(
			<GenerationStep
				brief="# Test"
				briefId={null}
				prompt="PRESERVE EXACTLY"
				taskId={TASK_ID}
			/>
		);

		const favBtn = await screen.findByRole("button", {
			name: /Mark favorite/i,
		});
		expect(favBtn.getAttribute("aria-pressed")).toBe("false");
		await user.click(favBtn);
		await waitFor(() => {
			expect(setFavoriteMock).toHaveBeenCalledWith(
				expect.objectContaining({
					data: { imageId: "img-0", isFavorite: true },
				})
			);
		});
		expect(favBtn.getAttribute("aria-pressed")).toBe("true");
		expect(favBtn.textContent).toContain("Favorite");
	});

	it("exposes the generated prompt inside the debug details (non-production only)", async () => {
		generateMock.mockResolvedValueOnce({
			data: { jobId: "job-1", images: [] },
		});
		render(
			<GenerationStep
				brief="# Brief"
				briefId={null}
				prompt="PRESERVE EXACTLY abc"
				taskId={TASK_ID}
			/>
		);
		expect(screen.getByText(/PRESERVE EXACTLY abc/)).toBeDefined();
		expect(screen.getByText(/Show prompt sent to provider/i)).toBeDefined();
	});

	it("warns and skips the network call when no prompt is supplied", async () => {
		render(
			<GenerationStep brief="" briefId={null} prompt="" taskId={TASK_ID} />
		);
		// Wait for the on-mount listGeneratedImages to settle (empty), at which
		// point the missing-brief warning replaces the loading state.
		expect(
			await screen.findByText(/No brief yet — go back to the brief step/i)
		).toBeDefined();
		expect(generateMock).not.toHaveBeenCalled();
	});

	it("rehydrates the latest saved batch instead of regenerating", async () => {
		listImagesMock.mockReset().mockResolvedValueOnce({
			jobId: "job-prev",
			images: [makeImage(0, true), makeImage(1), makeImage(2), makeImage(3)],
		});
		render(
			<GenerationStep
				brief="# Brief"
				briefId={null}
				prompt="PRESERVE EXACTLY"
				taskId={TASK_ID}
			/>
		);
		const imgs = await screen.findAllByRole("img");
		expect(imgs).toHaveLength(4);
		expect(generateMock).not.toHaveBeenCalled();
		// First card already starred from the persisted row.
		expect(
			screen
				.getAllByRole("button", { name: /Favorite/i })[0]
				?.getAttribute("aria-pressed")
		).toBe("true");
	});

	it("renders an alert with a Try again button when generation fails", async () => {
		generateMock.mockRejectedValueOnce(new Error("provider exploded"));
		render(
			<GenerationStep
				brief="# Brief"
				briefId={null}
				prompt="PRESERVE EXACTLY"
				taskId={TASK_ID}
			/>
		);
		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toMatch(/provider exploded/);
		expect(screen.getByRole("button", { name: /Try again/i })).toBeDefined();
	});
});
