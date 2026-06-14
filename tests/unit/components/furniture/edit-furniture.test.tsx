import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/lib/server-client/auth-headers", () => ({
	UNAUTHENTICATED_ERROR: "UNAUTHENTICATED",
	getAuthHeaders: () => Promise.resolve({}),
}));

vi.mock("../../../../src/server/furniture", () => ({
	updateFurnitureItem: () => Promise.resolve(),
}));

import { EditFurniture } from "../../../../src/components/furniture/edit-furniture";

const ITEM = {
	id: "item-1",
	label: "White dresser",
	widthCm: 80,
	heightCm: 90,
	depthCm: 40,
};

describe("EditFurniture native inputs", () => {
	it("gives the name and dimension inputs a visible design-system focus ring", async () => {
		render(<EditFurniture item={ITEM} onClose={vi.fn()} onSaved={vi.fn()} />);

		for (const name of [/^name$/i, /width/i, /height/i, /depth/i]) {
			const input = await screen.findByLabelText(name);
			expect(input.className).toContain("focus-visible:ring-[3px]");
			expect(input.className).toContain("focus-visible:ring-ring/50");
		}
	});
});
