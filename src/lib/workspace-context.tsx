import type { ReactNode } from "react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";
import { listProjects } from "../server/projects";
import { listProjectTasks } from "../server/tasks";
import {
	getAuthHeaders,
	UNAUTHENTICATED_ERROR,
} from "./server-client/auth-headers";
import type { Tables } from "./types/database";

type ProjectRow = Tables<"projects">;
type TaskRow = Tables<"renovation_tasks">;

interface WorkspaceContextValue {
	loadError: string | null;
	projects: ProjectRow[] | null;
	refreshProjects: () => Promise<void>;
	setProjectTasks: (projectId: string, tasks: TaskRow[]) => void;
	tasksMap: Record<string, TaskRow[]>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

/**
 * Single source of truth for the authenticated workspace's projects and their
 * rooms/tasks. Mounted once by `AppShell` (which lives in the `_app` pathless
 * layout), so the data is fetched a single time and survives navigation
 * between `/` and `/projects/*` — no skeleton flashes when opening a project.
 */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
	const [projects, setProjects] = useState<ProjectRow[] | null>(null);
	const [tasksMap, setTasksMap] = useState<Record<string, TaskRow[]>>({});
	const [loadError, setLoadError] = useState<string | null>(null);

	const setProjectTasks = useCallback((projectId: string, tasks: TaskRow[]) => {
		setTasksMap((prev) => ({ ...prev, [projectId]: tasks }));
	}, []);

	const load = useCallback(async (signal?: { cancelled: boolean }) => {
		try {
			const headers = await getAuthHeaders();
			const rows = (await listProjects({ headers })) as ProjectRow[];
			if (signal?.cancelled) return;
			setProjects(rows);
			setLoadError(null);
			// Prefetch tasks for every project in parallel so opening one is instant.
			const entries = await Promise.all(
				rows.map(async (project) => {
					try {
						const h = await getAuthHeaders();
						const tasks = (await listProjectTasks({
							data: { projectId: project.id },
							headers: h,
						})) as TaskRow[];
						return [project.id, tasks] as const;
					} catch {
						return [project.id, [] as TaskRow[]] as const;
					}
				})
			);
			if (!signal?.cancelled) {
				setTasksMap(Object.fromEntries(entries));
			}
		} catch (error) {
			if (signal?.cancelled) return;
			if (error instanceof Error && error.message === UNAUTHENTICATED_ERROR) {
				window.location.assign("/sign-in");
				return;
			}
			setLoadError(
				error instanceof Error ? error.message : "Failed to load projects"
			);
			setProjects([]);
		}
	}, []);

	useEffect(() => {
		const signal = { cancelled: false };
		void load(signal);
		return () => {
			signal.cancelled = true;
		};
	}, [load]);

	const refreshProjects = useCallback(() => load(), [load]);

	return (
		<WorkspaceContext.Provider
			value={{
				projects,
				tasksMap,
				loadError,
				refreshProjects,
				setProjectTasks,
			}}
		>
			{children}
		</WorkspaceContext.Provider>
	);
}

export function useWorkspace(): WorkspaceContextValue {
	const ctx = useContext(WorkspaceContext);
	if (!ctx) throw new Error("useWorkspace must be within WorkspaceProvider");
	return ctx;
}
