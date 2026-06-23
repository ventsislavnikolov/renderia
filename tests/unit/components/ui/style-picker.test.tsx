import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StylePicker } from "../../../../src/components/ui/style-picker";

describe("StylePicker", () => {
	it("shows the label of the controlled Style from the catalog", () => {
		render(<StylePicker onChange={vi.fn()} value="industrial" />);
		expect(
			screen.getByRole("combobox", { name: /choose a renovation style/i })
		).toHaveTextContent("Industrial");
	});

	it("falls back to Scandinavian for an unknown id rather than blanking", () => {
		render(<StylePicker onChange={vi.fn()} value="does-not-exist" />);
		expect(
			screen.getByRole("combobox", { name: /choose a renovation style/i })
		).toHaveTextContent("Scandinavian");
	});

	it("exposes an accessible, labelled control", () => {
		render(<StylePicker onChange={vi.fn()} value="scandinavian" />);
		expect(
			screen.getByRole("combobox", { name: /choose a renovation style/i })
		).toBeInTheDocument();
	});
});
