export type BoundingBox = {
	label: string;
	kind:
		| "window"
		| "door"
		| "stairs"
		| "ceiling_line"
		| "wall_edge"
		| "structure"
		| "other";
	x: number;
	y: number;
	width: number;
	height: number;
	confidence?: number;
};

export type SuggestTasksInput = {
	projectNotes: string;
	photos: Array<{ id: string; signedUrl: string; notes?: string }>;
};

export type SuggestedTask = {
	title: string;
	category: string;
	rationale: string;
};

export type DetectProtectedElementsInput = {
	photoUrl: string;
	taskTitle: string;
	notes?: string;
};

export type CreateDesignBriefInput = {
	taskTitle: string;
	styleRules: string;
	protectedElements: BoundingBox[];
};

export type GenerateRenovationImagesInput = {
	sourceImageUrl: string;
	prompt: string;
	count: number;
};

export type GeneratedImageResult = {
	base64: string;
	contentType: "image/png" | "image/jpeg" | "image/webp";
};

export type RenovationAiProvider = {
	suggestTasks(input: SuggestTasksInput): Promise<SuggestedTask[]>;
	detectProtectedElements(
		input: DetectProtectedElementsInput,
	): Promise<BoundingBox[]>;
	createDesignBrief(
		input: CreateDesignBriefInput,
	): Promise<{ markdown: string; prompt: string }>;
	generateRenovationImages(
		input: GenerateRenovationImagesInput,
	): Promise<GeneratedImageResult[]>;
};
