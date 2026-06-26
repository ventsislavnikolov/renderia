import { Button } from "@/components/ui/button";
import { PhotoTile } from "@/components/ui/photo-tile";
import type { TaskRoomState } from "@/lib/renovation/room-state";
import type { Tables } from "@/lib/types/database";

type PhotoRow = Tables<"photos">;
type PreviewImage = { id: string; signedUrl: string };

/**
 * The "Room" step (05). A read-only review of every approved per-angle
 * Structural Preview shown side by side, so the user confirms the whole room
 * before writing the brief. There is no AI synthesis here: the final design is
 * generated against each of these approved angles independently (see
 * generation.ts), which keeps every output coherent — unlike the earlier Room
 * Composite, which stitched non-overlapping corners into one incoherent frame.
 */
export function RoomReviewStep(props: {
	photos: PhotoRow[];
	roomState: TaskRoomState;
	previews: Record<string, PreviewImage>;
	onNext: () => void;
}) {
	const angles = props.roomState.photoIds
		.map((photoId) => {
			const preview = props.previews[photoId];
			if (!preview) return null;
			const photo = props.photos.find((entry) => entry.id === photoId);
			return {
				photoId,
				signedUrl: preview.signedUrl,
				name: photo?.original_name ?? "Angle",
			};
		})
		.filter((angle): angle is NonNullable<typeof angle> => angle !== null);

	return (
		<div className="grid gap-6 border border-border bg-surface p-10 max-md:p-6">
			<header className="grid gap-2">
				<h2 className="m-0 font-display font-medium text-2xl text-foreground tracking-tight">
					5. Review the whole room
				</h2>
				<p className="m-0 max-w-[68ch] font-body text-[0.9375rem] text-ink-muted leading-relaxed">
					These are your {angles.length} approved angles. The design is
					generated against each one, so it reflects the whole room — every
					angle stays a clean, coherent view rather than one stitched frame.
				</p>
				<p className="m-0 font-body text-ink-muted text-xs">
					Make sure the walls, openings, and kept objects look right before you
					continue.
				</p>
			</header>

			{angles.length > 0 ? (
				<ul className="grid list-none grid-cols-2 gap-4 p-0 max-md:grid-cols-1">
					{angles.map((angle) => (
						<li className="grid gap-2" key={angle.photoId}>
							<PhotoTile
								alt={`Approved angle: ${angle.name}`}
								className="aspect-[4/3] w-full rounded border border-border"
								imageClassName="object-cover"
								status="ready"
								url={angle.signedUrl}
							/>
						</li>
					))}
				</ul>
			) : (
				<p className="m-0 text-ink-muted text-sm">
					No approved angles yet. Approve every angle in the Preview step to
					continue.
				</p>
			)}

			<div className="flex flex-wrap items-center gap-3">
				<Button
					disabled={angles.length === 0}
					onClick={props.onNext}
					type="button"
				>
					Continue to brief
				</Button>
			</div>
		</div>
	);
}
