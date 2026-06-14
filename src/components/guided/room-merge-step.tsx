import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { RoomObject, TaskRoomState } from "@/lib/renovation/room-state";
import {
	autoAssignObjectIds,
	invalidatePreview,
	reconcileRoomObjects,
} from "@/lib/renovation/room-state";
import type { Tables } from "@/lib/types/database";

type PhotoRow = Tables<"photos">;

const MODE_OPTIONS = [
	{ value: "exact_preserve", label: "Red: exact preserve" },
	{ value: "keep_type_restyle", label: "Blue: keep type, redesign" },
] as const;

function buildStateWithObjects(state: TaskRoomState, objects: RoomObject[]) {
	return invalidatePreview({ ...state, objects });
}

export function RoomMergeStep(props: {
	photos: PhotoRow[];
	roomState: TaskRoomState;
	onStateChange: (next: TaskRoomState) => void;
	onInvalidatePreview: () => void;
	onContinue: () => void;
}) {
	useEffect(() => {
		if (props.roomState.appearances.length === 0) return;
		const assigned = autoAssignObjectIds(props.roomState.appearances);
		const objects = reconcileRoomObjects(assigned, props.roomState.objects);
		const hasChanged =
			JSON.stringify(assigned) !==
				JSON.stringify(props.roomState.appearances) ||
			JSON.stringify(objects) !== JSON.stringify(props.roomState.objects);
		if (hasChanged) {
			props.onInvalidatePreview();
			props.onStateChange(
				invalidatePreview({
					...props.roomState,
					appearances: assigned,
					objects,
				})
			);
		}
	}, [props.onInvalidatePreview, props.onStateChange, props.roomState]);

	function updateObject(objectId: string, patch: Partial<RoomObject>) {
		props.onInvalidatePreview();
		props.onStateChange(
			buildStateWithObjects(
				props.roomState,
				props.roomState.objects.map((entry) =>
					entry.id === objectId ? { ...entry, ...patch } : entry
				)
			)
		);
	}

	function assignAppearance(appearanceId: string, nextObjectId: string) {
		const appearance = props.roomState.appearances.find(
			(entry) => entry.id === appearanceId
		);
		if (!appearance) return;

		const targetObjectId =
			nextObjectId === "__new__"
				? `manual:${appearance.kind}:${appearance.id}`
				: nextObjectId;
		const appearances = props.roomState.appearances.map((entry) =>
			entry.id === appearanceId ? { ...entry, objectId: targetObjectId } : entry
		);
		const objects = reconcileRoomObjects(appearances, props.roomState.objects);
		props.onInvalidatePreview();
		props.onStateChange(
			invalidatePreview({ ...props.roomState, appearances, objects })
		);
	}

	const appearanceById = new Map(
		props.roomState.appearances.map((entry) => [entry.id, entry])
	);

	return (
		<div className="grid gap-6 border border-border bg-surface p-10 max-md:p-6">
			<header className="grid gap-2">
				<h2 className="m-0 font-display font-medium text-2xl text-foreground tracking-tight">
					3. Merge room objects
				</h2>
				<p className="m-0 max-w-[68ch] font-body text-[0.9375rem] text-ink-muted leading-relaxed">
					Review the canonical room objects created from each angle. Red keeps
					the exact element. Blue keeps the same type and footprint but allows a
					new design.
				</p>
			</header>

			{props.roomState.objects.length === 0 ? (
				<p className="m-0 text-ink-muted text-sm">
					No room objects yet. Review photos first or add manual appearances.
				</p>
			) : null}

			<div className="grid gap-4">
				{props.roomState.objects.map((object) => (
					<article
						className="grid gap-3 rounded border border-border p-4"
						key={object.id}
					>
						<div className="grid gap-2 md:grid-cols-2">
							<label className="grid gap-1 text-sm">
								<span>Object label</span>
								<input
									className="rounded border border-border bg-background px-3 py-2"
									onChange={(event) =>
										updateObject(object.id, { label: event.target.value })
									}
									value={object.label}
								/>
							</label>
							<label className="grid gap-1 text-sm">
								<span>Mode</span>
								<select
									className="rounded border border-border bg-background px-3 py-2 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
									onChange={(event) =>
										updateObject(object.id, {
											preservationMode: event.target
												.value as RoomObject["preservationMode"],
										})
									}
									value={object.preservationMode}
								>
									{MODE_OPTIONS.map((option) => (
										<option key={option.value} value={option.value}>
											{option.label}
										</option>
									))}
								</select>
							</label>
						</div>
						<label className="flex items-center gap-2 text-sm">
							<input
								checked={object.isPersisted}
								onChange={(event) =>
									updateObject(object.id, { isPersisted: event.target.checked })
								}
								type="checkbox"
							/>
							Persist this object in preview and final design
						</label>
						<ul className="m-0 grid list-none gap-2 p-0">
							{object.appearanceIds.map((appearanceId) => {
								const appearance = appearanceById.get(appearanceId);
								if (!appearance) return null;
								const photoName =
									props.photos.find((photo) => photo.id === appearance.photoId)
										?.original_name ?? appearance.photoId;
								return (
									<li
										className="grid gap-2 rounded border border-border p-3"
										key={appearance.id}
									>
										<div className="text-foreground text-sm">
											{appearance.label} in {photoName}
										</div>
										<select
											aria-label={`Room object for ${appearance.label} in ${photoName}`}
											className="rounded border border-border bg-background px-3 py-2 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
											onChange={(event) =>
												assignAppearance(appearance.id, event.target.value)
											}
											value={appearance.objectId ?? ""}
										>
											{props.roomState.objects.map((option) => (
												<option key={option.id} value={option.id}>
													{option.label}
												</option>
											))}
											<option value="__new__">Create new room object</option>
										</select>
									</li>
								);
							})}
						</ul>
					</article>
				))}
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<Button onClick={props.onContinue} type="button">
					Continue to structural preview
				</Button>
			</div>
		</div>
	);
}
