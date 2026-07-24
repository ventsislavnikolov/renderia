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
subject — a room for an Interior Task, the facade/garden for an Exterior Task.
The whole set describes that same subject from different angles. (The name is
room-biased for historical reasons; it covers exteriors too.)
_Avoid_: gallery, album

**Appearance**:
One detected structural element located by a box within a single Photo — a
window, door, or radiator on an Interior Task; a roof, gutter, render panel, or
fence on an Exterior Task. The same real element seen from two angles is two
Appearances.
_Avoid_: detection, box

**Room Object**:
One real structural element of the subject (room or exterior), grouping the
Appearances of it across Photos. Carries a preservation choice — keep it exactly, keep its type but
allow a restyle, or remove it entirely. Removal is the structural disposition a
Restructure Suggestion uses; an in-place change (widen a doorway, move a wall)
is expressed as removal of the old Room Object plus a Structural Addition for
the new one, never as an "edit in place".
_Avoid_: element, feature

**Structural Preview**:
An empty-subject confirmation image generated for one Photo's angle — the room
with furniture stripped out (or, for an Exterior Task, the facade with movable
clutter like cars and bins stripped) and Room Objects kept. One per Photo. The
user's
informal word for this is "layout".
_Avoid_: layout (informal), render, mockup

**Reference Photo**:
The single Photo angle a Structural Preview is seeded from — the "POV". No
longer the generation source: the final design is generated per-angle (see
below), against every approved Structural Preview. Also the anchor angle a
Restructure Suggestion is realized on first; the remaining angles condition on
that result so a structural change stays coherent across the Room Set.
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

**Concept**:
One named design direction for a Task, realized across every angle of its Room
Set — the set of per-angle generated images produced from a single brief,
presented, compared, and favorited as one unit. A generation run produces two
Concepts (an adaptive contrast pair derived from the Direction). A Concept
records the Direction it was generated from; regenerating creates new Concepts
and keeps the old ones in history. Until anchor-conditioned coherence is
validated, a Concept groups the angles of one direction without guaranteeing
that furnishings match exactly between angles.
_Avoid_: take (folded into Concept), variation, design option, render (one
Concept spans several renders)

**Concept Pack**:
The export a Task produces once a Concept is chosen — the decision document a
renovator hands to a contractor or partner. Leads with the visual story: the
chosen direction, before/after per angle, then what stays and what changes, the
product list with prices (owned Furniture Items at zero) compared against the
budget, assumptions and unknown measurements, questions for the contractor, and
the concept-only disclaimer. Delivered as a read-only share link with a PDF
download; prices are import-time snapshots from the Furniture Library.
_Avoid_: export (the act, not the artifact), report, moodboard, summary

**Fidelity Check**:
The automatic verification that a generated angle still honors its source
Photo's architecture: detection runs on the render and the result is compared
against the keep-exactly Room Objects' boxes. A missing element, an invented
opening, or an element drifted beyond threshold flags the angle with a "check
this area" badge over the suspect zone — a prompt to look, never a claim of
correctness, and never a gate on choosing a Concept. A confirmed flag entitles
a free regeneration of that angle (capped).
_Avoid_: validation (implies a guarantee), QA, accuracy score

**Refinement**:
A natural-language instruction applied to an existing Concept ("keep
everything, but change the floor"), producing a new Concept derived from it —
the anchor angle regenerates from the current render plus the instruction, and
the remaining angles condition on the new anchor. The refined Concept records
its parent, so a Task's history reads as an evolution of directions. Distinct
from reporting a problem: a structured defect report (moved window/door/
radiator, wrong scale, missing must-include furniture, mismatched angles,
off-style) that can trigger a free regeneration instead of minting a new
deliberate direction.
_Avoid_: edit (nothing is edited in place), retry, tweak

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

**Direction**:
The design-input step of the guided flow and the bundle of choices it captures
for one generation: the Style, the free-text Style Direction, the change
intensity (refresh / makeover / full renovation), Furniture Item picks with
their roles (must include / if it fits; owned / to buy), and an optional budget
range. Ends with a structured summary of what will be generated. A Concept
snapshots the Direction it was generated from.
_Avoid_: brief (the assembled generation artifact, not the user's choices),
preferences, settings

**Exterior Task**:
A Task whose subject is the outside of a property — facade, roof, garden,
drive — rather than a room. Distinguished from an Interior Task by the Task's
category. Shares the Room Set / Appearance / Room Object pipeline, but its
detected element vocabulary is exterior (roof, gutter, render, fence, door)
and its fidelity rules are exterior-specific. The same property's inside and
outside are separate Tasks under one Project.
_Avoid_: outside photo, landscape, scene

**Restructure Suggestion**:
A proposed _structural_ change to a Task — moving or removing a wall, adding a
window or dormer, opening a doorway — paired with a generated render showing
the change applied. Unlike a Style (cosmetic) or a Room Object's preservation
choice (keep or restyle an element where it is), it changes the architecture
itself. It does not discard the architectural-fidelity rules so much as
_re-anchor_ them: applying one mints a new structural base (a restructured
Structural Preview), and the normal preserve-and-style layer then runs
faithfully against that new base. Decomposes into two primitives only: removing
a Room Object (its `remove` disposition) and adding a Structural Addition.
Applies to both Interior and Exterior Tasks.
_Avoid_: restruction (informal), remodel, Style, override

**Structural Addition**:
A new structural element a Restructure Suggestion introduces where none existed
— a window, dormer, doorway, or wall. The add half of the remove/add primitive
pair; the counterpart to a Room Object's `remove` disposition. Carries the new
element's type and placement, attached to the restructured base rather than to
any existing Appearance.
_Avoid_: new object, inserted element, Room Object (an Addition has no source
Appearance)
