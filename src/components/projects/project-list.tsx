import { Link } from "@tanstack/react-router";
import { Folder, Plus } from "lucide-react";
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
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { track } from "../../lib/analytics/track";
import {
	getAuthHeaders,
	UNAUTHENTICATED_ERROR,
} from "../../lib/server-client/auth-headers";
import { useWorkspace } from "../../lib/workspace-context";
import { createProject } from "../../server/projects";
import { ProjectActionsMenu } from "./project-actions-menu";

/**
 * Projects index: reads the signed-in user's projects from the shared
 * workspace context (loaded once by `AppShell`) and renders a create form plus
 * per-row edit/delete actions. Loading + error are exposed in the UI so a
 * blank dashboard isn't ambiguous.
 */
export function ProjectList() {
	const { projects, loadError, refreshProjects } = useWorkspace();
	const [createError, setCreateError] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [createOpen, setCreateOpen] = useState(false);
	const [announcement, setAnnouncement] = useState<string | null>(null);
	const cancelledRef = useRef(false);

	useEffect(() => {
		cancelledRef.current = false;
		return () => {
			cancelledRef.current = true;
		};
	}, []);

	useEffect(() => {
		if (!announcement) return;
		const timer = window.setTimeout(() => setAnnouncement(null), 3000);
		return () => window.clearTimeout(timer);
	}, [announcement]);

	async function handleCreate(event: React.FormEvent) {
		event.preventDefault();
		setCreateError(null);
		setSubmitting(true);
		try {
			const headers = await getAuthHeaders();
			await createProject({
				data: {
					name: name.trim(),
					description: description.trim() || undefined,
				},
				headers,
			});
			if (cancelledRef.current) return;
			track("project_created");
			setName("");
			setDescription("");
			await refreshProjects();
			if (cancelledRef.current) return;
			setCreateOpen(false);
			setAnnouncement("Project created.");
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

	return (
		<section className="grid gap-6">
			<header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div className="grid gap-1.5">
					<h1 className="m-0 font-body font-semibold text-[1.625rem] text-foreground tracking-tight">
						Projects
					</h1>
					<p className="m-0 max-w-[58ch] font-body text-[0.9375rem] text-ink-muted leading-6">
						Group renovation rooms and concepts by property, floor, or client.
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
							New project
						</Button>
					</DialogTrigger>
					<DialogContent className="gap-0 overflow-hidden border-border bg-background p-0 shadow-2xl sm:max-w-[520px]">
						<form
							aria-busy={submitting}
							className="grid gap-5 p-6"
							onSubmit={handleCreate}
						>
							<DialogHeader className="gap-1.5 pr-8">
								<DialogTitle className="font-body font-semibold text-[1.125rem] tracking-tight">
									New project
								</DialogTitle>
								<DialogDescription className="text-[0.875rem] leading-5">
									Create a workspace for rooms, notes, and generated concepts.
								</DialogDescription>
							</DialogHeader>
							<div className="grid gap-4">
								<label
									className="grid gap-2 font-body font-medium text-[0.8125rem] text-foreground"
									htmlFor="new-project-name"
								>
									Name
									<Input
										aria-describedby={
											createError ? "new-project-name-error" : undefined
										}
										aria-invalid={createError ? true : undefined}
										className="h-10 bg-surface-2 text-[0.9375rem]"
										id="new-project-name"
										maxLength={200}
										onChange={(event) => setName(event.target.value)}
										placeholder="City house"
										required
										value={name}
									/>
								</label>
								<label
									className="grid gap-2 font-body font-medium text-[0.8125rem] text-foreground"
									htmlFor="new-project-description"
								>
									Description
									<Textarea
										className="min-h-24 resize-none bg-surface-2 text-[0.9375rem]"
										id="new-project-description"
										maxLength={2000}
										onChange={(event) => setDescription(event.target.value)}
										placeholder="Optional notes about the property."
										value={description}
									/>
								</label>
							</div>
							{createError ? (
								<p
									className="m-0 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 font-medium text-[0.875rem] text-destructive"
									id="new-project-name-error"
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
								<Button
									disabled={submitting || name.trim().length === 0}
									type="submit"
								>
									{submitting ? "Saving…" : "Create project"}
								</Button>
							</DialogFooter>
						</form>
					</DialogContent>
				</Dialog>
			</header>
			<output aria-live="polite" className="sr-only">
				{announcement ?? ""}
			</output>

			{projects === null && loadError === null ? (
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

			{projects && projects.length === 0 && !loadError ? (
				<div className="rounded-lg border border-border border-dashed bg-surface px-6 py-10 text-center">
					<p className="m-0 font-medium text-[0.9375rem] text-foreground">
						No projects yet
					</p>
					<p className="m-0 mt-1 text-[0.875rem] text-ink-muted">
						Use New project to create your first workspace.
					</p>
				</div>
			) : null}

			{projects && projects.length > 0 ? (
				<ul className="m-0 grid list-none overflow-hidden rounded-lg border border-border bg-background p-0 shadow-xs">
					{projects.map((project) => (
						<li
							className="relative border-border border-b last:border-b-0"
							key={project.id}
						>
							<Link
								className="group grid min-h-20 grid-cols-[auto_1fr] items-center gap-4 px-4 py-3.5 pr-14 no-underline transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset sm:px-5 sm:pr-16"
								params={{ projectId: project.id }}
								to="/projects/$projectId"
							>
								<span
									aria-hidden="true"
									className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-surface-2 text-ink-muted"
								>
									<Folder className="size-4" />
								</span>
								<span className="min-w-0">
									<span className="block truncate font-body font-medium text-[0.9375rem] text-foreground tracking-tight">
										{project.name}
									</span>
									<span className="mt-0.5 block truncate text-[0.8125rem] text-ink-muted">
										{project.description || "No description"}
									</span>
								</span>
							</Link>
							<div className="absolute top-1/2 right-3 -translate-y-1/2 sm:right-4">
								<ProjectActionsMenu
									onActionComplete={setAnnouncement}
									project={project}
									triggerClassName="text-ink-subtle hover:text-foreground"
								/>
							</div>
						</li>
					))}
				</ul>
			) : null}
		</section>
	);
}
