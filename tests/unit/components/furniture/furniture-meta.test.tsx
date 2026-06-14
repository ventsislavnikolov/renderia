import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FurnitureMeta } from "../../../../src/components/furniture/furniture-meta";

describe("FurnitureMeta source link", () => {
	it("gives the source link a visible design-system focus ring", () => {
		render(
			<FurnitureMeta
				brand="JYSK"
				currency="BGN"
				depthCm={40}
				heightCm={90}
				price={799}
				sourceLink="https://jysk.bg/divani/divan-gistrup"
				widthCm={80}
			/>
		);

		const link = screen.getByRole("link", { name: /source link/i });
		expect(link.className).toContain("focus-visible:ring-[3px]");
		expect(link.className).toContain("focus-visible:ring-ring/50");
	});
});
