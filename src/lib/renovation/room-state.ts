export type RoomElementKind =
	| "window"
	| "door"
	| "radiator"
	| "stairs"
	| "ceiling_line"
	| "wall_edge"
	| "structure"
	| "column_beam"
	| "built_in"
	| "other";

export type PreservationMode = "exact_preserve" | "keep_type_restyle";

export type RoomAppearance = {
	id: string;
	photoId: string;
	label: string;
	kind: RoomElementKind;
	x: number;
	y: number;
	width: number;
	height: number;
	confidence: number | null;
	source: "ai" | "manual";
	objectId: string | null;
};

export type RoomObject = {
	id: string;
	label: string;
	kind: RoomElementKind;
	preservationMode: PreservationMode;
	appearanceIds: string[];
	isPersisted: boolean;
};

export type TaskRoomState = {
	photoIds: string[];
	reviewedPhotoIds: string[];
	referencePhotoId: string | null;
	appearances: RoomAppearance[];
	objects: RoomObject[];
	/**
	 * Photos whose latest Structural Preview the user has approved. The flow
	 * needs an approved preview for *every* kept photo before the design can be
	 * generated per angle, so approval is tracked per photo rather than as a
	 * single room-wide flag.
	 */
	approvedPhotoIds: string[];
};

function normalizeLabel(label: string) {
	return label.trim().toLowerCase().replace(/\s+/g, " ");
}

function defaultObjectId(kind: string, label: string) {
	return `${kind}:${normalizeLabel(label).replace(/[^a-z0-9]+/g, "-")}`;
}

export function buildInitialRoomState(photoIds: string[]): TaskRoomState {
	if (photoIds.length < 1 || photoIds.length > 4) {
		throw new Error("Room sets must contain 1 to 4 photos.");
	}
	return {
		photoIds,
		reviewedPhotoIds: [],
		referencePhotoId: null,
		appearances: [],
		objects: [],
		approvedPhotoIds: [],
	};
}

/**
 * True only when the room set has at least one photo and every kept photo has
 * an approved Structural Preview. This is the gate that unlocks the read-only
 * Room review, the Brief, and Generate.
 */
export function allPreviewsApproved(state: TaskRoomState): boolean {
	return (
		state.photoIds.length > 0 &&
		state.photoIds.every((photoId) => state.approvedPhotoIds.includes(photoId))
	);
}

/**
 * Add or remove a photo from the approved set, keeping `approvedPhotoIds`
 * free of duplicates. Approving an already-approved photo is a no-op.
 */
export function setPhotoPreviewApproved(
	state: TaskRoomState,
	photoId: string,
	approved: boolean
): TaskRoomState {
	const has = state.approvedPhotoIds.includes(photoId);
	if (approved === has) return state;
	return {
		...state,
		approvedPhotoIds: approved
			? [...state.approvedPhotoIds, photoId]
			: state.approvedPhotoIds.filter((id) => id !== photoId),
	};
}

export function suggestRoomObjects(
	appearances: RoomAppearance[]
): RoomObject[] {
	const groups = new Map<string, RoomAppearance[]>();
	for (const entry of appearances) {
		const key = `${entry.kind}:${normalizeLabel(entry.label)}`;
		const group = groups.get(key);
		if (group) {
			group.push(entry);
		} else {
			groups.set(key, [entry]);
		}
	}
	return Array.from(groups.entries()).map(([key, entries]) => {
		const first = entries[0];
		if (!first) {
			throw new Error(`Missing appearance for key ${key}`);
		}
		return {
			id: defaultObjectId(first.kind, first.label),
			label: normalizeLabel(first.label),
			kind: first.kind,
			preservationMode: "exact_preserve" as const,
			appearanceIds: entries.map((entry) => entry.id),
			isPersisted: true,
		};
	});
}

export function autoAssignObjectIds(
	appearances: RoomAppearance[]
): RoomAppearance[] {
	return appearances.map((entry) => ({
		...entry,
		objectId: entry.objectId ?? defaultObjectId(entry.kind, entry.label),
	}));
}

export function reconcileRoomObjects(
	appearances: RoomAppearance[],
	previous: RoomObject[]
): RoomObject[] {
	const previousById = new Map(previous.map((entry) => [entry.id, entry]));
	const groups = new Map<string, RoomAppearance[]>();
	for (const entry of appearances) {
		const objectId = entry.objectId ?? defaultObjectId(entry.kind, entry.label);
		const group = groups.get(objectId);
		if (group) group.push({ ...entry, objectId });
		else groups.set(objectId, [{ ...entry, objectId }]);
	}

	return Array.from(groups.entries()).map(([id, group]) => {
		const first = group[0];
		const existing = previousById.get(id);
		if (!first) {
			throw new Error(`Missing grouped appearance for object ${id}`);
		}
		return {
			id,
			label: existing?.label ?? normalizeLabel(first.label),
			kind: existing?.kind ?? first.kind,
			preservationMode: existing?.preservationMode ?? "exact_preserve",
			appearanceIds: group.map((entry) => entry.id),
			isPersisted: existing?.isPersisted ?? true,
		};
	});
}

/**
 * Keep a bounding box inside the unit square. The database enforces
 * `x + width <= 1` (and the y/height pair), so an AI-detected box that
 * hangs past the photo edge would otherwise reject the whole save.
 */
export function clampAppearanceBox<
	T extends Pick<RoomAppearance, "x" | "y" | "width" | "height">,
>(box: T): T {
	const x = Math.min(Math.max(box.x, 0), 0.99);
	const y = Math.min(Math.max(box.y, 0), 0.99);
	return {
		...box,
		x,
		y,
		width: Math.min(Math.max(box.width, 0.01), 1 - x),
		height: Math.min(Math.max(box.height, 0.01), 1 - y),
	};
}

export function invalidatePreview(state: TaskRoomState): TaskRoomState {
	return { ...state, approvedPhotoIds: [] };
}

export function pickReferencePhotoId(state: TaskRoomState): string | null {
	const reviewed = state.photoIds.filter((photoId) =>
		state.reviewedPhotoIds.includes(photoId)
	);
	if (reviewed.length === 0) return null;

	const objectById = new Map(state.objects.map((entry) => [entry.id, entry]));
	const score = (photoId: string) => {
		const visiblePersisted = state.appearances.filter((entry) => {
			if (entry.photoId !== photoId || !entry.objectId) return false;
			return objectById.get(entry.objectId)?.isPersisted === true;
		}).length;
		const visibleTotal = state.appearances.filter(
			(entry) => entry.photoId === photoId
		).length;
		return { visiblePersisted, visibleTotal };
	};

	const sorted = reviewed.slice().sort((left, right) => {
		const leftScore = score(left);
		const rightScore = score(right);
		if (rightScore.visiblePersisted !== leftScore.visiblePersisted) {
			return rightScore.visiblePersisted - leftScore.visiblePersisted;
		}
		if (rightScore.visibleTotal !== leftScore.visibleTotal) {
			return rightScore.visibleTotal - leftScore.visibleTotal;
		}
		return state.photoIds.indexOf(left) - state.photoIds.indexOf(right);
	});
	return sorted[0] ?? null;
}

export function getReferenceProtectedElements(state: TaskRoomState): Array<{
	label: string;
	kind: RoomElementKind;
	x: number;
	y: number;
	width: number;
	height: number;
	confidence?: number;
}> {
	if (!state.referencePhotoId) return [];
	const objectById = new Map(state.objects.map((entry) => [entry.id, entry]));
	return state.appearances
		.filter((entry) => entry.photoId === state.referencePhotoId)
		.filter((entry) => {
			if (!entry.objectId) return false;
			return objectById.get(entry.objectId)?.isPersisted === true;
		})
		.map((entry) => ({
			label: entry.label,
			kind: entry.kind,
			x: entry.x,
			y: entry.y,
			width: entry.width,
			height: entry.height,
			confidence: entry.confidence ?? undefined,
		}));
}

/**
 * Protected elements for the whole-room design: one entry per persisted Room
 * Object, drawn from its appearances across *all* photos (not a single
 * reference angle). Deduplicates by object so an element seen from several
 * angles is listed once, using its first appearance's box.
 */
export function getAllProtectedElements(state: TaskRoomState): Array<{
	label: string;
	kind: RoomElementKind;
	x: number;
	y: number;
	width: number;
	height: number;
	confidence?: number;
}> {
	const objectById = new Map(state.objects.map((entry) => [entry.id, entry]));
	const seenObjectIds = new Set<string>();
	const result: Array<{
		label: string;
		kind: RoomElementKind;
		x: number;
		y: number;
		width: number;
		height: number;
		confidence?: number;
	}> = [];
	for (const entry of state.appearances) {
		if (!entry.objectId) continue;
		if (objectById.get(entry.objectId)?.isPersisted !== true) continue;
		if (seenObjectIds.has(entry.objectId)) continue;
		seenObjectIds.add(entry.objectId);
		result.push({
			label: entry.label,
			kind: entry.kind,
			x: entry.x,
			y: entry.y,
			width: entry.width,
			height: entry.height,
			confidence: entry.confidence ?? undefined,
		});
	}
	return result;
}
