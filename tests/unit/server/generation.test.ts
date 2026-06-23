import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RenovationAiProvider } from "../../../src/lib/ai/types";
import {
	__createDesignBriefHandler,
	__describeGeneratedImagesHandler,
	__detectProtectedElementsHandler,
	__generateRenovationImagesHandler,
	__listProtectedElementsHandler,
	__saveDesignBriefHandler,
	__saveDetectedElementsHandler,
	__setImageFavoriteHandler,
	__updateProtectedElementStatusHandler,
} from "../../../src/server/generation";

const SAMPLE_DEBUG = {
	model: "gpt-5.5",
	prompt: "test prompt",
	rawResponse: '{"ok":true}',
	durationMs: 12,
};

function buildMockProvider(): RenovationAiProvider & {
	detectProtectedElements: ReturnType<typeof vi.fn>;
	createDesignBrief: ReturnType<typeof vi.fn>;
	generateRenovationImages: ReturnType<typeof vi.fn>;
	listRoomContents: ReturnType<typeof vi.fn>;
} {
	const provider = {
		suggestTasks: vi.fn().mockResolvedValue({ value: [] }),
		detectProtectedElements: vi.fn().mockResolvedValue({
			value: [
				{
					label: "left window",
					kind: "window",
					x: 0.1,
					y: 0.2,
					width: 0.2,
					height: 0.3,
					confidence: 0.9,
				},
			],
			debug: SAMPLE_DEBUG,
		}),
		createDesignBrief: vi.fn().mockResolvedValue({
			value: { markdown: "# brief", prompt: "PRESERVE EXACTLY" },
			debug: SAMPLE_DEBUG,
		}),
		generateRenovationImages: vi.fn().mockResolvedValue({
			value: [
				{ base64: "AAAA", contentType: "image/png" as const },
				{ base64: "BBBB", contentType: "image/png" as const },
			],
			debug: { ...SAMPLE_DEBUG, model: "gpt-image-2" },
		}),
		listRoomContents: vi.fn().mockResolvedValue({
			value: ["beige sofa", "oak coffee table"],
			debug: SAMPLE_DEBUG,
		}),
	};
	return provider as unknown as RenovationAiProvider & {
		detectProtectedElements: ReturnType<typeof vi.fn>;
		createDesignBrief: ReturnType<typeof vi.fn>;
		generateRenovationImages: ReturnType<typeof vi.fn>;
		listRoomContents: ReturnType<typeof vi.fn>;
	};
}

type Row = Record<string, unknown>;

/**
 * Build a Supabase stub specifically wired for the image-generation handler.
 *
 * Distinct chains per table because `__generateRenovationImagesHandler`
 * makes four sequential DB calls (task lookup, job insert, per-image insert,
 * job update) and we need the assertions to be unambiguous. The storage
 * chain captures uploads + signed URLs so tests can assert on the bytes that
 * reached the bucket.
 */
function buildGenerationSupabaseStub(opts: {
	taskResult?: { data: Row | null; error: unknown };
	compositeResult?: { data: Row | null; error: unknown };
	sourcePhotoResult?: { data: Row | null; error: unknown };
	sourcePhotoDownloadResult?: { data: Blob | null; error: unknown };
	jobInsertResult?: { data: Row | null; error: unknown };
	imageInsertResults?: Array<{ data: Row | null; error: unknown }>;
	signedUrlResult?: {
		data: { signedUrl: string } | null;
		error: unknown;
	};
	uploadResult?: { error: unknown };
	jobUpdateResult?: { error: unknown };
}) {
	const fromMock = vi.fn();

	// renovation_tasks chain (lookup).
	const tasksChain: Record<string, (...args: unknown[]) => unknown> = {};
	tasksChain.select = vi.fn(() => tasksChain);
	tasksChain.eq = vi.fn(() => tasksChain);
	tasksChain.maybeSingle = vi.fn(() =>
		Promise.resolve(opts.taskResult ?? { data: { id: "t1" }, error: null })
	);

	// generation_jobs chain (insert + update).
	const jobsInsertChain: Record<string, (...args: unknown[]) => unknown> = {};
	jobsInsertChain.select = vi.fn(() => jobsInsertChain);
	jobsInsertChain.single = vi.fn(() =>
		Promise.resolve(
			opts.jobInsertResult ?? { data: { id: "job-1" }, error: null }
		)
	);

	const jobsUpdateChain: Record<string, (...args: unknown[]) => unknown> = {};
	const jobsUpdateEq = vi.fn(() => jobsUpdateChain);
	jobsUpdateChain.eq = jobsUpdateEq;
	// `.update(...).eq(...).eq(...)` resolves directly — make the chain
	// thenable on the second `.eq` call.
	let updateEqCalls = 0;
	jobsUpdateChain.eq = vi.fn(() => {
		updateEqCalls += 1;
		if (updateEqCalls >= 2) {
			return Promise.resolve(opts.jobUpdateResult ?? { error: null });
		}
		return jobsUpdateChain;
	});

	const jobsChain: Record<string, (...args: unknown[]) => unknown> = {};
	jobsChain.insert = vi.fn(() => jobsInsertChain);
	jobsChain.update = vi.fn(() => jobsUpdateChain);

	// generated_images chain (insert per variation).
	const imageInsertResults = opts.imageInsertResults ?? [
		{
			data: {
				id: "img-1",
				storage_path: "user-1/job-1-0.png",
				variation_index: 0,
				is_favorite: false,
			},
			error: null,
		},
		{
			data: {
				id: "img-2",
				storage_path: "user-1/job-1-1.png",
				variation_index: 1,
				is_favorite: false,
			},
			error: null,
		},
	];
	let imageInsertCallIdx = 0;
	const imagesInsertChain: Record<string, (...args: unknown[]) => unknown> = {};
	imagesInsertChain.select = vi.fn(() => imagesInsertChain);
	imagesInsertChain.single = vi.fn(() => {
		const result = imageInsertResults[imageInsertCallIdx] ?? {
			data: null,
			error: { message: "exhausted" },
		};
		imageInsertCallIdx += 1;
		return Promise.resolve(result);
	});
	const imagesChain: Record<string, (...args: unknown[]) => unknown> = {};
	imagesChain.insert = vi.fn(() => imagesInsertChain);

	fromMock.mockImplementation((table: string) => {
		if (table === "renovation_tasks") return tasksChain;
		if (table === "photos") {
			const photosChain: Record<string, (...args: unknown[]) => unknown> = {};
			photosChain.select = vi.fn(() => photosChain);
			photosChain.eq = vi.fn(() => photosChain);
			photosChain.maybeSingle = vi.fn(() =>
				Promise.resolve(
					opts.sourcePhotoResult ?? {
						data: {
							storage_bucket: "source-photos",
							storage_path: "user-1/source.png",
							content_type: "image/png",
							original_name: "source.png",
						},
						error: null,
					}
				)
			);
			return photosChain;
		}
		if (table === "room_composites") {
			const compositesChain: Record<string, (...args: unknown[]) => unknown> =
				{};
			compositesChain.select = vi.fn(() => compositesChain);
			compositesChain.eq = vi.fn(() => compositesChain);
			compositesChain.maybeSingle = vi.fn(() =>
				Promise.resolve(
					opts.compositeResult ?? {
						data: {
							storage_bucket: "room-composites",
							storage_path: "user-1/task-1/composite.png",
						},
						error: null,
					}
				)
			);
			return compositesChain;
		}
		if (table === "generation_jobs") return jobsChain;
		if (table === "generated_images") return imagesChain;
		return tasksChain;
	});

	// Storage chain.
	const uploadMock = vi.fn(async () => opts.uploadResult ?? { error: null });
	const createSignedUrlMock = vi.fn(
		async (path: string) =>
			opts.signedUrlResult ?? {
				data: { signedUrl: `https://signed/${path}` },
				error: null,
			}
	);
	const storageFromMock = vi.fn(() => ({
		upload: uploadMock,
		createSignedUrl: createSignedUrlMock,
		download: vi.fn(async () =>
			opts.sourcePhotoDownloadResult === undefined
				? {
						data: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
						error: null,
					}
				: opts.sourcePhotoDownloadResult
		),
	}));

	return {
		supabase: {
			from: fromMock,
			storage: { from: storageFromMock },
		} as unknown as Parameters<
			typeof __generateRenovationImagesHandler
		>[0]["supabase"],
		fromMock,
		tasksChain,
		jobsChain,
		jobsInsertChain,
		jobsUpdateChain,
		imagesChain,
		imagesInsertChain,
		uploadMock,
		createSignedUrlMock,
		storageFromMock,
	};
}

function buildFavoriteSupabaseStub(opts: {
	updateResult?: { data: Row | null; error: unknown };
}) {
	const fromMock = vi.fn();
	const chain: Record<string, (...args: unknown[]) => unknown> = {};
	chain.update = vi.fn(() => chain);
	chain.eq = vi.fn(() => chain);
	chain.select = vi.fn(() => chain);
	chain.maybeSingle = vi.fn(() =>
		Promise.resolve(opts.updateResult ?? { data: null, error: null })
	);
	fromMock.mockImplementation(() => chain);
	return {
		supabase: {
			from: fromMock,
		} as unknown as Parameters<typeof __setImageFavoriteHandler>[0]["supabase"],
		fromMock,
		chain,
	};
}

function buildDesignBriefSupabaseStub(opts: {
	insertResult?: { data: Row | null; error: unknown };
}) {
	const fromMock = vi.fn();
	const chain: Record<string, (...args: unknown[]) => unknown> = {};
	chain.insert = vi.fn(() => chain);
	chain.select = vi.fn(() => chain);
	chain.eq = vi.fn(() => chain);
	// The brief handlers resolve the Task's Style via
	// renovation_tasks.select("style").eq().eq().maybeSingle().
	chain.maybeSingle = vi.fn(() =>
		Promise.resolve({ data: { style: "scandinavian" }, error: null })
	);
	chain.single = vi.fn(() =>
		Promise.resolve(
			opts.insertResult ?? {
				data: {
					id: "brief-1",
					owner_id: "user-1",
					task_id: "task-1",
					style_rules: "scandinavian",
					markdown: "# brief",
					prompt: "PRESERVE EXACTLY",
					version: 1,
					created_at: "2026-01-01T00:00:00Z",
				},
				error: null,
			}
		)
	);
	fromMock.mockImplementation(() => chain);
	return {
		supabase: {
			from: fromMock,
		} as unknown as Parameters<
			typeof __createDesignBriefHandler
		>[0]["supabase"],
		fromMock,
		chain,
	};
}

const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
	// Default to 'test' (non-production) so debug payloads are forwarded.
	process.env.NODE_ENV = "test";
});

afterEach(() => {
	process.env.NODE_ENV = originalNodeEnv;
});

describe("detectProtectedElementsHandler", () => {
	function buildDetectionSupabaseStub(
		opts: {
			taskResult?: { data: Row | null; error: unknown };
			photoResult?: { data: Row | null; error: unknown };
		} = {}
	) {
		const fromMock = vi.fn();
		const taskMaybeSingle = vi.fn().mockResolvedValue({
			data: { id: "task-1", project_id: "project-1" },
			error: null,
			...opts.taskResult,
		});
		const photoMaybeSingle = vi.fn().mockResolvedValue({
			data: {
				storage_bucket: "source-photos",
				storage_path: "user-1/photo.png",
				project_id: "project-1",
			},
			error: null,
			...opts.photoResult,
		});
		const taskChain: Record<string, (...args: unknown[]) => unknown> = {};
		taskChain.select = vi.fn(() => taskChain);
		taskChain.eq = vi.fn(() => taskChain);
		taskChain.maybeSingle = taskMaybeSingle;
		const photoChain: Record<string, (...args: unknown[]) => unknown> = {};
		photoChain.select = vi.fn(() => photoChain);
		photoChain.eq = vi.fn(() => photoChain);
		photoChain.maybeSingle = photoMaybeSingle;
		fromMock.mockImplementation((table: string) =>
			table === "renovation_tasks" ? taskChain : photoChain
		);
		const createSignedUrl = vi.fn().mockResolvedValue({
			data: { signedUrl: "https://signed/source.png" },
			error: null,
		});
		const storageFrom = vi.fn(() => ({ createSignedUrl }));
		return {
			supabase: {
				from: fromMock,
				storage: { from: storageFrom },
			} as unknown as Parameters<
				typeof __detectProtectedElementsHandler
			>[0]["supabase"],
			fromMock,
			createSignedUrl,
			storageFrom,
		};
	}

	it("returns the bounding boxes under `data` with the debug payload attached in dev", async () => {
		const provider = buildMockProvider();
		const { supabase, storageFrom, createSignedUrl } =
			buildDetectionSupabaseStub();

		const result = await __detectProtectedElementsHandler({
			userId: "user-1",
			supabase,
			provider,
			input: {
				photoId: "photo-1",
				taskId: "task-1",
				taskTitle: "ceiling",
				notes: "be careful",
			},
		});

		expect(result.data).toHaveLength(1);
		expect(result.debug).toEqual(SAMPLE_DEBUG);
		expect(storageFrom).toHaveBeenCalledWith("source-photos");
		expect(createSignedUrl).toHaveBeenCalledWith("user-1/photo.png", 600);
		expect(provider.detectProtectedElements).toHaveBeenCalledWith({
			photoUrl: "https://signed/source.png",
			taskTitle: "ceiling",
			notes: "be careful",
		});
	});

	it("strips the debug payload in production", async () => {
		process.env.NODE_ENV = "production";
		const provider = buildMockProvider();
		const { supabase } = buildDetectionSupabaseStub();

		const result = await __detectProtectedElementsHandler({
			userId: "user-1",
			supabase,
			provider,
			input: {
				photoId: "photo-1",
				taskId: "task-1",
				taskTitle: "ceiling",
			},
		});

		expect(result.data).toHaveLength(1);
		expect("debug" in result).toBe(false);
	});

	it("rejects when the photo is not in the task project", async () => {
		const provider = buildMockProvider();
		const { supabase, createSignedUrl } = buildDetectionSupabaseStub({
			photoResult: {
				data: {
					storage_bucket: "source-photos",
					storage_path: "user-1/photo.png",
					project_id: "other-project",
				},
				error: null,
			},
		});

		await expect(
			__detectProtectedElementsHandler({
				userId: "user-1",
				supabase,
				provider,
				input: {
					photoId: "photo-1",
					taskId: "task-1",
					taskTitle: "ceiling",
				},
			})
		).rejects.toThrow("Photo not found");
		expect(createSignedUrl).not.toHaveBeenCalled();
		expect(provider.detectProtectedElements).not.toHaveBeenCalled();
	});
});

describe("createDesignBriefHandler", () => {
	it("persists the generated brief and returns markdown + prompt + id under data with debug in dev", async () => {
		const provider = buildMockProvider();
		const stub = buildDesignBriefSupabaseStub({});

		const result = await __createDesignBriefHandler({
			userId: "user-1",
			supabase: stub.supabase,
			provider,
			input: {
				taskId: "task-1",
				taskTitle: "ceiling",
				styleRules: "scandinavian",
				protectedElements: [
					{
						label: "left window",
						kind: "window",
						x: 0,
						y: 0,
						width: 0.1,
						height: 0.1,
					},
				],
			},
		});

		expect(result.data).toEqual({
			id: "brief-1",
			markdown: "# brief",
			prompt: "PRESERVE EXACTLY",
			version: 1,
		});
		expect(result.debug).toEqual(SAMPLE_DEBUG);
		expect(stub.fromMock).toHaveBeenCalledWith("design_briefs");
		expect(stub.chain.insert).toHaveBeenCalledWith({
			owner_id: "user-1",
			task_id: "task-1",
			style_rules: "scandinavian",
			markdown: "# brief",
			prompt: "PRESERVE EXACTLY",
		});
		expect(provider.createDesignBrief).toHaveBeenCalledWith(
			expect.objectContaining({
				taskId: "task-1",
				taskTitle: "ceiling",
				styleRules: "scandinavian",
			})
		);
	});

	it("throws when persisting the generated brief fails", async () => {
		const provider = buildMockProvider();
		const stub = buildDesignBriefSupabaseStub({
			insertResult: { data: null, error: { message: "rls denied" } },
		});

		await expect(
			__createDesignBriefHandler({
				userId: "user-1",
				supabase: stub.supabase,
				provider,
				input: {
					taskId: "task-1",
					taskTitle: "ceiling",
					styleRules: "scandinavian",
					protectedElements: [],
				},
			})
		).rejects.toThrow("Database error");
	});
});

describe("saveDesignBriefHandler", () => {
	it("persists the current edited markdown and rebuilt prompt", async () => {
		const stub = buildDesignBriefSupabaseStub({});

		const result = await __saveDesignBriefHandler({
			userId: "user-1",
			supabase: stub.supabase,
			input: {
				taskId: "task-1",
				taskTitle: "ceiling",
				styleRules: "warm neutral palette",
				markdown: "# edited brief",
				protectedElements: [
					{
						label: "left window",
						kind: "window",
						x: 0,
						y: 0,
						width: 0.1,
						height: 0.1,
					},
				],
			},
		});

		expect(result).toEqual({
			id: "brief-1",
			markdown: "# brief",
			prompt: "PRESERVE EXACTLY",
			version: 1,
		});
		expect(stub.fromMock).toHaveBeenCalledWith("design_briefs");
		expect(stub.chain.insert).toHaveBeenCalledWith({
			owner_id: "user-1",
			task_id: "task-1",
			style_rules: "warm neutral palette",
			markdown: "# edited brief",
			prompt: expect.stringContaining("DESIGN BRIEF:"),
		});
		expect(stub.chain.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: expect.stringContaining("# edited brief"),
			})
		);
	});

	it("throws when persisting the current brief fails", async () => {
		const stub = buildDesignBriefSupabaseStub({
			insertResult: { data: null, error: { message: "rls denied" } },
		});

		await expect(
			__saveDesignBriefHandler({
				userId: "user-1",
				supabase: stub.supabase,
				input: {
					taskId: "task-1",
					taskTitle: "ceiling",
					styleRules: "warm neutral palette",
					markdown: "# edited brief",
					protectedElements: [],
				},
			})
		).rejects.toThrow("Database error");
	});
});

describe("generateRenovationImagesHandler", () => {
	it("inserts a job row, uploads each variation, persists images, and returns signed URLs", async () => {
		const stub = buildGenerationSupabaseStub({});
		const provider = buildMockProvider();

		const result = await __generateRenovationImagesHandler({
			userId: "user-1",
			supabase: stub.supabase,
			provider,
			providerName: "mock",
			input: {
				taskId: "t1",
				briefId: null,
				prompt: "PRESERVE EXACTLY",
				count: 2,
			},
		});

		expect(result.data.jobId).toBe("job-1");
		expect(result.data.images).toHaveLength(2);
		expect(result.data.images[0]?.signedUrl).toContain("user-1/job-1-0.png");
		expect(result.data.images[1]?.variationIndex).toBe(1);
		expect(stub.fromMock).toHaveBeenCalledWith("renovation_tasks");
		expect(stub.fromMock).toHaveBeenCalledWith("generation_jobs");
		expect(stub.fromMock).toHaveBeenCalledWith("generated_images");
		expect(stub.uploadMock).toHaveBeenCalledTimes(2);
		expect(stub.uploadMock).toHaveBeenNthCalledWith(
			1,
			"user-1/job-1-0.png",
			expect.any(Buffer),
			expect.objectContaining({ contentType: "image/png" })
		);
		expect(stub.createSignedUrlMock).toHaveBeenCalledTimes(2);
		expect(provider.generateRenovationImages).toHaveBeenCalledWith({
			sourceImage: undefined,
			outputSize: "auto",
			prompts: expect.arrayContaining([
				expect.stringContaining("PRESERVE EXACTLY"),
			]),
		});
		expect(
			provider.generateRenovationImages.mock.calls[0]?.[0]?.prompts
		).toHaveLength(2);
	});

	it("generates against the Room Composite as a 3:2 source when compositeId is set", async () => {
		const stub = buildGenerationSupabaseStub({});
		const provider = buildMockProvider();

		await __generateRenovationImagesHandler({
			userId: "user-1",
			supabase: stub.supabase,
			provider,
			providerName: "mock",
			input: {
				taskId: "t1",
				briefId: null,
				prompt: "PRESERVE EXACTLY",
				count: 2,
				compositeId: "11111111-1111-4111-8111-111111111111",
			},
		});

		expect(stub.fromMock).toHaveBeenCalledWith("room_composites");
		const call = provider.generateRenovationImages.mock.calls[0]?.[0];
		expect(call?.outputSize).toBe("1536x1024");
		expect(call?.sourceImage).toBeDefined();
	});

	it("rejects with 'Task not found' when the task is not owned by the caller", async () => {
		const stub = buildGenerationSupabaseStub({
			taskResult: { data: null, error: null },
		});
		const provider = buildMockProvider();

		await expect(
			__generateRenovationImagesHandler({
				userId: "user-1",
				supabase: stub.supabase,
				provider,
				providerName: "mock",
				input: {
					taskId: "t1",
					briefId: null,
					prompt: "PRESERVE EXACTLY",
					count: 1,
				},
			})
		).rejects.toThrow("Task not found");
		expect(provider.generateRenovationImages).not.toHaveBeenCalled();
	});

	it("rejects when an explicitly selected source photo cannot be loaded", async () => {
		const stub = buildGenerationSupabaseStub({
			sourcePhotoResult: { data: null, error: null },
		});
		const provider = buildMockProvider();

		await expect(
			__generateRenovationImagesHandler({
				userId: "user-1",
				supabase: stub.supabase,
				provider,
				providerName: "mock",
				input: {
					taskId: "t1",
					briefId: null,
					prompt: "PRESERVE EXACTLY",
					count: 1,
					photoId: "photo-1",
				},
			})
		).rejects.toThrow("Source photo not found or unavailable");
		expect(stub.jobsChain.insert).not.toHaveBeenCalled();
		expect(provider.generateRenovationImages).not.toHaveBeenCalled();
	});

	it("marks the job as failed when an upload fails and rethrows", async () => {
		const stub = buildGenerationSupabaseStub({
			uploadResult: { error: { message: "bucket policy" } },
		});
		const provider = buildMockProvider();

		await expect(
			__generateRenovationImagesHandler({
				userId: "user-1",
				supabase: stub.supabase,
				provider,
				providerName: "mock",
				input: {
					taskId: "t1",
					briefId: null,
					prompt: "PRESERVE EXACTLY",
					count: 1,
				},
			})
		).rejects.toThrow(/upload/i);

		// The job update chain should have been invoked to record the failure.
		expect(stub.jobsChain.update).toHaveBeenCalledWith(
			expect.objectContaining({ status: "failed" })
		);
	});

	it("clamps the variation count to the 1..4 range", async () => {
		const stub = buildGenerationSupabaseStub({
			imageInsertResults: [
				{
					data: {
						id: "img-only",
						storage_path: "user-1/job-1-0.png",
						variation_index: 0,
						is_favorite: false,
					},
					error: null,
				},
			],
		});
		const provider = buildMockProvider();
		// Provider returns 1 image regardless — count clamped server-side then
		// passed through; the mock only resolves with the requested length.
		provider.generateRenovationImages.mockResolvedValueOnce({
			value: [{ base64: "AAAA", contentType: "image/png" as const }],
			debug: { ...SAMPLE_DEBUG, model: "gpt-image-2" },
		});

		await __generateRenovationImagesHandler({
			userId: "user-1",
			supabase: stub.supabase,
			provider,
			providerName: "mock",
			input: {
				taskId: "t1",
				briefId: null,
				prompt: "PRESERVE EXACTLY",
				// Schema would normally reject >4 but we cover the defensive clamp.
				count: 99 as unknown as number,
			},
		});

		expect(
			provider.generateRenovationImages.mock.calls[0]?.[0]?.prompts
		).toHaveLength(4);
	});

	it("strips the debug payload in production", async () => {
		process.env.NODE_ENV = "production";
		const stub = buildGenerationSupabaseStub({
			imageInsertResults: [
				{
					data: {
						id: "img-only",
						storage_path: "user-1/job-1-0.png",
						variation_index: 0,
						is_favorite: false,
					},
					error: null,
				},
			],
		});
		const provider = buildMockProvider();
		provider.generateRenovationImages.mockResolvedValueOnce({
			value: [{ base64: "AAAA", contentType: "image/png" as const }],
			debug: { ...SAMPLE_DEBUG, model: "gpt-image-2" },
		});

		const result = await __generateRenovationImagesHandler({
			userId: "user-1",
			supabase: stub.supabase,
			provider,
			providerName: "mock",
			input: {
				taskId: "t1",
				briefId: null,
				prompt: "PRESERVE EXACTLY",
				count: 1,
			},
		});

		expect("debug" in result).toBe(false);
		expect(result.data.images).toHaveLength(1);
	});
});

describe("setImageFavoriteHandler", () => {
	it("updates is_favorite and returns the updated row", async () => {
		const stub = buildFavoriteSupabaseStub({
			updateResult: {
				data: {
					id: "img-1",
					is_favorite: true,
					storage_path: "user-1/job-1-0.png",
					variation_index: 0,
				},
				error: null,
			},
		});

		const result = await __setImageFavoriteHandler({
			userId: "user-1",
			supabase: stub.supabase,
			input: { imageId: "img-1", isFavorite: true },
		});

		expect(result.is_favorite).toBe(true);
		expect(stub.chain.update).toHaveBeenCalledWith({ is_favorite: true });
		expect(stub.chain.eq).toHaveBeenCalledWith("id", "img-1");
		expect(stub.chain.eq).toHaveBeenCalledWith("owner_id", "user-1");
	});

	it("throws 'Not found' when no row matched the owner + id filter", async () => {
		const stub = buildFavoriteSupabaseStub({
			updateResult: { data: null, error: null },
		});

		await expect(
			__setImageFavoriteHandler({
				userId: "user-1",
				supabase: stub.supabase,
				input: { imageId: "img-missing", isFavorite: true },
			})
		).rejects.toThrow("Not found");
	});

	it("wraps supabase errors", async () => {
		const stub = buildFavoriteSupabaseStub({
			updateResult: { data: null, error: { code: "42501", message: "x" } },
		});

		await expect(
			__setImageFavoriteHandler({
				userId: "user-1",
				supabase: stub.supabase,
				input: { imageId: "img-1", isFavorite: false },
			})
		).rejects.toThrow("Not authorized");
	});
});

/**
 * `protected_elements` chain stub — wraps a single PostgREST query path that
 * the list handler uses: `.select(...).eq().eq().eq().order(...)`. Returns
 * `result` from the terminal `.order(...)` call.
 */
function buildListProtectedElementsStub(opts: {
	listResult?: { data: Row[] | null; error: unknown };
}) {
	const fromMock = vi.fn();
	const chain: Record<string, (...args: unknown[]) => unknown> = {};
	chain.select = vi.fn(() => chain);
	chain.eq = vi.fn(() => chain);
	chain.order = vi.fn(() =>
		Promise.resolve(opts.listResult ?? { data: [], error: null })
	);
	fromMock.mockImplementation(() => chain);
	return {
		supabase: {
			from: fromMock,
		} as unknown as Parameters<
			typeof __listProtectedElementsHandler
		>[0]["supabase"],
		fromMock,
		chain,
	};
}

function buildSaveDetectedElementsStub(opts: {
	rpcResult?: { data: Row[] | null; error: unknown };
}) {
	const rpc = vi.fn(() =>
		Promise.resolve(opts.rpcResult ?? { data: [], error: null })
	);
	return {
		supabase: {
			rpc,
		} as unknown as Parameters<
			typeof __saveDetectedElementsHandler
		>[0]["supabase"],
		rpc,
	};
}

function buildUpdateProtectedElementStatusStub(opts: {
	updateResult?: { data: Row | null; error: unknown };
}) {
	const fromMock = vi.fn();
	const chain: Record<string, (...args: unknown[]) => unknown> = {};
	chain.update = vi.fn(() => chain);
	chain.eq = vi.fn(() => chain);
	chain.select = vi.fn(() => chain);
	chain.maybeSingle = vi.fn(() =>
		Promise.resolve(opts.updateResult ?? { data: null, error: null })
	);
	fromMock.mockImplementation(() => chain);
	return {
		supabase: {
			from: fromMock,
		} as unknown as Parameters<
			typeof __updateProtectedElementStatusHandler
		>[0]["supabase"],
		fromMock,
		chain,
	};
}

const SAMPLE_ROW: Row = {
	id: "el-1",
	task_id: "t1",
	photo_id: "ph-1",
	project_id: "p1",
	label: "left window",
	kind: "window",
	x: 0.1,
	y: 0.2,
	width: 0.2,
	height: 0.3,
	confidence: 0.9,
	status: "suggested",
	created_at: "2026-01-01T00:00:00Z",
};

describe("listProtectedElementsHandler", () => {
	it("queries by task, photo, and owner and returns the rows", async () => {
		const stub = buildListProtectedElementsStub({
			listResult: { data: [SAMPLE_ROW], error: null },
		});

		const result = await __listProtectedElementsHandler({
			userId: "user-1",
			supabase: stub.supabase,
			input: {
				taskId: "11111111-1111-1111-1111-111111111111",
				photoId: "22222222-2222-2222-2222-222222222222",
			},
		});

		expect(result).toHaveLength(1);
		expect(result[0]?.label).toBe("left window");
		expect(stub.fromMock).toHaveBeenCalledWith("protected_elements");
		expect(stub.chain.eq).toHaveBeenCalledWith(
			"task_id",
			"11111111-1111-1111-1111-111111111111"
		);
		expect(stub.chain.eq).toHaveBeenCalledWith(
			"photo_id",
			"22222222-2222-2222-2222-222222222222"
		);
		expect(stub.chain.eq).toHaveBeenCalledWith("owner_id", "user-1");
	});

	it("returns an empty array when no rows match", async () => {
		const stub = buildListProtectedElementsStub({
			listResult: { data: [], error: null },
		});

		const result = await __listProtectedElementsHandler({
			userId: "user-1",
			supabase: stub.supabase,
			input: {
				taskId: "11111111-1111-1111-1111-111111111111",
				photoId: "22222222-2222-2222-2222-222222222222",
			},
		});

		expect(result).toEqual([]);
	});

	it("wraps supabase errors", async () => {
		const stub = buildListProtectedElementsStub({
			listResult: { data: null, error: { code: "42501", message: "rls" } },
		});

		await expect(
			__listProtectedElementsHandler({
				userId: "user-1",
				supabase: stub.supabase,
				input: {
					taskId: "11111111-1111-1111-1111-111111111111",
					photoId: "22222222-2222-2222-2222-222222222222",
				},
			})
		).rejects.toThrow("Not authorized");
	});
});

describe("saveDetectedElementsHandler", () => {
	it("replaces rows through the atomic RPC with status 'suggested'", async () => {
		const stub = buildSaveDetectedElementsStub({
			rpcResult: { data: [SAMPLE_ROW], error: null },
		});

		const result = await __saveDetectedElementsHandler({
			userId: "user-1",
			supabase: stub.supabase,
			input: {
				taskId: "11111111-1111-1111-1111-111111111111",
				photoId: "22222222-2222-2222-2222-222222222222",
				elements: [
					{
						label: "left window",
						kind: "window",
						x: 0.1,
						y: 0.2,
						width: 0.2,
						height: 0.3,
						confidence: 0.9,
					},
				],
			},
		});

		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe("el-1");
		expect(stub.rpc).toHaveBeenCalledWith("replace_protected_elements", {
			p_task_id: "11111111-1111-1111-1111-111111111111",
			p_photo_id: "22222222-2222-2222-2222-222222222222",
			p_elements: [
				{
					label: "left window",
					kind: "window",
					x: 0.1,
					y: 0.2,
					width: 0.2,
					height: 0.3,
					confidence: 0.9,
				},
			],
		});
	});

	it("still calls the RPC when the elements array is empty so stale rows are cleared", async () => {
		const stub = buildSaveDetectedElementsStub({});

		const result = await __saveDetectedElementsHandler({
			userId: "user-1",
			supabase: stub.supabase,
			input: {
				taskId: "11111111-1111-1111-1111-111111111111",
				photoId: "22222222-2222-2222-2222-222222222222",
				elements: [],
			},
		});

		expect(result).toEqual([]);
		expect(stub.rpc).toHaveBeenCalledWith("replace_protected_elements", {
			p_task_id: "11111111-1111-1111-1111-111111111111",
			p_photo_id: "22222222-2222-2222-2222-222222222222",
			p_elements: [],
		});
	});

	it("wraps supabase errors from the replace RPC", async () => {
		const stub = buildSaveDetectedElementsStub({
			rpcResult: { data: null, error: { code: "42501", message: "rls" } },
		});

		await expect(
			__saveDetectedElementsHandler({
				userId: "user-1",
				supabase: stub.supabase,
				input: {
					taskId: "11111111-1111-1111-1111-111111111111",
					photoId: "22222222-2222-2222-2222-222222222222",
					elements: [
						{
							label: "x",
							kind: "window",
							x: 0,
							y: 0,
							width: 0.1,
							height: 0.1,
							confidence: null,
						},
					],
				},
			})
		).rejects.toThrow("Not authorized");
	});
});

describe("updateProtectedElementStatusHandler", () => {
	it("updates status and returns the updated row", async () => {
		const stub = buildUpdateProtectedElementStatusStub({
			updateResult: {
				data: { ...SAMPLE_ROW, status: "confirmed" },
				error: null,
			},
		});

		const result = await __updateProtectedElementStatusHandler({
			userId: "user-1",
			supabase: stub.supabase,
			input: {
				elementId: "44444444-4444-4444-4444-444444444444",
				status: "confirmed",
			},
		});

		expect(result.status).toBe("confirmed");
		expect(stub.chain.update).toHaveBeenCalledWith({ status: "confirmed" });
		expect(stub.chain.eq).toHaveBeenCalledWith(
			"id",
			"44444444-4444-4444-4444-444444444444"
		);
		expect(stub.chain.eq).toHaveBeenCalledWith("owner_id", "user-1");
	});

	it("throws 'Not found' when no row matched", async () => {
		const stub = buildUpdateProtectedElementStatusStub({
			updateResult: { data: null, error: null },
		});

		await expect(
			__updateProtectedElementStatusHandler({
				userId: "user-1",
				supabase: stub.supabase,
				input: {
					elementId: "44444444-4444-4444-4444-444444444444",
					status: "rejected",
				},
			})
		).rejects.toThrow("Not found");
	});

	it("wraps supabase errors", async () => {
		const stub = buildUpdateProtectedElementStatusStub({
			updateResult: {
				data: null,
				error: { code: "42501", message: "rls" },
			},
		});

		await expect(
			__updateProtectedElementStatusHandler({
				userId: "user-1",
				supabase: stub.supabase,
				input: {
					elementId: "44444444-4444-4444-4444-444444444444",
					status: "rejected",
				},
			})
		).rejects.toThrow("Not authorized");
	});
});

describe("describeGeneratedImagesHandler", () => {
	function buildDescribeSupabaseStub(rows: Row[]) {
		const selectChain: Record<string, (...args: unknown[]) => unknown> = {};
		selectChain.eq = vi.fn(() => selectChain);
		selectChain.order = vi.fn(() =>
			Promise.resolve({ data: rows, error: null })
		);

		const updateChain: Record<string, (...args: unknown[]) => unknown> = {};
		let updateEqCalls = 0;
		updateChain.eq = vi.fn(() => {
			updateEqCalls += 1;
			if (updateEqCalls % 2 === 0) return Promise.resolve({ error: null });
			return updateChain;
		});

		const imagesChain = {
			select: vi.fn(() => selectChain),
			update: vi.fn(() => updateChain),
		};
		const createSignedUrlMock = vi.fn(async (path: string) => ({
			data: { signedUrl: `https://signed/${path}` },
			error: null,
		}));

		return {
			supabase: {
				from: vi.fn(() => imagesChain),
				storage: {
					from: vi.fn(() => ({ createSignedUrl: createSignedUrlMock })),
				},
			} as unknown as Parameters<
				typeof __describeGeneratedImagesHandler
			>[0]["supabase"],
			imagesChain,
			createSignedUrlMock,
		};
	}

	it("describes only images without a stored list and persists the result", async () => {
		const stub = buildDescribeSupabaseStub([
			{
				id: "img-1",
				storage_bucket: "generated-outputs",
				storage_path: "user-1/job-1-0.png",
				notes: JSON.stringify(["existing rug"]),
			},
			{
				id: "img-2",
				storage_bucket: "generated-outputs",
				storage_path: "user-1/job-1-1.png",
				notes: null,
			},
		]);
		const provider = buildMockProvider();

		const result = await __describeGeneratedImagesHandler({
			userId: "user-1",
			supabase: stub.supabase,
			provider,
			input: { taskId: "t1", jobId: "job-1" },
		});

		expect(result.contents).toEqual({
			"img-1": ["existing rug"],
			"img-2": ["beige sofa", "oak coffee table"],
		});
		// Only the undescribed image hit the provider.
		expect(provider.listRoomContents).toHaveBeenCalledTimes(1);
		expect(stub.imagesChain.update).toHaveBeenCalledWith({
			notes: JSON.stringify(["beige sofa", "oak coffee table"]),
		});
	});

	it("skips images whose vision call fails instead of failing the batch", async () => {
		const stub = buildDescribeSupabaseStub([
			{
				id: "img-1",
				storage_bucket: "generated-outputs",
				storage_path: "user-1/job-1-0.png",
				notes: null,
			},
		]);
		const provider = buildMockProvider();
		provider.listRoomContents.mockRejectedValueOnce(new Error("vision down"));

		const result = await __describeGeneratedImagesHandler({
			userId: "user-1",
			supabase: stub.supabase,
			provider,
			input: { taskId: "t1", jobId: "job-1" },
		});

		expect(result.contents).toEqual({});
		expect(stub.imagesChain.update).not.toHaveBeenCalled();
	});
});
