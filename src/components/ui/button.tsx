import type * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "outline" | "ghost";
type ButtonSize = "default" | "sm";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: ButtonVariant;
	size?: ButtonSize;
};

const variantClass: Record<ButtonVariant, string> = {
	default:
		"border border-foreground bg-foreground text-background hover:bg-foreground/90",
	outline:
		"border border-border bg-transparent text-foreground hover:bg-background",
	ghost:
		"border border-transparent bg-transparent text-foreground hover:bg-background",
};

const sizeClass: Record<ButtonSize, string> = {
	default: "min-h-10 px-4 py-2 text-[0.9375rem]",
	sm: "min-h-8 px-3 py-1.5 text-[0.8125rem]",
};

export function Button({
	className,
	variant = "default",
	size = "default",
	type = "button",
	...props
}: ButtonProps) {
	return (
		<button
			className={cn(
				"inline-flex items-center justify-center gap-2 rounded-md font-body font-medium transition-colors",
				"disabled:cursor-not-allowed disabled:opacity-50",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/25",
				variantClass[variant],
				sizeClass[size],
				className,
			)}
			type={type}
			{...props}
		/>
	);
}
