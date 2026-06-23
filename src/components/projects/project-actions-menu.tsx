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
import { track } from "../../lib/analytics/track";
import {
	getAuthHeaders,
	UNAUTHENTICATED_ERROR,
} from "../../lib/server-client/auth-headers";
import type { Tables } from "../../lib/types/database";
import { useWorkspace } from "../../lib/workspace-context";
import { deleteProject, updateProject } from "../../server/projects";

type ProjectRow = Tables<"projects">;

/**
 * Per-project Edit / Delete affordance: a kebab menu plus the edit and
 * delete-confirm dialogs. Self-contained so it can be dropped into both the
 * projects list (one per row) and the project detail header.
 *
 * Feedback is delegated to the host via `onActionComplete` (which owns an
 * `aria-live` region) rather than rendering one live region per instance.
 * `onDeleted` lets the detail page navigate away once its project is gone;
 * the list omits it and simply lets `refreshProjects` drop the row.
 */
export function ProjectActionsMenu({
	project,
	onActionComplete,
	onDeleted,
	align = "end",
	triggerClassName,
}: {
	project: ProjectRow;
	onActionComplete?: (message: string) => void;
	onDeleted?: () => void;
	align?: "start" | "center" | "end";
	triggerClassName?: string;
}) {
	const { refreshProjects, tasksMap } = useWorkspace();

	const [editOpen, setEditOpen] = useState(false);
	const [editName, setEditName] = useState(project.name);
	const [editDescription, setEditDescription] = useState(
		project.description ?? ""
	);
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
		setEditName(project.name);
		setEditDescription(project.description ?? "");
		setEditError(null);
		setEditOpen(true);
	}

	async function handleEdit(event: React.FormEvent) {
		event.preventDefault();
		setEditError(null);
		setEditSubmitting(true);
		try {
			const headers = await getAuthHeaders();
			await updateProject({
				data: {
					projectId: project.id,
					name: editName.trim(),
					description: editDescription.trim() || undefined,
				},
				headers,
			});
			if (cancelledRef.current) return;
			track("project_updated");
			await refreshProjects();
			if (cancelledRef.current) return;
			setEditOpen(false);
			onActionComplete?.("Project updated.");
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
			await deleteProject({ data: { projectId: project.id }, headers });
			if (cancelledRef.current) return;
			track("project_deleted");
			await refreshProjects();
			if (cancelledRef.current) return;
			setDeleteOpen(false);
			onActionComplete?.(`Deleted “${project.name}”.`);
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

	const roomCount = tasksMap[project.id]?.length ?? 0;

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
						<span className="sr-only">Actions for {project.name}</span>
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
				<DialogContent className="gap-0 overflow-hidden border-border bg-background p-0 shadow-2xl sm:max-w-[520px]">
					<form
						aria-busy={editSubmitting}
						className="grid gap-5 p-6"
						onSubmit={handleEdit}
					>
						<DialogHeader className="gap-1.5 pr-8">
							<DialogTitle className="font-body font-semibold text-[1.125rem] tracking-tight">
								Edit project
							</DialogTitle>
							<DialogDescription className="text-[0.875rem] leading-5">
								Update the name and description.
							</DialogDescription>
						</DialogHeader>
						<div className="grid gap-4">
							<label
								className="grid gap-2 font-body font-medium text-[0.8125rem] text-foreground"
								htmlFor={`edit-project-name-${project.id}`}
							>
								Name
								<Input
									aria-describedby={
										editError
											? `edit-project-name-error-${project.id}`
											: undefined
									}
									aria-invalid={editError ? true : undefined}
									className="h-10 bg-surface-2 text-[0.9375rem]"
									id={`edit-project-name-${project.id}`}
									maxLength={200}
									onChange={(event) => setEditName(event.target.value)}
									placeholder="City house"
									required
									value={editName}
								/>
							</label>
							<label
								className="grid gap-2 font-body font-medium text-[0.8125rem] text-foreground"
								htmlFor={`edit-project-description-${project.id}`}
							>
								Description
								<Textarea
									className="min-h-24 resize-none bg-surface-2 text-[0.9375rem]"
									id={`edit-project-description-${project.id}`}
									maxLength={2000}
									onChange={(event) => setEditDescription(event.target.value)}
									placeholder="Optional notes about the property."
									value={editDescription}
								/>
							</label>
						</div>
						{editError ? (
							<p
								className="m-0 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 font-medium text-[0.875rem] text-destructive"
								id={`edit-project-name-error-${project.id}`}
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
							<Button
								disabled={editSubmitting || editName.trim().length === 0}
								type="submit"
							>
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
								Delete “{project.name}”?
							</DialogTitle>
							<DialogDescription className="text-[0.875rem] leading-5">
								This permanently removes the project
								{roomCount > 0
									? ` and its ${roomCount} ${roomCount === 1 ? "room" : "rooms"}`
									: ""}
								, including all photos and generated concepts. This can’t be
								undone.
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
								{deleteSubmitting ? "Deleting…" : "Delete project"}
							</Button>
						</DialogFooter>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
