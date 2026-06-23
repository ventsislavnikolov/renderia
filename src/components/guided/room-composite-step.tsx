import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { TaskRoomState } from "@/lib/renovation/room-state";
import type { Tables } from "@/lib/types/database";
import {
	getAuthHeaders,
	UNAUTHENTICATED_ERROR,
} from "../../lib/server-client/auth-headers";
import {
	approveRoomComposite,
	generateRoomComposite,
} from "../../server/room-state";

type PhotoRow = Tables<"photos">;

export type CompositeImage = {
	id: string;
	signedUrl: string;
	status: string;
};

/**
 * The "360" step. Synthesises the Room Composite — a single wide (3:2)
 * empty-room view stitched from every approved Structural Preview — then lets
 * the user approve it. The approved composite is what the final design is
 * generated against. UI label is "360 view"; see docs/design/360-step.md.
 */
export function RoomCompositeStep(props: {
	taskId: string;
	taskTitle: string;
	photos: PhotoRow[];
	roomState: TaskRoomState;
	composite: CompositeImage | null;
	onCompositeChange: (next: CompositeImage | null) => void;
	onApproved: () => void;
}) {
	const [building, setBuilding] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const composite = props.composite;
	const approved = composite?.status === "approved";

	async function build() {
		setBuilding(true);
		setError(null);
		try {
			const headers = await getAuthHeaders();
			const response = (await generateRoomComposite({
				data: {
					taskId: props.taskId,
					taskTitle: props.taskTitle,
					roomState: props.roomState,
				},
				headers,
			})) as { composite: CompositeImage };
			if (!response.composite) {
				throw new Error("Composite generation returned no image");
			}
			props.onCompositeChange(response.composite);
		} catch (caught) {
			if (caught instanceof Error && caught.message === UNAUTHENTICATED_ERROR) {
				window.location.assign("/auth");
				return;
			}
			setError(
				caught instanceof Error ? caught.message : "Failed to build 360 view"
			);
		} finally {
			setBuilding(false);
		}
	}

	async function approve() {
		if (!composite) return;
		try {
			const headers = await getAuthHeaders();
			await approveRoomComposite({
				data: { taskId: props.taskId, compositeId: composite.id },
				headers,
			});
			props.onCompositeChange({ ...composite, status: "approved" });
			props.onApproved();
		} catch (caught) {
			if (caught instanceof Error && caught.message === UNAUTHENTICATED_ERROR) {
				window.location.assign("/auth");
				return;
			}
			setError(
				caught instanceof Error ? caught.message : "Failed to approve 360 view"
			);
		}
	}

	return (
		<div className="grid gap-6 border border-border bg-surface p-10 max-md:p-6">
			<header className="grid gap-2">
				<h2 className="m-0 font-display font-medium text-2xl text-foreground tracking-tight">
					5. Build the 360 view
				</h2>
				<p className="m-0 max-w-[68ch] font-body text-[0.9375rem] text-ink-muted leading-relaxed">
					Combine your {props.photos.length} approved angles into one wide
					empty-room view of the whole captured room. The design is generated
					against this view, so it reflects the full room — not a single angle.
				</p>
				<p className="m-0 font-body text-ink-muted text-xs">
					This is a wide composite of the angles you photographed, not a literal
					360° wrap-around.
				</p>
				{approved ? (
					<p
						className="m-0 font-body text-[0.9375rem] text-ink-muted"
						role="status"
					>
						✓ Approved — ready for the Brief
					</p>
				) : null}
			</header>

			<div className="flex flex-wrap items-center gap-3">
				<Button disabled={building} onClick={() => void build()} type="button">
					{building
						? "Synthesising 360 view…"
						: composite
							? "Re-synthesize"
							: "Build 360 view"}
				</Button>
				{composite && !approved ? (
					<Button onClick={approve} type="button">
						Approve 360 view
					</Button>
				) : null}
				{error ? (
					<p className="m-0 text-sm text-warning" role="alert">
						{error}
					</p>
				) : null}
			</div>

			{composite ? (
				<figure className="grid gap-3">
					<img
						alt="Room composite 360 view"
						className="max-h-[32rem] w-full rounded border border-border object-contain"
						src={composite.signedUrl}
					/>
					<figcaption className="text-ink-muted text-sm">
						Approve only if the walls, openings, and kept objects look right
						across the whole view.
					</figcaption>
				</figure>
			) : (
				<p className="m-0 text-ink-muted text-sm">
					No 360 view yet. Build one from your approved angles to continue.
				</p>
			)}
		</div>
	);
}
