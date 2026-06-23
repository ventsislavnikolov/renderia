import { expect, test } from "@playwright/test";
import {
	FIXTURE_BYTES,
	installBaseMocks,
	installFakeSession,
	PROJECT_ID,
	TASK_ID,
	USER_ID,
} from "./support";

/**
 * Multi-upload flow for the guided upload step. The Supabase storage upload
 * (POST to the `source-photos` bucket) and the `createPhotoRecord` / room-state
 * server fns are mocked through the shared `support` helpers, so this drives the
 * batch picker end-to-end without real Supabase credentials.
 */

const TASK_URL = `/projects/${PROJECT_ID}/tasks/${TASK_ID}`;

const EMPTY_ROOM_STATE = {
	roomState: {
		photoIds: [],
		reviewedPhotoIds: [],
		referencePhotoId: null,
		appearances: [],
		objects: [],
		approvedPhotoIds: [],
	},
	previews: {},
	composite: null,
};

test.describe("multi-upload photos", () => {
	test("uploads a batch via the picker and auto-selects them", async ({
		page,
		context,
	}) => {
		await installFakeSession(context);
		let created = 0;
		await installBaseMocks(page, {
			loadTaskRoomState: () => EMPTY_ROOM_STATE,
			listProjectPhotos: () => [],
			createPhotoRecord: (_route, body) => {
				created += 1;
				const data = (body?.data ?? {}) as {
					storagePath?: string;
					originalName?: string;
				};
				return {
					id: `photo-${created}`,
					owner_id: USER_ID,
					project_id: PROJECT_ID,
					storage_bucket: "source-photos",
					storage_path: data.storagePath ?? `${USER_ID}/photo-${created}.png`,
					original_name: data.originalName ?? `photo-${created}.png`,
					content_type: "image/png",
					width: null,
					height: null,
					notes: null,
					created_at: "2026-01-01T00:00:00Z",
				};
			},
		});

		await page.goto(TASK_URL);
		await expect(
			page.getByRole("heading", { name: /Upload source photos/i })
		).toBeVisible();

		// Pick two files in one action via the (multiple) file input.
		await page.getByLabel("Choose photos to upload").setInputFiles([
			{ name: "room-a.png", mimeType: "image/png", buffer: FIXTURE_BYTES },
			{ name: "room-b.png", mimeType: "image/png", buffer: FIXTURE_BYTES },
		]);

		// Both upload and are auto-selected into the Room Set: the Continue button
		// reflects 2, and exactly two photo tiles render in the selected (pressed)
		// state.
		await expect(
			page.getByRole("button", { name: /continue with 2 photos/i })
		).toBeEnabled();
		await expect(page.getByRole("button", { pressed: true })).toHaveCount(2);
	});

	test("rejects a batch that would exceed the 4-photo cap", async ({
		page,
		context,
	}) => {
		await installFakeSession(context);
		let createCalls = 0;
		await installBaseMocks(page, {
			loadTaskRoomState: () => EMPTY_ROOM_STATE,
			listProjectPhotos: () => [],
			createPhotoRecord: () => {
				createCalls += 1;
				return null;
			},
		});

		await page.goto(TASK_URL);
		await expect(
			page.getByRole("heading", { name: /Upload source photos/i })
		).toBeVisible();

		await page.getByLabel("Choose photos to upload").setInputFiles(
			["a", "b", "c", "d", "e"].map((name) => ({
				name: `${name}.png`,
				mimeType: "image/png",
				buffer: FIXTURE_BYTES,
			}))
		);

		await expect(page.getByRole("alert")).toContainText(/4 max/i);
		expect(createCalls).toBe(0);
	});
});
