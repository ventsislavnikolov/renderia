export type Json =
	| string
	| number
	| boolean
	| null
	| { [key: string]: Json | undefined }
	| Json[];

export type RenovationTaskStatus = "suggested" | "active" | "archived";
export type ProtectedElementStatus = "suggested" | "confirmed" | "rejected";
export type GenerationJobStatus =
	| "pending"
	| "running"
	| "succeeded"
	| "failed";

type Nullable<T> = T | null;

export type Database = {
	public: {
		Tables: {
			projects: {
				Row: {
					id: string;
					owner_id: string;
					name: string;
					description: Nullable<string>;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					owner_id: string;
					name: string;
					description?: Nullable<string>;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					owner_id?: string;
					name?: string;
					description?: Nullable<string>;
					created_at?: string;
					updated_at?: string;
				};
				Relationships: [];
			};
			renovation_tasks: {
				Row: {
					id: string;
					owner_id: string;
					project_id: string;
					title: string;
					category: string;
					status: RenovationTaskStatus;
					notes: Nullable<string>;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					owner_id: string;
					project_id: string;
					title: string;
					category: string;
					status?: RenovationTaskStatus;
					notes?: Nullable<string>;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					owner_id?: string;
					project_id?: string;
					title?: string;
					category?: string;
					status?: RenovationTaskStatus;
					notes?: Nullable<string>;
					created_at?: string;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: "renovation_tasks_project_id_fkey";
						columns: ["project_id"];
						referencedRelation: "projects";
						referencedColumns: ["id"];
					},
				];
			};
			photos: {
				Row: {
					id: string;
					owner_id: string;
					project_id: string;
					storage_bucket: "source-photos";
					storage_path: string;
					original_name: string;
					content_type: string;
					width: Nullable<number>;
					height: Nullable<number>;
					notes: Nullable<string>;
					created_at: string;
				};
				Insert: {
					id?: string;
					owner_id: string;
					project_id: string;
					storage_bucket?: "source-photos";
					storage_path: string;
					original_name: string;
					content_type: string;
					width?: Nullable<number>;
					height?: Nullable<number>;
					notes?: Nullable<string>;
					created_at?: string;
				};
				Update: {
					id?: string;
					owner_id?: string;
					project_id?: string;
					storage_bucket?: "source-photos";
					storage_path?: string;
					original_name?: string;
					content_type?: string;
					width?: Nullable<number>;
					height?: Nullable<number>;
					notes?: Nullable<string>;
					created_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: "photos_project_id_fkey";
						columns: ["project_id"];
						referencedRelation: "projects";
						referencedColumns: ["id"];
					},
				];
			};
			task_photos: {
				Row: {
					task_id: string;
					photo_id: string;
				};
				Insert: {
					task_id: string;
					photo_id: string;
				};
				Update: {
					task_id?: string;
					photo_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: "task_photos_task_id_fkey";
						columns: ["task_id"];
						referencedRelation: "renovation_tasks";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "task_photos_photo_id_fkey";
						columns: ["photo_id"];
						referencedRelation: "photos";
						referencedColumns: ["id"];
					},
				];
			};
			protected_elements: {
				Row: {
					id: string;
					owner_id: string;
					task_id: string;
					photo_id: string;
					label: string;
					kind: string;
					x: number;
					y: number;
					width: number;
					height: number;
					confidence: Nullable<number>;
					status: ProtectedElementStatus;
					created_at: string;
				};
				Insert: {
					id?: string;
					owner_id: string;
					task_id: string;
					photo_id: string;
					label: string;
					kind: string;
					x: number;
					y: number;
					width: number;
					height: number;
					confidence?: Nullable<number>;
					status?: ProtectedElementStatus;
					created_at?: string;
				};
				Update: {
					id?: string;
					owner_id?: string;
					task_id?: string;
					photo_id?: string;
					label?: string;
					kind?: string;
					x?: number;
					y?: number;
					width?: number;
					height?: number;
					confidence?: Nullable<number>;
					status?: ProtectedElementStatus;
					created_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: "protected_elements_task_id_fkey";
						columns: ["task_id"];
						referencedRelation: "renovation_tasks";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "protected_elements_photo_id_fkey";
						columns: ["photo_id"];
						referencedRelation: "photos";
						referencedColumns: ["id"];
					},
				];
			};
			design_briefs: {
				Row: {
					id: string;
					owner_id: string;
					task_id: string;
					markdown: string;
					prompt: string;
					version: number;
					created_at: string;
				};
				Insert: {
					id?: string;
					owner_id: string;
					task_id: string;
					markdown: string;
					prompt: string;
					version?: number;
					created_at?: string;
				};
				Update: {
					id?: string;
					owner_id?: string;
					task_id?: string;
					markdown?: string;
					prompt?: string;
					version?: number;
					created_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: "design_briefs_task_id_fkey";
						columns: ["task_id"];
						referencedRelation: "renovation_tasks";
						referencedColumns: ["id"];
					},
				];
			};
			generation_jobs: {
				Row: {
					id: string;
					owner_id: string;
					task_id: string;
					brief_id: Nullable<string>;
					provider: string;
					model: string;
					status: GenerationJobStatus;
					prompt: string;
					error_message: Nullable<string>;
					created_at: string;
					completed_at: Nullable<string>;
				};
				Insert: {
					id?: string;
					owner_id: string;
					task_id: string;
					brief_id?: Nullable<string>;
					provider: string;
					model: string;
					status?: GenerationJobStatus;
					prompt: string;
					error_message?: Nullable<string>;
					created_at?: string;
					completed_at?: Nullable<string>;
				};
				Update: {
					id?: string;
					owner_id?: string;
					task_id?: string;
					brief_id?: Nullable<string>;
					provider?: string;
					model?: string;
					status?: GenerationJobStatus;
					prompt?: string;
					error_message?: Nullable<string>;
					created_at?: string;
					completed_at?: Nullable<string>;
				};
				Relationships: [
					{
						foreignKeyName: "generation_jobs_task_id_fkey";
						columns: ["task_id"];
						referencedRelation: "renovation_tasks";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "generation_jobs_brief_id_fkey";
						columns: ["brief_id"];
						referencedRelation: "design_briefs";
						referencedColumns: ["id"];
					},
				];
			};
			generated_images: {
				Row: {
					id: string;
					owner_id: string;
					job_id: string;
					task_id: string;
					storage_bucket: "generated-outputs";
					storage_path: string;
					variation_index: number;
					is_favorite: boolean;
					notes: Nullable<string>;
					created_at: string;
				};
				Insert: {
					id?: string;
					owner_id: string;
					job_id: string;
					task_id: string;
					storage_bucket?: "generated-outputs";
					storage_path: string;
					variation_index: number;
					is_favorite?: boolean;
					notes?: Nullable<string>;
					created_at?: string;
				};
				Update: {
					id?: string;
					owner_id?: string;
					job_id?: string;
					task_id?: string;
					storage_bucket?: "generated-outputs";
					storage_path?: string;
					variation_index?: number;
					is_favorite?: boolean;
					notes?: Nullable<string>;
					created_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: "generated_images_job_id_fkey";
						columns: ["job_id"];
						referencedRelation: "generation_jobs";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "generated_images_task_id_fkey";
						columns: ["task_id"];
						referencedRelation: "renovation_tasks";
						referencedColumns: ["id"];
					},
				];
			};
		};
		Views: Record<string, never>;
		Functions: Record<string, never>;
		Enums: Record<string, never>;
		CompositeTypes: Record<string, never>;
	};
};

export type Tables<TableName extends keyof Database["public"]["Tables"]> =
	Database["public"]["Tables"][TableName]["Row"];

export type TablesInsert<TableName extends keyof Database["public"]["Tables"]> =
	Database["public"]["Tables"][TableName]["Insert"];

export type TablesUpdate<TableName extends keyof Database["public"]["Tables"]> =
	Database["public"]["Tables"][TableName]["Update"];

export type Enums<EnumName extends keyof Database["public"]["Enums"]> =
	Database["public"]["Enums"][EnumName];
