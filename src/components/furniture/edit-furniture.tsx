import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	getAuthHeaders,
	UNAUTHENTICATED_ERROR,
} from "../../lib/server-client/auth-headers";
import { updateFurnitureItem } from "../../server/furniture";

export type EditableFurnitureItem = {
	id: string;
	label: string;
	widthCm: number | null;
	heightCm: number | null;
	depthCm: number | null;
};

function toInputValue(value: number | null): string {
	return value === null ? "" : String(value);
}

/** Blank → null (cleared); a positive number → that number; anything else → invalid. */
function parseDimension(raw: string): number | null | undefined {
	const trimmed = raw.trim();
	if (trimmed === "") return null;
	const parsed = Number(trimmed);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Edit an item's user-correctable fields — its label and the three dimensions
 * — after creation, so a wrong import (or a manual add) can be fixed without
 * re-uploading. Rendered as a controlled dialog: a non-null `item` opens it
 * pre-filled; the saved values flow back through `onSaved` for the parent to
 * fold into its list. Dimensions may be cleared by emptying the field.
 */
export function EditFurniture(props: {
	item: EditableFurnitureItem | null;
	onClose: () => void;
	onSaved: (updated: EditableFurnitureItem) => void;
}) {
	const [label, setLabel] = useState("");
	const [width, setWidth] = useState("");
	const [height, setHeight] = useState("");
	const [depth, setDepth] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const item = props.item;

	useEffect(() => {
		if (!item) return;
		setLabel(item.label);
		setWidth(toInputValue(item.widthCm));
		setHeight(toInputValue(item.heightCm));
		setDepth(toInputValue(item.depthCm));
		setError(null);
	}, [item]);

	async function save() {
		if (!item) return;
		const trimmedLabel = label.trim();
		if (trimmedLabel.length === 0) {
			setError("Give the piece a name.");
			return;
		}
		const widthCm = parseDimension(width);
		const heightCm = parseDimension(height);
		const depthCm = parseDimension(depth);
		if (
			widthCm === undefined ||
			heightCm === undefined ||
			depthCm === undefined
		) {
			setError("Dimensions must be positive numbers in cm, or left blank.");
			return;
		}
		setSaving(true);
		setError(null);
		try {
			const headers = await getAuthHeaders();
			await updateFurnitureItem({
				data: {
					furnitureItemId: item.id,
					label: trimmedLabel,
					widthCm,
					heightCm,
					depthCm,
				},
				headers,
			});
			props.onSaved({
				id: item.id,
				label: trimmedLabel,
				widthCm,
				heightCm,
				depthCm,
			});
		} catch (caught) {
			if (caught instanceof Error && caught.message === UNAUTHENTICATED_ERROR) {
				window.location.assign("/sign-in");
				return;
			}
			setError(
				caught instanceof Error ? caught.message : "Failed to update furniture"
			);
		} finally {
			setSaving(false);
		}
	}

	return (
		<Dialog
			onOpenChange={(open) => {
				if (!open) props.onClose();
			}}
			open={item !== null}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit furniture</DialogTitle>
					<DialogDescription>
						Fix the name or dimensions. Leave a dimension blank if you don't
						know it.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-3">
					<label className="grid gap-1 text-sm">
						<span>Name</span>
						<input
							className="rounded border border-border bg-background px-3 py-2 outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
							onChange={(event) => setLabel(event.target.value)}
							placeholder="e.g. white 4-drawer dresser"
							value={label}
						/>
					</label>
					<div className="grid grid-cols-3 gap-3">
						<label className="grid gap-1 text-sm">
							<span>Width (cm)</span>
							<input
								className="rounded border border-border bg-background px-3 py-2 outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
								inputMode="decimal"
								onChange={(event) => setWidth(event.target.value)}
								value={width}
							/>
						</label>
						<label className="grid gap-1 text-sm">
							<span>Height (cm)</span>
							<input
								className="rounded border border-border bg-background px-3 py-2 outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
								inputMode="decimal"
								onChange={(event) => setHeight(event.target.value)}
								value={height}
							/>
						</label>
						<label className="grid gap-1 text-sm">
							<span>Depth (cm)</span>
							<input
								className="rounded border border-border bg-background px-3 py-2 outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
								inputMode="decimal"
								onChange={(event) => setDepth(event.target.value)}
								value={depth}
							/>
						</label>
					</div>
					{error ? (
						<p className="m-0 text-sm text-warning" role="alert">
							{error}
						</p>
					) : null}
				</div>
				<DialogFooter>
					<DialogClose asChild>
						<Button disabled={saving} type="button" variant="outline">
							Cancel
						</Button>
					</DialogClose>
					<Button disabled={saving} onClick={() => void save()} type="button">
						{saving ? "Saving…" : "Save changes"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
