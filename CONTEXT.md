# Renderia

AI-assisted interior renovation workspace: users photograph rooms, review and
preserve what matters, and generate restyled concept images per renovation
task.

## Language

**Project**:
The top-level grouping a user owns — a property, floor, or client under which
renovation Tasks (rooms) and all their Photos, previews, and generated concepts
live. Has a name and optional description. Deleting one is
permanent and cascades to everything beneath it; the Furniture Library is
account-wide and is _not_ scoped to a Project, so it survives.
_Avoid_: workspace (the whole signed-in account is the workspace), folder

**Furniture Library**:
The account-wide collection of Furniture Items a user builds up over time.
Not scoped to a project — any item is a candidate for any task.
_Avoid_: project furniture, furniture list

**Furniture Item**:
One piece of furniture in the Furniture Library, represented by a Reference
Image, a label, and optional dimensions/price, attachable to a task's
generation run.
_Avoid_: furniture reference, product

**Reference Image**:
The active Furniture Photo of a Furniture Item — the one generation sends to
the model. Exactly one per item; the user can switch which Furniture Photo is
active. A clean product cutout beats a lifestyle scene.
_Avoid_: thumbnail, photo set

**Furniture Photo**:
One image attached to a Furniture Item. An item has one or more Furniture
Photos; exactly one is the active Reference Image. The rest are kept in the
library (e.g. a product cutout plus real-life angles) but are not sent to
generation.
_Avoid_: reference (only the active one is the Reference Image), variation

**Link Import**:
Creating a Furniture Item by pasting a retailer product URL. The page is
fetched server-side; name, photos, brand, and price come from structured
data, dimensions are extracted from the page text, and the user confirms an
editable form before saving.
_Avoid_: scraping, sync

**Source Link**:
The product URL a Furniture Item was imported from. The pointer to live
retailer data — stored price and dimensions are import-time snapshots.
_Avoid_: product page, origin

**Room Set**:
The 1–4 Photos a user attaches to a renovation Task as the evidence for one
room. The whole set describes the same room from different angles.
_Avoid_: gallery, album

**Appearance**:
One detected structural element (a window, door, radiator, etc.) located by a
box within a single Photo. The same real element seen from two angles is two
Appearances.
_Avoid_: detection, box

**Room Object**:
One real structural element of the room, grouping the Appearances of it across
Photos. Carries a preservation choice — keep it exactly, or keep its type but
allow a restyle.
_Avoid_: element, feature

**Structural Preview**:
An empty-room confirmation image generated for one Photo's angle — the room
with furniture stripped out and Room Objects kept. One per Photo. The user's
informal word for this is "layout".
_Avoid_: layout (informal), render, mockup

**Reference Photo**:
The single Photo angle a Structural Preview is seeded from — the "POV". No
longer the generation source: the final design is generated per-angle (see
below), against every approved Structural Preview.
_Avoid_: POV, main photo

**Per-angle generation**:
The final design is generated against each approved Structural Preview
independently — one design concept rendered per angle, producing one image per
angle that together cover the whole room. Each output stays photoreal because
it edits one real photo. This replaced the **Room Composite** (a single wide
"360" empty-room view stitched from all angles): stitching non-overlapping
corners into one frame produced incoherent collages, so it was removed (the
`room_composites` table was dropped in migration 0012). The wizard's step 05 is
now a read-only "Room" review of the approved angles. See docs/adr/0002.
_Avoid_: 360 view, Room Composite (removed), panorama

**Style**:
A named aesthetic preset governing the palette, materials, and furniture
vocabulary a generated concept is rendered in (e.g. Scandinavian). Scandinavian
is the only Style today and the current default, but Style is meant to become
one of several a user picks per Task. Distinct from the architectural-fidelity
rules (keep windows, doors, walls, radiators where they are) — those are
universal and apply under _every_ Style, not part of any one Style.
_Avoid_: theme, template, look

**Style Direction**:
The user's free-text refinement layered on top of the chosen Style for one
generation — accent colours, a specific material, a mood. Narrows or seasons
the Style; it does not replace the Style's vocabulary and never overrides the
architectural-fidelity rules.
_Avoid_: style rules, override layer, prompt
