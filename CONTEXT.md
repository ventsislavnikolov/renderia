# Renderia

AI-assisted interior renovation workspace: users photograph rooms, review and
preserve what matters, and generate restyled concept images per renovation
task.

## Language

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
Historically, the single Photo angle the final design was generated from — the
"POV". Superseded as the generation source by the Room Composite; still used to
seed which angle a Structural Preview previews.
_Avoid_: POV, main photo

**Room Composite**:
A single wide (3:2) empty-room view synthesised from every approved Structural
Preview, covering only the arc the Photos actually captured. Replaces the
single Reference Photo as the source the final design is generated against, so
the design reflects the whole captured room rather than one angle. Not a literal
wrap-around despite the user's informal terms. Code, types, and tables use
"Room Composite"; the user-facing label is "360 view".
_Avoid_: 360 layout (informal), panorama (informal — implies full wrap)
