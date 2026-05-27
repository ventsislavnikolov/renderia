import { useEffect, useMemo, useRef, useState } from "react";
import {
	DEFAULT_TEXT_MODEL,
	MODEL_CATALOG,
	type ModelEntry,
	type ModelKind,
	type ModelSelection,
	modelsForKind,
} from "@/lib/ai/models";
import { cn } from "@/lib/utils";
import { Badge } from "./badge";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "./select";

/**
 * Codex-style model picker, now built on shadcn `<Select>` instead of a
 * hand-rolled dropdown. Persists the user's last selection per `capability`
 * in localStorage and fires `onChange` with `{ provider, model }` whenever
 * it changes.
 *
 * Each `<SelectItem>`'s value is encoded as `provider:model` so it round-trips
 * through Radix's string-only value contract; the encoding lives in two small
 * helpers below so the wire shape stays in one place.
 */

type Props = {
	capability: string;
	kind: ModelKind;
	onChange?: (selection: ModelSelection) => void;
};

const STORAGE_PREFIX = "renderia.model.";
const VALUE_SEPARATOR = "::";

function encode(selection: ModelSelection): string {
	return `${selection.provider}${VALUE_SEPARATOR}${selection.model}`;
}

function decode(value: string): ModelSelection | null {
	const [provider, model] = value.split(VALUE_SEPARATOR);
	if (!(provider && model)) return null;
	const entry = MODEL_CATALOG.find(
		(item) => item.provider === provider && item.id === model
	);
	if (!entry) return null;
	return { provider: entry.provider, model: entry.id };
}

function readPersisted(capability: string): ModelSelection | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(STORAGE_PREFIX + capability);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<ModelSelection>;
		if (
			parsed &&
			typeof parsed.model === "string" &&
			typeof parsed.provider === "string"
		) {
			return { provider: parsed.provider, model: parsed.model };
		}
	} catch {
		/* Corrupt JSON — fall through to defaults. */
	}
	return null;
}

function persist(capability: string, selection: ModelSelection) {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(
			STORAGE_PREFIX + capability,
			JSON.stringify(selection)
		);
	} catch {
		/* Storage disabled (private mode) — current-session selection still works. */
	}
}

function providerName(id: string): string {
	switch (id) {
		case "openai":
			return "OpenAI";
		case "google":
			return "Google";
		case "anthropic":
			return "Anthropic";
		case "zai":
			return "Z.AI";
		case "moonshot":
			return "Moonshot";
		case "mock":
			return "Mock";
		default:
			return id;
	}
}

export function ModelPicker(props: Props) {
	const options = useMemo(() => modelsForKind(props.kind), [props.kind]);

	// Group options by provider so the dropdown renders one section per
	// provider — easier to scan than a flat list when many providers exist.
	const grouped = useMemo(() => {
		const map = new Map<string, ModelEntry[]>();
		for (const entry of options) {
			const list = map.get(entry.provider) ?? [];
			list.push(entry);
			map.set(entry.provider, list);
		}
		return Array.from(map.entries());
	}, [options]);

	const [selection, setSelection] = useState<ModelSelection>(() => {
		const persisted = readPersisted(props.capability);
		if (
			persisted &&
			options.some(
				(entry) =>
					entry.provider === persisted.provider && entry.id === persisted.model
			)
		) {
			return persisted;
		}
		const fallback = options[0];
		return fallback
			? { provider: fallback.provider, model: fallback.id }
			: DEFAULT_TEXT_MODEL;
	});

	// Stable ref to the onChange callback so the notify effect only re-fires
	// on real selection changes, not on parent re-renders that pass a fresh
	// callback identity.
	const onChangeRef = useRef(props.onChange);
	useEffect(() => {
		onChangeRef.current = props.onChange;
	}, [props.onChange]);

	useEffect(() => {
		onChangeRef.current?.(selection);
	}, [selection]);

	function handleChange(value: string) {
		const next = decode(value);
		if (!next) return;
		setSelection(next);
		persist(props.capability, next);
	}

	const current = options.find(
		(entry) =>
			entry.provider === selection.provider && entry.id === selection.model
	);

	return (
		<Select onValueChange={handleChange} value={encode(selection)}>
			<SelectTrigger
				aria-label="Choose AI model"
				className={cn(
					"rounded-full border-border bg-surface text-foreground hover:bg-background",
					"font-body font-medium text-[0.8125rem]"
				)}
				size="sm"
			>
				<SelectValue placeholder="Pick a model">
					<span className="flex items-center gap-2">
						<span>{current?.label ?? selection.model}</span>
						{current?.freeTier ? (
							<Badge
								className="bg-emerald-500/15 px-1.5 py-0 font-semibold text-[10px] text-emerald-700 uppercase tracking-wide hover:bg-emerald-500/15"
								variant="secondary"
							>
								free
							</Badge>
						) : null}
					</span>
				</SelectValue>
			</SelectTrigger>
			<SelectContent className="min-w-[300px]">
				{grouped.map(([provider, entries]) => (
					<SelectGroup key={provider}>
						<SelectLabel className="font-semibold text-[0.6875rem] text-ink-subtle uppercase tracking-wider">
							{providerName(provider)}
						</SelectLabel>
						{entries.map((entry) => (
							<SelectItem
								className="flex-col items-start gap-0.5 py-2"
								key={`${entry.provider}:${entry.id}`}
								value={encode({ provider: entry.provider, model: entry.id })}
							>
								<span className="flex items-center gap-2 font-semibold text-sm">
									{entry.label}
									{entry.freeTier ? (
										<Badge
											className="bg-emerald-500/15 px-1.5 py-0 font-semibold text-[10px] text-emerald-700 uppercase tracking-wide hover:bg-emerald-500/15"
											variant="secondary"
										>
											free
										</Badge>
									) : null}
								</span>
								{entry.notes ? (
									<span className="text-muted-foreground text-xs">
										{entry.notes}
									</span>
								) : null}
							</SelectItem>
						))}
					</SelectGroup>
				))}
			</SelectContent>
		</Select>
	);
}
