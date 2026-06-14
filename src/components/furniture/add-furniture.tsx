import { type ReactNode, useState } from "react";
import {
	FurniturePhotoPicker,
	type UploadedFurniturePhoto,
} from "@/components/furniture/furniture-photo-picker";
import { getAuthHeaders } from "../../lib/server-client/auth-headers";
import { createFurnitureItem } from "../../server/furniture";

/**
 * Manual add flow for the Furniture Library: pick a product image (used
 * as-is) or a phone photo (a draggable crop box marks which piece counts),
 * label it, and save. Uploads go straight to the furniture bucket via the
 * shared {@link FurniturePhotoPicker}; the created item row is reported through
 * `onSaved` so the host refreshes its own list (and, in the picker,
 * auto-includes the piece). The picker owns upload, error display, and the
 * unauthenticated redirect; this host only adds the label and creates the row.
 */
export function AddFurniture(props: {
	disabled?: boolean;
	onSaved: (created: { id: string }) => void | Promise<void>;
	/** Rendered next to the add button while no file is chosen. */
	children?: ReactNode;
}) {
	const [label, setLabel] = useState("");

	async function handleConfirm(photo: UploadedFurniturePhoto) {
		const headers = await getAuthHeaders();
		const created = await createFurnitureItem({
			data: {
				storagePath: photo.storagePath,
				originalName: photo.originalName,
				contentType: photo.contentType,
				label: label.trim(),
				source: photo.source,
			},
			headers,
		});
		await props.onSaved({ id: String(created.id) });
		setLabel("");
	}

	return (
		<FurniturePhotoPicker
			confirmDisabled={label.trim().length === 0}
			confirmLabel="Save furniture"
			confirmPendingLabel="Saving…"
			disabled={props.disabled}
			extraFields={
				<label className="grid max-w-md gap-1 text-sm">
					<span>What is this piece?</span>
					<input
						className="rounded border border-border bg-background px-3 py-2 outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
						onChange={(event) => setLabel(event.target.value)}
						placeholder="e.g. white 4-drawer dresser"
						value={label}
					/>
				</label>
			}
			idleChildren={props.children}
			idleLabel="Add furniture image"
			onCancel={() => setLabel("")}
			onConfirm={handleConfirm}
		/>
	);
}
