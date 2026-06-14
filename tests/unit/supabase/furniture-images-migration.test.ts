import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Multi-photo furniture (PRD: multi-photo-furniture, ADR 0001) migration
 * 0008 is destructive and hard to reverse, so we can't apply it against a
 * live DB in CI. Instead we assert its structural invariants from the SQL
 * itself: the child table + one-active index exist, RLS is owner-scoped, the
 * backfill copies one active row per existing item with the same storage
 * path, and the moved columns are dropped from the parent.
 */
const migrationsDir = join(
	dirname(fileURLToPath(import.meta.url)),
	"../../../supabase/migrations"
);

function readMigration(name: string): string {
	return readFileSync(join(migrationsDir, name), "utf8");
}

const sql = readMigration("0008_furniture_item_images.sql");
// Whitespace-insensitive haystack for matching multi-line statements.
const flat = sql.replace(/\s+/g, " ").toLowerCase();

describe("0008_furniture_item_images migration", () => {
	it("creates the normalized child table with the FK to (id, owner_id)", () => {
		expect(flat).toContain("create table public.furniture_item_images");
		expect(flat).toContain(
			"references public.furniture_items (id, owner_id) on delete cascade"
		);
	});

	it("enforces exactly one active photo per item via a partial unique index", () => {
		expect(flat).toMatch(
			/create unique index \S+ on public\.furniture_item_images \(furniture_item_id\) where is_active/
		);
	});

	it("moves the (storage_bucket, storage_path) uniqueness to the child table", () => {
		expect(flat).toContain("unique (storage_bucket, storage_path)");
	});

	it("scopes RLS to the owner with an owner-prefixed storage path", () => {
		expect(flat).toContain(
			"alter table public.furniture_item_images enable row level security"
		);
		expect(flat).toContain("owner_id = auth.uid()");
		expect(flat).toContain("storage_path like auth.uid()::text || '/%'");
	});

	it("backfills one active child row per existing item, copying its image fields", () => {
		expect(flat).toContain("insert into public.furniture_item_images");
		// is_active=true is the trailing literal of the backfill SELECT, so the
		// single pre-migration image becomes the active Reference Image.
		expect(flat).toMatch(
			/select id, owner_id, storage_bucket, storage_path, original_name, content_type, source, true from public\.furniture_items/
		);
	});

	it("drops the moved columns from the parent", () => {
		for (const column of [
			"storage_path",
			"original_name",
			"content_type",
			"source",
		]) {
			expect(flat).toContain(`drop column ${column}`);
		}
	});
});
