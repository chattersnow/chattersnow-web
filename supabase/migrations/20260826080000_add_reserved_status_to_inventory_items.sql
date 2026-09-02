-- Adds a "reserved" status so the public gear library can put an item on
-- hold when someone requests it (issue #170), without inventing a new
-- vocabulary: inventory_movements.movement_type already has an unused
-- 'reserved' value (20260819000000) for exactly this purpose.
alter table public.inventory_items drop constraint inventory_items_status_check;
alter table public.inventory_items add constraint inventory_items_status_check
  check (status in ('available', 'reserved', 'distributed', 'damaged', 'lost', 'retired', 'other'));
