import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { GenerationStep } from "../../../../src/components/guided/generation-step";

describe("GenerationStep", () => {
	it("renders four placeholder variations and the concept warning", () => {
		render(<GenerationStep brief="# Test" prompt="PRESERVE EXACTLY" />);
		expect(screen.getByText("Variation 1")).toBeDefined();
		expect(screen.getByText("Variation 4")).toBeDefined();
		expect(
			screen.getByText(/Generated outputs are visual concepts/i),
		).toBeDefined();
	});

	it("toggles favorite state via aria-pressed", async () => {
		const user = userEvent.setup();
		render(<GenerationStep brief="# Test" prompt="PRESERVE EXACTLY" />);
		const buttons = screen.getAllByRole("button", { name: /favorite/i });
		expect(buttons[0]?.getAttribute("aria-pressed")).toBe("false");
		await user.click(buttons[0] as HTMLElement);
		expect(buttons[0]?.getAttribute("aria-pressed")).toBe("true");
	});

	it("exposes the generated prompt inside the debug details (non-production only)", () => {
		// Vitest defaults to MODE === "test", so the debug `<details>` should render.
		render(<GenerationStep brief="# Brief" prompt="PRESERVE EXACTLY abc" />);
		expect(screen.getByText(/PRESERVE EXACTLY abc/)).toBeDefined();
		expect(
			screen.getByText(/Show prompt sent to provider/i),
		).toBeDefined();
	});

	it("warns when no brief was supplied", () => {
		render(<GenerationStep brief="" prompt="" />);
		expect(
			screen.getByText(/No brief yet — go back to the brief step/i),
		).toBeDefined();
	});

	it("toggles favorites independently per variation", async () => {
		const user = userEvent.setup();
		render(<GenerationStep brief="# Brief" prompt="x" />);
		const buttons = screen.getAllByRole("button", { name: /favorite/i });
		expect(buttons).toHaveLength(4);
		await user.click(buttons[1] as HTMLElement);
		expect(buttons[0]?.getAttribute("aria-pressed")).toBe("false");
		expect(buttons[1]?.getAttribute("aria-pressed")).toBe("true");
		await user.click(buttons[1] as HTMLElement);
		expect(buttons[1]?.getAttribute("aria-pressed")).toBe("false");
	});
});
