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
The single image of a Furniture Item that generation sends to the model.
Chosen at import or upload time; a clean product cutout beats a lifestyle
scene.
_Avoid_: thumbnail, photo set

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
