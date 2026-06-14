import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	pickReferencePhotoId,
	type TaskRoomState,
} from "@/lib/renovation/room-state";
import type { Tables } from "@/lib/types/database";
import {
	getAuthHeaders,
	UNAUTHENTICATED_ERROR,
} from "../../lib/server-client/auth-headers";
import {
	approveStructuralPreview,
	generateStructuralPreview,
} from "../../server/room-state";

type PhotoRow = Tables<"photos">;

type PreviewImage = {
	id: string;
	signedUrl: string;
};

export function LayoutPreviewStep(props: {
	taskId: string;
	taskTitle: string;
	photos: PhotoRow[];
	roomState: TaskRoomState;
	/** Latest preview per reference photo angle, keyed by photo id. */
	previews: Record<string, PreviewImage>;
	onStateChange: (next: TaskRoomState) => void;
	onPreviewGenerated: (photoId: string, image: PreviewImage) => void;
	onApproved: () => void;
}) {
	const [generating, setGenerating] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const preview = props.roomState.referencePhotoId
		? (props.previews[props.roomState.referencePhotoId] ?? null)
		: null;

	const persistedObjects = useMemo(
		() => props.roomState.objects.filter((entry) => entry.isPersisted),
		[props.roomState.objects]
	);

	useEffect(() => {
		if (props.roomState.referencePhotoId) return;
		const suggested =
			pickReferencePhotoId(props.roomState) ?? props.photos[0]?.id;
		if (!suggested) return;
		props.onStateChange({ ...props.roomState, referencePhotoId: suggested });
	}, [props.onStateChange, props.photos, props.roomState]);

	async function generatePreview() {
		const photoId = props.roomState.referencePhotoId;
		if (!photoId) return;
		setGenerating(true);
		setError(null);
		try {
			const headers = await getAuthHeaders();
			const response = (await generateStructuralPreview({
				data: {
					taskId: props.taskId,
					taskTitle: props.taskTitle,
					referencePhotoId: photoId,
					roomState: props.roomState,
				},
				headers,
			})) as {
				preview: PreviewImage;
			};
			const image = response.preview;
			if (!image) throw new Error("Preview generation returned no image");
			props.onPreviewGenerated(photoId, image);
			props.onStateChange({ ...props.roomState, previewApproved: false });
		} catch (caught) {
			if (caught instanceof Error && caught.message === UNAUTHENTICATED_ERROR) {
				window.location.assign("/auth");
				return;
			}
			setError(
				caught instanceof Error ? caught.message : "Failed to generate preview"
			);
		} finally {
			setGenerating(false);
		}
	}

	async function approvePreview() {
		if (!preview) return;
		try {
			const headers = await getAuthHeaders();
			await approveStructuralPreview({
				data: { taskId: props.taskId, previewId: preview.id },
				headers,
			});
			props.onStateChange({ ...props.roomState, previewApproved: true });
			props.onApproved();
		} catch (caught) {
			if (caught instanceof Error && caught.message === UNAUTHENTICATED_ERROR) {
				window.location.assign("/auth");
				return;
			}
			setError(
				caught instanceof Error ? caught.message : "Failed to approve preview"
			);
		}
	}

	return (
		<div className="grid gap-6 border border-border bg-surface p-10 max-md:p-6">
			<header className="grid gap-2">
				<h2 className="m-0 font-display font-medium text-2xl text-foreground tracking-tight">
					4. Approve the structural preview
				</h2>
				<p className="m-0 max-w-[68ch] font-body text-[0.9375rem] text-ink-muted leading-relaxed">
					Generate one empty-room confirmation image from the approved angle. If
					blue-mode objects are restyled incorrectly or the layout looks wrong,
					go back and fix the room evidence.
				</p>
			</header>

			<label className="grid max-w-sm gap-2 text-sm">
				<span>Reference photo angle</span>
				<select
					className="rounded border border-border bg-background px-3 py-2 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
					onChange={(event) => {
						props.onStateChange({
							...props.roomState,
							referencePhotoId: event.target.value,
							previewApproved: false,
						});
					}}
					value={props.roomState.referencePhotoId ?? ""}
				>
					{props.photos.map((photo) => (
						<option key={photo.id} value={photo.id}>
							{photo.original_name}
							{props.previews[photo.id] ? " — preview ready" : ""}
						</option>
					))}
				</select>
				<span className="text-ink-muted text-xs">
					Each angle keeps its latest generated preview — switch angles to
					compare before approving one.
				</span>
			</label>

			<div className="flex flex-wrap items-center gap-3">
				<Button
					disabled={generating || !props.roomState.referencePhotoId}
					onClick={() => void generatePreview()}
					type="button"
				>
					{generating
						? "Generating preview…"
						: preview
							? "Re-generate preview"
							: "Generate structural preview"}
				</Button>
				{preview ? (
					<Button onClick={approvePreview} type="button">
						Approve preview
					</Button>
				) : null}
				{error ? (
					<p className="m-0 text-sm text-warning" role="alert">
						{error}
					</p>
				) : null}
			</div>

			{persistedObjects.length === 0 ? (
				<p className="m-0 text-ink-muted text-sm">
					No persisted objects were selected. The preview will validate room
					geometry only.
				</p>
			) : null}

			{preview ? (
				<figure className="grid gap-3">
					<img
						alt="Structural preview"
						className="max-h-[32rem] w-full rounded border border-border object-contain"
						src={preview.signedUrl}
					/>
					<figcaption className="text-ink-muted text-sm">
						Approve only if the room shell and persisted objects match your
						understanding.
					</figcaption>
				</figure>
			) : null}
		</div>
	);
}
