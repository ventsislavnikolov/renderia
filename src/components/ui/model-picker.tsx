import { useId, useState } from "react";
import {
	type ModelCapability,
	type ModelKind,
	type ModelSelection,
	modelKey,
	modelLabel,
	TEXT_VISION_MODELS,
} from "@/lib/ai/models";

export function ModelPicker(props: {
	capability: ModelCapability;
	kind: ModelKind;
	onChange: (selection: ModelSelection) => void;
}) {
	const id = useId();
	const models =
		props.kind === "text-vision" ? TEXT_VISION_MODELS : TEXT_VISION_MODELS;
	const [value, setValue] = useState(modelKey(models[0] as ModelSelection));

	function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
		const selected =
			models.find((model) => modelKey(model) === event.target.value) ??
			models[0];
		if (!selected) return;
		setValue(modelKey(selected));
		props.onChange(selected);
	}

	return (
		<label
			className="inline-flex items-center gap-2 font-body text-[0.8125rem] text-ink-muted"
			htmlFor={id}
		>
			<span className="sr-only">{props.capability} model</span>
			<select
				className="min-h-9 rounded-md border border-border bg-surface px-2 text-foreground"
				id={id}
				onChange={handleChange}
				value={value}
			>
				{models.map((model) => (
					<option key={modelKey(model)} value={modelKey(model)}>
						{modelLabel(model)}
					</option>
				))}
			</select>
		</label>
	);
}
