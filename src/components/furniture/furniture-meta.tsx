import { formatFurnitureDimensions, formatFurniturePrice } from "@/lib/format";

export type FurnitureMetaProps = {
	brand: string | null;
	price: number | null;
	currency: string | null;
	widthCm: number | null;
	heightCm: number | null;
	depthCm: number | null;
	sourceLink: string | null;
};

/**
 * Read-only Link-Import metadata for a furniture card: brand, dimensions,
 * price, and a clickable Source Link. Every field is optional — the block
 * renders only the parts that are present, and nothing at all when the item
 * carries no metadata (manual adds), so it drops into both the Furniture page
 * cards and the generation-step picker rows without breaking their layout.
 */
export function FurnitureMeta(props: FurnitureMetaProps) {
	const dimensions = formatFurnitureDimensions(
		props.widthCm,
		props.heightCm,
		props.depthCm
	);
	const price = formatFurniturePrice(props.price, props.currency);

	if (!(props.brand || dimensions || price || props.sourceLink)) return null;

	return (
		<dl className="m-0 grid gap-0.5 text-[0.8125rem] text-ink-muted">
			{props.brand ? (
				<div className="flex gap-1.5">
					<dt className="sr-only">Brand</dt>
					<dd className="m-0">{props.brand}</dd>
				</div>
			) : null}
			{dimensions ? (
				<div className="flex gap-1.5">
					<dt className="sr-only">Dimensions</dt>
					<dd className="m-0">{dimensions}</dd>
				</div>
			) : null}
			{price ? (
				<div className="flex gap-1.5">
					<dt className="sr-only">Price</dt>
					<dd className="m-0">{price}</dd>
				</div>
			) : null}
			{props.sourceLink ? (
				<div className="flex gap-1.5">
					<dt className="sr-only">Source</dt>
					<dd className="m-0">
						<a
							className="text-gold underline underline-offset-2"
							href={props.sourceLink}
							rel="noopener noreferrer"
							target="_blank"
						>
							Source link
						</a>
					</dd>
				</div>
			) : null}
		</dl>
	);
}
