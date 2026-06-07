import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useState } from "react";
import type { Tables } from "./types/database";

type TaskRow = Tables<"renovation_tasks">;

interface WorkspaceContextValue {
	setAllTasks: (map: Record<string, TaskRow[]>) => void;
	setProjectTasks: (projectId: string, tasks: TaskRow[]) => void;
	tasksMap: Record<string, TaskRow[]>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
	const [tasksMap, setTasksMap] = useState<Record<string, TaskRow[]>>({});

	const setAllTasks = useCallback((map: Record<string, TaskRow[]>) => {
		setTasksMap(map);
	}, []);

	const setProjectTasks = useCallback((projectId: string, tasks: TaskRow[]) => {
		setTasksMap((prev) => ({ ...prev, [projectId]: tasks }));
	}, []);

	return (
		<WorkspaceContext.Provider
			value={{ tasksMap, setAllTasks, setProjectTasks }}
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
