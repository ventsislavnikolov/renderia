import { findStylePreset, STYLE_PRESETS } from "@/lib/ai/style-presets";
import { cn } from "@/lib/utils";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./select";

/**
 * Style picker for the brief step. Renders one option per `StylePreset` in the
 * catalogue (see `src/lib/ai/style-presets.ts`) — adding a Style needs no UI
 * change. Selection is owned by the parent (persisted to `renovation_tasks.style`
 * server-side), so this component is purely controlled: no localStorage, no
 * internal default beyond resolving an unknown id back to Scandinavian.
 */
type Props = {
	value: string;
	onChange: (styleId: string) => void;
	disabled?: boolean;
};

export function StylePicker(props: Props) {
	const current = findStylePreset(props.value);

	return (
		<Select
			disabled={props.disabled}
			onValueChange={props.onChange}
			value={current.id}
		>
			<SelectTrigger
				aria-label="Choose a renovation style"
				className={cn(
					"max-w-sm border-border bg-background text-foreground",
					"font-body font-medium text-sm"
				)}
			>
				<SelectValue placeholder="Pick a style">{current.label}</SelectValue>
			</SelectTrigger>
			<SelectContent className="min-w-[320px]">
				{STYLE_PRESETS.map((preset) => (
					<SelectItem
						className="flex-col items-start gap-0.5 py-2"
						key={preset.id}
						value={preset.id}
					>
						<span className="font-semibold text-sm">{preset.label}</span>
						<span className="text-muted-foreground text-xs">
							{preset.summary}
						</span>
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
