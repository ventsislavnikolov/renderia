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

	it("exposes the generated prompt inside the debug details", () => {
		render(<GenerationStep brief="# Brief" prompt="PRESERVE EXACTLY abc" />);
		expect(screen.getByText(/PRESERVE EXACTLY abc/)).toBeDefined();
	});
});
