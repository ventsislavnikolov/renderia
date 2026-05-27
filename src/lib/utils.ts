import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * shadcn-style class composer: combines clsx (conditional class logic) with
 * tailwind-merge (resolves utility conflicts like `p-2 p-4` → `p-4`).
 *
 * Every shadcn component generated under `src/components/ui/` imports this.
 */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
