import { Link } from "@tanstack/react-router";
import { ArrowRight, DoorOpen, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
	getAuthHeaders,
	UNAUTHENTICATED_ERROR,
} from "../../lib/server-client/auth-headers";
import type { Tables } from "../../lib/types/database";
import { useWorkspace } from "../../lib/workspace-context";
import { createTask, listProjectTasks } from "../../server/tasks";

type TaskRow = Tables<"renovation_tasks">;

/**
 * Lists renovation tasks for a project plus a quick-create form. The route
 * owns the `projectId` (from URL params) and passes it down so the same
 * component can be reused inside the project detail route and any future
 * "all tasks" overview.
 */
export function TaskList(props: { projectId: string }) {
	const { tasksMap, setProjectTasks } = useWorkspace();
	const hadCachedData = useRef(tasksMap[props.projectId] != null);
	const [tasks, setTasks] = useState<TaskRow[] | null>(
		() => tasksMap[props.projectId] ?? null
	);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [createError, setCreateError] = useState<string | null>(null);
	const [title, setTitle] = useState("");
	const [category, setCategory] = useState("");
	const [notes, setNotes] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [createOpen, setCreateOpen] = useState(false);
	const [createdAnnouncement, setCreatedAnnouncement] = useState<string | null>(
		null
	);
	const cancelledRef = useRef(false);

	const refresh = useCallback(async () => {
		if (cancelledRef.current) return;
		setLoadError(null);
		try {
			const headers = await getAuthHeaders();
			const rows: TaskRow[] = await listProjectTasks({
				data: { projectId: props.projectId },
				headers,
			});
			if (cancelledRef.current) return;
			setTasks(rows);
			setProjectTasks(props.projectId, rows);
		} catch (error) {
			if (cancelledRef.current) return;
			if (error instanceof Error && error.message === UNAUTHENTICATED_ERROR) {
				window.location.assign("/sign-in");
				return;
			}
			setLoadError(error instanceof Error ? error.message : "Failed to load");
			setTasks([]);
		}
	}, [props.projectId, setProjectTasks]);

	useEffect(() => {
		cancelledRef.current = false;
		if (!hadCachedData.current) {
			void refresh();
		}
		return () => {
			cancelledRef.current = true;
		};
	}, [refresh]);

	useEffect(() => {
		if (!createdAnnouncement) return;
		const timer = window.setTimeout(() => setCreatedAnnouncement(null), 3000);
		return () => window.clearTimeout(timer);
	}, [createdAnnouncement]);

	async function handleCreate(event: React.FormEvent) {
		event.preventDefault();
		setCreateError(null);
		setSubmitting(true);
		try {
			const headers = await getAuthHeaders();
			await createTask({
				data: {
					projectId: props.projectId,
					title: title.trim(),
					category: category.trim(),
					notes: notes.trim() || undefined,
				},
				headers,
			});
			if (cancelledRef.current) return;
			setTitle("");
			setCategory("");
			setNotes("");
			await refresh();
			if (cancelledRef.current) return;
			setCreateOpen(false);
			setCreatedAnnouncement("Room created.");
		} catch (error) {
			if (cancelledRef.current) return;
			if (error instanceof Error && error.message === UNAUTHENTICATED_ERROR) {
				window.location.assign("/sign-in");
				return;
			}
			setCreateError(error instanceof Error ? error.message : "Failed to save");
		} finally {
			if (!cancelledRef.current) setSubmitting(false);
		}
	}

	const formValid = title.trim().length > 0 && category.trim().length > 0;

	return (
		<section className="grid gap-6">
			<header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div className="grid gap-1.5">
					<h1 className="m-0 font-body font-semibold text-[1.625rem] text-foreground tracking-tight">
						Rooms
					</h1>
					<p className="m-0 max-w-[58ch] font-body text-[0.9375rem] text-ink-muted leading-6">
						Open a room to upload photos, write the brief, and generate
						concepts.
					</p>
				</div>
				<Dialog
					onOpenChange={(open) => {
						setCreateOpen(open);
						if (!open) setCreateError(null);
					}}
					open={createOpen}
				>
					<DialogTrigger asChild>
						<Button className="w-fit" size="sm" type="button">
							<Plus aria-hidden="true" className="size-4" />
							New room
						</Button>
					</DialogTrigger>
					<DialogContent className="gap-0 overflow-hidden border-border bg-background p-0 shadow-2xl sm:max-w-[540px]">
						<form
							aria-busy={submitting}
							className="grid gap-5 p-6"
							onSubmit={handleCreate}
						>
							<DialogHeader className="gap-1.5 pr-8">
								<DialogTitle className="font-body font-semibold text-[1.125rem] tracking-tight">
									New room
								</DialogTitle>
								<DialogDescription className="text-[0.875rem] leading-5">
									Add a room or renovation area to guide the concept workflow.
								</DialogDescription>
							</DialogHeader>
							<div className="grid gap-4">
								<label
									className="grid gap-2 font-body font-medium text-[0.8125rem] text-foreground"
									htmlFor="new-task-title"
								>
									Title
									<Input
										aria-describedby={
											createError ? "new-task-error" : undefined
										}
										aria-invalid={createError ? true : undefined}
										className="h-10 bg-surface-2 text-[0.9375rem]"
										id="new-task-title"
										maxLength={200}
										onChange={(event) => setTitle(event.target.value)}
										placeholder="Living room"
										required
										value={title}
									/>
								</label>
								<label
									className="grid gap-2 font-body font-medium text-[0.8125rem] text-foreground"
									htmlFor="new-task-category"
								>
									Category
									<Input
										className="h-10 bg-surface-2 text-[0.9375rem]"
										id="new-task-category"
										maxLength={200}
										onChange={(event) => setCategory(event.target.value)}
										placeholder="living room, kitchen, facade"
										required
										value={category}
									/>
								</label>
								<label
									className="grid gap-2 font-body font-medium text-[0.8125rem] text-foreground"
									htmlFor="new-task-notes"
								>
									Notes
									<Textarea
										className="min-h-24 resize-none bg-surface-2 text-[0.9375rem]"
										id="new-task-notes"
										maxLength={4000}
										onChange={(event) => setNotes(event.target.value)}
										placeholder="Optional context for the AI provider."
										value={notes}
									/>
								</label>
							</div>
							{createError ? (
								<p
									className="m-0 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 font-medium text-[0.875rem] text-destructive"
									id="new-task-error"
									role="alert"
								>
									{createError}
								</p>
							) : null}
							<DialogFooter>
								<DialogClose asChild>
									<Button disabled={submitting} type="button" variant="outline">
										Cancel
									</Button>
								</DialogClose>
								<Button disabled={submitting || !formValid} type="submit">
									{submitting ? "Saving…" : "Create room"}
								</Button>
							</DialogFooter>
						</form>
					</DialogContent>
				</Dialog>
			</header>
			<output aria-live="polite" className="sr-only">
				{createdAnnouncement ?? ""}
			</output>

			{tasks === null && loadError === null ? (
				<ul className="m-0 grid list-none overflow-hidden rounded-lg border border-border bg-background p-0 shadow-xs">
					{[0, 1, 2].map((i) => (
						<li className="border-border border-b last:border-b-0" key={i}>
							<div className="grid min-h-20 grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-3.5 sm:px-5">
								<Skeleton className="size-9 rounded-md" />
								<div className="grid gap-1.5">
									<Skeleton className="h-4 w-[180px]" />
									<Skeleton className="h-3 w-[120px]" />
								</div>
								<Skeleton className="size-8 rounded-md" />
							</div>
						</li>
					))}
				</ul>
			) : null}
			{loadError ? (
				<p
					className="m-0 rounded-lg border border-warning/25 bg-warning/5 px-4 py-3 font-medium text-[0.9375rem] text-warning"
					role="alert"
				>
					{loadError}
				</p>
			) : null}

			{tasks && tasks.length === 0 && !loadError ? (
				<div className="rounded-lg border border-border border-dashed bg-surface px-6 py-10 text-center">
					<p className="m-0 font-medium text-[0.9375rem] text-foreground">
						No rooms yet
					</p>
					<p className="m-0 mt-1 text-[0.875rem] text-ink-muted">
						Use New room to start a renovation concept.
					</p>
				</div>
			) : null}

			{tasks && tasks.length > 0 ? (
				<ul className="m-0 grid list-none overflow-hidden rounded-lg border border-border bg-background p-0 shadow-xs">
					{tasks.map((task) => (
						<li
							className="border-border border-b last:border-b-0"
							key={task.id}
						>
							<Link
								className="group grid min-h-20 grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-3.5 no-underline transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset sm:px-5"
								params={{ projectId: props.projectId, taskId: task.id }}
								to="/projects/$projectId/tasks/$taskId"
							>
								<span
									aria-hidden="true"
									className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-surface-2 text-ink-muted"
								>
									<DoorOpen className="size-4" />
								</span>
								<span className="min-w-0">
									<span className="flex min-w-0 flex-wrap items-center gap-2">
										<span className="truncate font-body font-medium text-[0.9375rem] text-foreground tracking-tight">
											{task.title}
										</span>
										<span className="flex shrink-0 items-center gap-1.5">
											<Badge className="rounded-md" variant="secondary">
												{task.category}
											</Badge>
											<Badge className="rounded-md" variant="outline">
												{task.status}
											</Badge>
										</span>
									</span>
									<span className="mt-0.5 block truncate text-[0.8125rem] text-ink-muted">
										{task.notes || "No notes"}
									</span>
								</span>
								<span
									aria-hidden="true"
									className="inline-flex size-8 items-center justify-center rounded-md text-ink-subtle transition-colors group-hover:bg-background group-hover:text-foreground"
								>
									<ArrowRight className="size-4" />
								</span>
							</Link>
						</li>
					))}
				</ul>
			) : null}
		</section>
	);
}
