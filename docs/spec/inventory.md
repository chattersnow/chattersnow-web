# Inventory and donations — specification

Part of [`docs/technical-spec.md`](../technical-spec.md) — section numbers are
unchanged. This file holds §5.4, §5.7, §5.13, §5.19 and the inventory/donations data model. Technology, system boundaries, security, the
route tree and the key workflows stay in the hub. A plain `§N` below is in this
file; a `§N` that lives in another file is always a link.

**Also relevant:** merchandise stock is `product_variants.stock_on_hand`, deliberately not `inventory_items` — see [§5.22](finance.md#522-sales-point-of-sale). Prize allocation reserves an inventory row and keeps it out of the public catalog — see [§5.8](giveaways.md#58-giveaways).

## 5.4 Inventory and donation management

### Receive a donation

Authorized users shall be able to:

1. Record the donation and donor information when required.
2. Record one or more donated inventory items.
3. Record each item's description, category, size, gender, condition, face value, photo, and status. The photo is **implemented** (issue #781): a per-item field on the items step takes a picture from the device it's being recorded on, compresses it in the browser (longest edge 1600px, JPEG q0.8, EXIF rotation applied) and uploads it to the `gear-photos` bucket as soon as it's chosen — not on save, since an intake volunteer holds `inventory_intake:manage` and nothing else and could not go back and repair a donation that saved without its photo. Pasting an external link still works, so existing Google Drive URLs are not a regression. The category comes from a controlled, admin-managed two-level vocabulary (`inventory_category_groups` -> `inventory_categories`, issue #667), picked from a grouped select rather than typed; choosing "Other" reveals a free-text detail field.
4. Create an inventory receipt transaction.

Source types should distinguish individual, brand, organization, event, and other sources.

### Update inventory

Authorized users shall be able to update item metadata and status, add photos, and create controlled stock adjustments. Adding a photo later uses the same field as intake, on the inventory item editor (issue #781). One photo per item, held as a full URL in `inventory_items.photo_url` — a `inventory_photos` table ([§6](../technical-spec.md#6-proposed-data-model)) is still unbuilt and is what a second photo would need. Inventory status should support at least available, distributed, damaged, lost, retired, and other organization-approved values.

Corrections must record a reason and actor. Quantity should not be changed through an untraceable direct overwrite when a transaction can express the change.

### Distribute or otherwise remove gear

Inventory changes shall be represented by a stock movement or distribution transaction with:

- Item and quantity
- Movement type: received, distributed, reserved, damaged, lost, retired, corrected, or other
- Date/time
- Reason or notes
- Optional event
- Optional recipient or recipient reference
- User who recorded the transaction

For distribution, the system records who received the gear (`inventory_movements.recipient_person_id`, a nullable FK to `people`), when, at which event (also optional), and who distributed it (`created_by`). Recipient data is protected by the same RLS as the rest of `people`/`inventory_movements` and is not exposed publicly.

Available quantity should be derived from valid inventory transactions, subject to an explicit policy for damaged, lost, and retired stock.

### Public gear availability

The public site shall let visitors browse a gallery of gear currently available (`status = available` and `intended_use = gear_library`), with filtering by category (grouped by category group), condition, and gender, and free-text search by description. The public read path must go through a dedicated, curated database view rather than a relaxed policy on the internal `inventory_items` table, so donor linkage, face value, notes, status, and movement history stay behind authenticated-only access regardless of how the public view's field list evolves.

### Public gear requests

From the gear library, selecting an available item opens its details in a side panel where a visitor may request it by submitting their name, email, and optional phone/notes. The request is handled by a `security definer` RPC that atomically re-checks availability, flips `inventory_items.status` to `reserved`, and records an `inventory_movements` row (`movement_type = reserved`, `recipient_person_id`, and the request's free text in `notes`) linking the requester into the `people` directory — the same pattern used for public event registration. The notes belong to the request, not to the requester: `people.notes` is a staff-maintained directory field, and writing per-request text there (as the RPC originally did) both overwrote staff notes on a returning requester and put the text beyond the reach of the gear retention clock, which anonymizes the movement. A reserved item drops out of the public gear catalog until a staff member releases it back to `available` through the existing inventory management flow.

## 5.7 Donations

The initial inventory workflow is the primary way administrators manage donated gear. Donation records should retain donor and donation context where needed, while inventory records retain the item-level details. Donor personal information must be restricted to authorized users with a legitimate operational need.

## 5.13 Open questions

- **Volunteer-facing donation/distribution recording**: recording a donation or distribution from an event should be quick and easy for a volunteer to reach in the field, not just from the main inventory workflow.
- **Quick edit from the events list**: editing a donation/distribution via the events list may only need to collect a number and notes tied to the event, rather than the full inventory workflow.
- ~~**Giveaway prizes drawn from in-kind donations**~~: **decided** (issues #520, #570) — a donated item used as a prize stays on the standard inventory path rather than getting a giveaway-specific one. The prize references the `inventory_items` row, and allocating it reserves the item and writes an `inventory_movements` row, so receipt, status and movement history all behave as they do for any other reservation. See [§5.8](giveaways.md#58-giveaways).

## 5.19 Inventory valuation reporting

Authorized users (`admin`, and `finance`/`board` for view-only oversight per [§5.3](access-control.md#53-authentication-and-authorization)) shall be able to view a valuation report over existing inventory data:

- Total face value of on-hand inventory, by category and status.
- Value donated and value distributed over a selected period, derived from `inventory_movements`.

This is a reporting view over `inventory_items` and `inventory_movements` — no new tables are required.

**Implemented.** `/portal/inventory/reports` computes on-hand face value by category/status and value donated/distributed over a selected period directly from `inventory_items.face_value` and `inventory_movements` (received/distributed movement types) — no new tables. Since issue #667 the category breakdown groups on the vocabulary rather than on the raw free-text string, and leads with a category-group roll-up, so one real category can no longer appear as several rows.

## 6. Data model — Inventory and donations

- `people`: shared directory of donors, sponsors, volunteers, staff, and partners (name, email, phone, notes), so the same contact can be reused across roles instead of being duplicated per context. It carries **no role columns**: role membership is derived by `public.people_with_roles` ([§5.9](people.md#59-people-directory)), the view every read site uses, from the records that create each role unioned with `person_role_tags`. A role is therefore never stale — it appears with the record behind it and goes away with the last one. What the six roles are _called_ is tenant data (`people.role_labels`, #911; [§5.9](people.md#59-people-directory)) — the keys here are not. `person_type` (`individual` | `organization`, issue #625) is the separate, exclusive axis: it is staff-asserted rather than derived and decides the shape of the record — an organization has a logo, a website, a primary contact and org memberships, an individual has a rider profile — so the person form renders one branch or the other off it. A further type (`household`, for family registrations) is a check-constraint change rather than another boolean.
- `donations`
- `donation_items`
- `inventory_items`: donation-managed inventory records with description, `category_id` (FK to `inventory_categories`, `on delete restrict`; nullable, where null means a legacy row nothing matched), size, gender, condition, face value, photo, status, and `intended_use` — what the item is _for_ (`gear_library`, `giveaway`, `internal`), as distinct from where it is in its lifecycle (`status`)
- `inventory_movements`: receipt, distribution, adjustment, and retirement transactions
- `person_role_tags`: manual role assertions (`person_id`, `role`, `granted_at`, `granted_by`, `notes`) — the half of the derived role model no source record backs, such as a sponsor entered in the directory before any event link exists. Unlike a boolean it carries when the role was asserted and by whom
- `people_with_roles`: `security_invoker` view over `people` adding the six derived role flags via the `security definer` helper `person_role_flags()` ([§5.9](people.md#59-people-directory)); granted to `authenticated` only, and read-only — writes go to `people`. The flags are named for the platform's vocabulary; what a tenant calls each role is `people.role_labels` (#911) and never reaches this shape
- `public_gear_catalog`: read-only view over `inventory_items` limited to `status = available` **and** `intended_use = gear_library` rows and a curated column set (description, size, type, gender, condition, photo, plus the item's category/group keys, labels and sort orders); granted to the `anon` role so it can back the public gear gallery without relaxing RLS on the base table. The category labels are denormalized into the view on purpose, so `anon` needs no access to the vocabulary tables themselves
- `inventory_category_groups` / `inventory_categories`: the two-level controlled item-category vocabulary (issue #667) — `key` (stable machine token, never changed by a rename), `label`, `sort_order`, `is_active`. Readable by any signed-in user (an intake volunteer holds `inventory_intake:manage` but `inventory:none`, and still has to render the picker); editable with `inventory:manage` at `/portal/inventory/categories`; both registered in `audited_tables`. `resolve_inventory_category(text)` maps free text to a category by key, label or a known alias, and backs both the one-time backfill and a `before insert` trigger on `inventory_items` that classifies rows written by callers that still supply only `type`
- `inventory_items_with_category`: `security_invoker` view over `inventory_items` left-joined to the vocabulary, adding `category_key`/`category_label`/`category_group_key`/`category_group_label` and a `category_sort_key`. It exists because the items list is server-sorted by category and PostgREST cannot order a row by an embedded resource's column
- `inventory_photos`
- `distribution_recipients`: protected recipient records, if needed
