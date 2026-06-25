import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
	getAuthHeaders,
	UNAUTHENTICATED_ERROR,
} from "../../lib/server-client/auth-headers";
import type { Tables } from "../../lib/types/database";
import { useWorkspace } from "../../lib/workspace-context";
import { deleteTask, updateTask } from "../../server/tasks";

type TaskRow = Tables<"renovation_tasks">;

/**
 * Per-room (task) Edit / Delete affordance: a kebab menu plus the edit and
 * delete-confirm dialogs. The room analog of {@link ProjectActionsMenu}, so it
 * is dropped into both the room list (one per row) and the room detail header.
 *
 * After a successful mutation it refreshes the shared workspace (so the sidebar
 * and any cached lists update) and calls `onMutated` to let the host refresh
 * its own local state. `onDeleted` lets the detail page navigate away once its
 * room is gone; the list omits it and simply lets the refresh drop the row.
 */
export function RoomActionsMenu({
	task,
	onActionComplete,
	onMutated,
	onDeleted,
	align = "end",
	triggerClassName,
}: {
	task: TaskRow;
	onActionComplete?: (message: string) => void;
	onMutated?: () => void | Promise<void>;
	onDeleted?: () => void;
	align?: "start" | "center" | "end";
	triggerClassName?: string;
}) {
	const { refreshProjects } = useWorkspace();

	const [editOpen, setEditOpen] = useState(false);
	const [editTitle, setEditTitle] = useState(task.title);
	const [editCategory, setEditCategory] = useState(task.category);
	const [editNotes, setEditNotes] = useState(task.notes ?? "");
	const [editError, setEditError] = useState<string | null>(null);
	const [editSubmitting, setEditSubmitting] = useState(false);

	const [deleteOpen, setDeleteOpen] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [deleteSubmitting, setDeleteSubmitting] = useState(false);

	const cancelledRef = useRef(false);
	useEffect(() => {
		cancelledRef.current = false;
		return () => {
			cancelledRef.current = true;
		};
	}, []);

	function handleUnauthenticated(error: unknown): boolean {
		if (error instanceof Error && error.message === UNAUTHENTICATED_ERROR) {
			window.location.assign("/sign-in");
			return true;
		}
		return false;
	}

	function openEdit() {
		setEditTitle(task.title);
		setEditCategory(task.category);
		setEditNotes(task.notes ?? "");
		setEditError(null);
		setEditOpen(true);
	}

	async function handleEdit(event: React.FormEvent) {
		event.preventDefault();
		setEditError(null);
		setEditSubmitting(true);
		try {
			const headers = await getAuthHeaders();
			await updateTask({
				data: {
					taskId: task.id,
					title: editTitle.trim(),
					category: editCategory.trim(),
					notes: editNotes.trim() || undefined,
				},
				headers,
			});
			if (cancelledRef.current) return;
			await refreshProjects();
			await onMutated?.();
			if (cancelledRef.current) return;
			setEditOpen(false);
			onActionComplete?.("Room updated.");
		} catch (error) {
			if (cancelledRef.current) return;
			if (handleUnauthenticated(error)) return;
			setEditError(error instanceof Error ? error.message : "Failed to save");
		} finally {
			if (!cancelledRef.current) setEditSubmitting(false);
		}
	}

	async function handleDelete() {
		setDeleteError(null);
		setDeleteSubmitting(true);
		try {
			const headers = await getAuthHeaders();
			await deleteTask({ data: { taskId: task.id }, headers });
			if (cancelledRef.current) return;
			await refreshProjects();
			await onMutated?.();
			if (cancelledRef.current) return;
			setDeleteOpen(false);
			onActionComplete?.(`Deleted “${task.title}”.`);
			onDeleted?.();
		} catch (error) {
			if (cancelledRef.current) return;
			if (handleUnauthenticated(error)) return;
			setDeleteError(
				error instanceof Error ? error.message : "Failed to delete"
			);
		} finally {
			if (!cancelledRef.current) setDeleteSubmitting(false);
		}
	}

	const editValid =
		editTitle.trim().length > 0 && editCategory.trim().length > 0;

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						className={triggerClassName}
						size="icon-sm"
						type="button"
						variant="ghost"
					>
						<MoreVertical aria-hidden="true" className="size-4" />
						<span className="sr-only">Actions for {task.title}</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align={align}>
					<DropdownMenuItem onSelect={() => openEdit()}>
						<Pencil aria-hidden="true" className="size-4" />
						Edit
					</DropdownMenuItem>
					<DropdownMenuItem
						className="text-destructive focus:text-destructive"
						onSelect={() => {
							setDeleteError(null);
							setDeleteOpen(true);
						}}
					>
						<Trash2 aria-hidden="true" className="size-4" />
						Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<Dialog
				onOpenChange={(open) => {
					setEditOpen(open);
					if (!open) setEditError(null);
				}}
				open={editOpen}
			>
				<DialogContent className="gap-0 overflow-hidden border-border bg-background p-0 shadow-2xl sm:max-w-[540px]">
					<form
						aria-busy={editSubmitting}
						className="grid gap-5 p-6"
						onSubmit={handleEdit}
					>
						<DialogHeader className="gap-1.5 pr-8">
							<DialogTitle className="font-body font-semibold text-[1.125rem] tracking-tight">
								Edit room
							</DialogTitle>
							<DialogDescription className="text-[0.875rem] leading-5">
								Update the title, category, and notes.
							</DialogDescription>
						</DialogHeader>
						<div className="grid gap-4">
							<label
								className="grid gap-2 font-body font-medium text-[0.8125rem] text-foreground"
								htmlFor={`edit-task-title-${task.id}`}
							>
								Title
								<Input
									aria-describedby={
										editError ? `edit-task-error-${task.id}` : undefined
									}
									aria-invalid={editError ? true : undefined}
									className="h-10 bg-surface-2 text-[0.9375rem]"
									id={`edit-task-title-${task.id}`}
									maxLength={200}
									onChange={(event) => setEditTitle(event.target.value)}
									placeholder="Living room"
									required
									value={editTitle}
								/>
							</label>
							<label
								className="grid gap-2 font-body font-medium text-[0.8125rem] text-foreground"
								htmlFor={`edit-task-category-${task.id}`}
							>
								Category
								<Input
									className="h-10 bg-surface-2 text-[0.9375rem]"
									id={`edit-task-category-${task.id}`}
									maxLength={200}
									onChange={(event) => setEditCategory(event.target.value)}
									placeholder="living room, kitchen, facade"
									required
									value={editCategory}
								/>
							</label>
							<label
								className="grid gap-2 font-body font-medium text-[0.8125rem] text-foreground"
								htmlFor={`edit-task-notes-${task.id}`}
							>
								Notes
								<Textarea
									className="min-h-24 resize-none bg-surface-2 text-[0.9375rem]"
									id={`edit-task-notes-${task.id}`}
									maxLength={4000}
									onChange={(event) => setEditNotes(event.target.value)}
									placeholder="Optional context for the AI provider."
									value={editNotes}
								/>
							</label>
						</div>
						{editError ? (
							<p
								className="m-0 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 font-medium text-[0.875rem] text-destructive"
								id={`edit-task-error-${task.id}`}
								role="alert"
							>
								{editError}
							</p>
						) : null}
						<DialogFooter>
							<DialogClose asChild>
								<Button
									disabled={editSubmitting}
									type="button"
									variant="outline"
								>
									Cancel
								</Button>
							</DialogClose>
							<Button disabled={editSubmitting || !editValid} type="submit">
								{editSubmitting ? "Saving…" : "Save changes"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<Dialog
				onOpenChange={(open) => {
					setDeleteOpen(open);
					if (!open) setDeleteError(null);
				}}
				open={deleteOpen}
			>
				<DialogContent className="gap-0 overflow-hidden border-border bg-background p-0 shadow-2xl sm:max-w-[480px]">
					<div className="grid gap-5 p-6">
						<DialogHeader className="gap-1.5 pr-8">
							<DialogTitle className="font-body font-semibold text-[1.125rem] tracking-tight">
								Delete “{task.title}”?
							</DialogTitle>
							<DialogDescription className="text-[0.875rem] leading-5">
								This permanently removes the room, including its photos, brief,
								and generated concepts. This can’t be undone.
							</DialogDescription>
						</DialogHeader>
						{deleteError ? (
							<p
								className="m-0 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 font-medium text-[0.875rem] text-destructive"
								role="alert"
							>
								{deleteError}
							</p>
						) : null}
						<DialogFooter>
							<DialogClose asChild>
								<Button
									disabled={deleteSubmitting}
									type="button"
									variant="outline"
								>
									Cancel
								</Button>
							</DialogClose>
							<Button
								disabled={deleteSubmitting}
								onClick={handleDelete}
								type="button"
								variant="destructive"
							>
								{deleteSubmitting ? "Deleting…" : "Delete room"}
							</Button>
						</DialogFooter>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
