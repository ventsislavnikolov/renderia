import type * as React from "react";
import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, ...props }: TextareaProps) {
	return (
		<textarea
			className={cn(
				"w-full rounded-md border border-border bg-surface px-3 py-2 font-body text-foreground",
				"placeholder:text-ink-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
				"disabled:cursor-not-allowed disabled:opacity-50",
				className,
			)}
			{...props}
		/>
	);
}
