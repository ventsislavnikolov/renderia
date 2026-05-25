import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	type Mock,
	vi,
} from "vitest";

/**
 * Integration tests for the brief step.
 *
 * `Streamdown` is heavy enough that we replace it with a thin shim so the
 * tests stay focused on the orchestrator behavior (generate, edit, deferred
 * preview, auth redirect) rather than markdown rendering correctness — which
 * is covered by Streamdown's own test suite.
 */

vi.mock("streamdown", () => ({
	Streamdown: (props: { children: unknown }) => {
		// Catch contract drift: Streamdown is contractually fed markdown as
		// a string. If the component ever starts passing a fragment, array,
		// or non-string node we want the test suite to fail loudly here
		// rather than silently rendering `[object Object]`.
		if (typeof props.children !== "string") {
			throw new Error(
				`Streamdown shim expected a string child but received ${typeof props.children}`,
			);
		}
		return <div data-testid="streamdown-preview">{props.children}</div>;
	},
}));

const { createDesignBriefMock, getAuthHeadersMock } = vi.hoisted(() => ({
	createDesignBriefMock: vi.fn(),
	getAuthHeadersMock: vi.fn(),
}));

vi.mock("../../../../src/server/generation", () => ({
	createDesignBrief: (...args: unknown[]) => createDesignBriefMock(...args),
}));

vi.mock("../../../../src/lib/server-client/auth-headers", () => ({
	UNAUTHENTICATED_ERROR: "UNAUTHENTICATED",
	getAuthHeaders: (...args: unknown[]) => getAuthHeadersMock(...args),
}));

import { BriefStep } from "../../../../src/components/guided/brief-step";

const sampleElements = [
	{
		label: "left window",
		kind: "window" as const,
		x: 0.1,
		y: 0.2,
		width: 0.2,
		height: 0.3,
	},
];

const originalLocation = window.location;

beforeEach(() => {
	createDesignBriefMock.mockReset();
	getAuthHeadersMock
		.mockReset()
		.mockResolvedValue({ Authorization: "Bearer test-token" });

	Object.defineProperty(window, "location", {
		configurable: true,
		writable: true,
		value: { ...originalLocation, assign: vi.fn() },
	});
});

afterEach(() => {
	Object.defineProperty(window, "location", {
		configurable: true,
		writable: true,
		value: originalLocation,
	});
});

describe("BriefStep", () => {
	it("renders a fallback brief preview when no brief is set", () => {
		render(
			<BriefStep
				taskTitle="ceiling"
				protectedElements={sampleElements}
				brief=""
				prompt=""
				onBriefChange={vi.fn()}
				onPromptChange={vi.fn()}
				onNext={vi.fn()}
			/>,
		);
		// The deferred preview shows the fallback derived from element count.
		const preview = screen.getByTestId("streamdown-preview");
		expect(preview.textContent).toMatch(/# ceiling/);
		expect(preview.textContent).toMatch(/Preserve 1 confirmed fixed element/);
	});

	it("invokes the createDesignBrief server fn and forwards markdown + prompt to the parent", async () => {
		const user = userEvent.setup();
		createDesignBriefMock.mockResolvedValue({
			markdown: "# Generated brief",
			prompt: "PRESERVE EXACTLY left window",
		});
		const onBriefChange = vi.fn();
		const onPromptChange = vi.fn();

		render(
			<BriefStep
				taskTitle="ceiling"
				protectedElements={sampleElements}
				brief=""
				prompt=""
				onBriefChange={onBriefChange}
				onPromptChange={onPromptChange}
				onNext={vi.fn()}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /generate brief/i }));
		await waitFor(() =>
			expect(createDesignBriefMock).toHaveBeenCalledTimes(1),
		);
		expect(onBriefChange).toHaveBeenCalledWith("# Generated brief");
		expect(onPromptChange).toHaveBeenCalledWith("PRESERVE EXACTLY left window");
		const call = createDesignBriefMock.mock.calls[0]?.[0] as {
			data: { taskTitle: string; protectedElements: unknown[] };
			headers: { Authorization: string };
		};
		expect(call.data.taskTitle).toBe("ceiling");
		expect(call.data.protectedElements).toEqual(sampleElements);
		expect(call.headers.Authorization).toBe("Bearer test-token");
	});

	it("forwards textarea edits to the parent through onBriefChange", async () => {
		const user = userEvent.setup();
		const onBriefChange = vi.fn();

		// Use a controlled wrapper so the textarea actually reflects each
		// onChange — otherwise React leaves the controlled value at the
		// original prop and subsequent `user.type` characters see stale state.
		function ControlledHost() {
			const [brief, setBrief] = useState("# initial");
			return (
				<BriefStep
					taskTitle="ceiling"
					protectedElements={sampleElements}
					brief={brief}
					prompt=""
					onBriefChange={(next) => {
						onBriefChange(next);
						setBrief(next);
					}}
					onPromptChange={vi.fn()}
					onNext={vi.fn()}
				/>
			);
		}

		render(<ControlledHost />);

		const textarea = screen.getByLabelText(
			"Brief markdown",
		) as HTMLTextAreaElement;
		await user.type(textarea, "!");
		// The handler ran with the original brief + the typed character.
		expect(onBriefChange).toHaveBeenCalled();
		expect(textarea.value).toBe("# initial!");
	});

	it("advances to the next step on Continue", async () => {
		const user = userEvent.setup();
		const onNext = vi.fn();

		render(
			<BriefStep
				taskTitle="ceiling"
				protectedElements={sampleElements}
				brief="# brief"
				prompt=""
				onBriefChange={vi.fn()}
				onPromptChange={vi.fn()}
				onNext={onNext}
			/>,
		);

		await user.click(
			screen.getByRole("button", { name: /continue to generation/i }),
		);
		expect(onNext).toHaveBeenCalledTimes(1);
	});

	it("redirects to /auth when the server fn surfaces UNAUTHENTICATED", async () => {
		const user = userEvent.setup();
		createDesignBriefMock.mockRejectedValue(new Error("UNAUTHENTICATED"));
		const assignSpy = window.location.assign as unknown as Mock;

		render(
			<BriefStep
				taskTitle="ceiling"
				protectedElements={sampleElements}
				brief=""
				prompt=""
				onBriefChange={vi.fn()}
				onPromptChange={vi.fn()}
				onNext={vi.fn()}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /generate brief/i }));
		await waitFor(() => expect(assignSpy).toHaveBeenCalledWith("/auth"));
	});

	it("surfaces non-auth errors via role=alert", async () => {
		const user = userEvent.setup();
		createDesignBriefMock.mockRejectedValue(new Error("provider exploded"));

		render(
			<BriefStep
				taskTitle="ceiling"
				protectedElements={sampleElements}
				brief=""
				prompt=""
				onBriefChange={vi.fn()}
				onPromptChange={vi.fn()}
				onNext={vi.fn()}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /generate brief/i }));
		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toMatch(/provider exploded/);
	});
});
