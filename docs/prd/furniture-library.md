# PRD: Furniture Library — account-wide page with Link Import

> Migrated from the Linear project document. Tracked as GitHub milestone **M5** and issues #21–#35 (furniture work) / #56–#61 (M7 follow-ups).

## Problem Statement

When I find a piece of furniture I like at a retailer (Jysk, IKEA), getting it into Renderia is manual and lossy: I have to download a product photo, re-upload it, and retype a label. The product's real name, dimensions, and price stay behind on the retailer page, so generated renders can't respect the piece's proportions and I can't compare candidate pieces later.

Furniture I add is also trapped inside one project. The same armchair is a candidate for any room I'm renovating, but today I must re-add it per project. And the only place to manage furniture at all is buried inside step 6 of the guided flow — there is no place to browse, edit, or curate what I've collected.

## Solution

A dedicated **Furniture** page (sidebar, after Favorites) that manages an account-wide **Furniture Library**. Items can be added two ways:

1. **Link Import** — paste a retailer product URL. The server fetches the page, reads its structured product data (name, photos, brand, price), extracts dimensions from the page text with the AI provider, and presents an editable confirm form where I pick which photo becomes the **Reference Image**. Nothing saves until I confirm.
2. **Manual** — upload a product shot or a phone photo with the existing crop flow, exactly as the in-step picker does today.

Every Furniture Item is selectable from any task's generation step. Item dimensions flow into the generation prompt so renders respect proportions, and are displayed on the page and picker. The **Source Link** stays on the item as the pointer back to live retailer data.

## User Stories

 1. As a renovator, I want to paste a Jysk or IKEA product URL and get the item's name, photos, and sizes pre-filled, so that adding furniture takes seconds instead of a download-upload-retype loop.
 2. As a renovator, I want to review and edit everything the Link Import extracted before it saves, so that a misparsed name or dimension never silently pollutes my library.
 3. As a renovator, I want to choose which of the product page's photos becomes the Reference Image, so that a clean cutout — not a styled lifestyle scene — is what the AI uses.
 4. As a renovator, I want imported dimensions (W×H×D) sent with the furniture reference in the generation prompt, so that rendered pieces have plausible proportions relative to the room.
 5. As a renovator, I want each item to keep its price and currency from import time, so that I can compare candidate pieces for a room at a glance.
 6. As a renovator, I want each imported item to keep its Source Link, so that I can jump to the retailer page to check live price and availability.
 7. As a renovator, I want one Furniture Library across all my projects, so that a piece I added while working on one room is available in every other room.
 8. As a renovator, I want a dedicated Furniture page in the sidebar, so that I can browse and curate my library without opening a task.
 9. As a renovator, I want to add furniture manually on the Furniture page by uploading a product image, so that pieces without a URL still enter the library.
10. As a renovator, I want to add furniture from a phone photo with a crop box on the Furniture page, so that a piece I photographed in a shop becomes a usable reference.
11. As a renovator, I want to edit an item's label and dimensions after creation, so that I can fix extraction mistakes or refine names later.
12. As a renovator, I want to delete items from my library, so that rejected candidates don't clutter the picker.
13. As a renovator, I want the generation-step picker to show my whole library, so that I select from everything I've collected regardless of where I added it.
14. As a renovator, I want to quick-add an item (paste a link or upload) directly inside the generation step, so that finding a piece mid-flow doesn't force me to leave the task.
15. As a renovator, I want item cards to show the Reference Image, label, dimensions, price, and retailer, so that the library doubles as a shopping shortlist.
16. As a renovator, I want a clear error when a pasted URL can't be read (blocked, not a product page, unparseable), so that I know to add the piece manually instead of wondering what happened.
17. As a renovator, I want the import to work on retailers beyond Jysk and IKEA when their pages carry standard structured data, so that I'm not limited to two shops.
18. As a renovator, I want my existing per-project furniture to appear in the account-wide library after the change, so that nothing I already added is lost.
19. As a renovator, I want imported photos stored by Renderia rather than hotlinked, so that my library doesn't break when a retailer moves files.
20. As a renovator, I want deleting an item to detach it from tasks that referenced it without breaking those tasks, so that cleanup is safe.

## Implementation Decisions

* **Account-wide library.** `furniture_items` loses project ownership; items belong to the owner only. `task_furniture` keeps task→item links; its composite foreign keys are reworked to (item, owner). Existing rows migrate by simply becoming visible account-wide — no review step.
* **New item fields**: `source_link` (nullable URL), `brand`, `price` + `currency` (import-time snapshot, never refreshed), `width_cm` / `height_cm` / `depth_cm` (nullable). The existing `source` enum stays `product` / `photo`; a non-null `source_link` is the marker for link-imported items.
* **Link Import pipeline**: a server function fetches the URL (honest User-Agent, robots.txt respected, response size-capped), parses [schema.org](<http://schema.org>) Product JSON-LD for name / images / brand / price (verified present on [jysk.bg](<http://jysk.bg>) and [ikea.bg](<http://ikea.bg>) product pages), falls back to OG tags, then makes one AI-provider call over stripped page text to extract dimensions and fill gaps. Output pre-fills a confirm form; the user edits and picks one photo; only on confirm does the server download that photo into the furniture storage bucket and insert the row. Downloaded photos pass through the existing server-side image normalization (PNG re-encode).
* **Extraction is a pure function** over (html, url) returning the structured candidate — fetch and AI are injected, keeping the parser deterministic and fixture-testable.
* **Dimension extraction is a new method on the AI provider interface**, implemented by the OpenAI provider and the mock provider, same pattern as detection and brief generation.
* **Prompt change**: the furniture reference section includes dimensions when present ("UDSBJERG armchair, 72×76×77 cm").
* **Furniture page** at a new authenticated route, linked in the sidebar directly after Favorites. It is the full manager: grid of item cards, Link Import, manual upload (product shot or crop-from-photo, reusing the existing crop flow), edit label/dimensions, delete.
* **Generation-step picker** is rewired to the account-wide library and keeps quick-add (link paste or upload) so mid-flow additions stay in place.
* **Glossary**: Furniture Library, Furniture Item, Reference Image, Link Import, Source Link — as defined in CONTEXT.md.

## Testing Decisions

* Good tests assert external behavior at the highest existing seam — handler in, rows/payload out — never internal call order or private helpers.
* **Server-handler seam (existing pattern)**: the import handler and the reworked create/list/delete handlers are tested with the mocked-Supabase stub pattern already used by the furniture handler tests. The page fetch is injected, so tests feed fixture HTML and never touch the network.
* **Pure extraction seam (new)**: the product-page parser is tested against saved Jysk and IKEA HTML fixtures, asserting name / images / brand / price / currency extraction and graceful nulls on non-product pages.
* **Provider seam (existing pattern)**: dimension extraction is covered through the mock provider in handler tests; the OpenAI implementation follows the existing provider unit-test style with a stubbed client.
* **Prompt seam (existing pattern)**: furniture-reference-section tests extend the existing prompt builder tests to cover dimensions present/absent.
* **Component seam (existing pattern, light)**: Furniture page render, empty state, and error state following the existing component test conventions.
* **No live-fetch tests in CI** — retailer pages change and rate-limit; fixtures pin behavior deterministically. A retailer redesign surfaces as a graceful runtime import failure, not CI flake.

## Out of Scope

* Storing multiple photos per Furniture Item (single Reference Image only).
* Live price refresh / availability sync from retailers.
* Retailer-specific scraping adapters or headless-browser rendering for JS-only pages.
* Project pinning / per-project shortlists on top of the account-wide library.
* Sharing libraries between accounts.
* An Architecture Decision Record (declined; the decision is captured in CONTEXT.md and this PRD).

## Further Notes

* Verified during design: [jysk.bg](<http://jysk.bg>) ships full Product JSON-LD (name, image array, brand, offers) but dimensions only in prose/name; [ikea.bg](<http://ikea.bg>) product pages ship Product JSON-LD with spec-row dimensions in prose. Category pages on [ikea.bg](<http://ikea.bg>) are client-rendered — only direct product URLs are importable, which matches the paste-a-product-link flow.
* Dimensions and price are best-effort: any field may be null after import, and the confirm form is the correctness gate.
* The import endpoint should be treated as a user-triggered, low-volume fetch (one page per paste) — no crawling, no caching of retailer HTML beyond the request.
