-- Issue #520: event_sponsors contributions are invisible everywhere else in
-- the app (Finance > Donations, Inventory > Donations, the event's own
-- Donations tab) because they live only in this table. These three columns
-- let a sponsor row point at the real donations/inventory_items/
-- monetary_donations record it mirrors, kept in sync by the
-- create_event_sponsor/update_event_sponsor/delete_event_sponsor RPCs added
-- in 20260830180000. inventory_item_id is stored alongside donation_id (not
-- looked up via "the one item under this donation") so updates/deletes can
-- target the exact auto-created item without an assumption that a donation
-- never gains a second item some other way.
alter table public.event_sponsors
  add column donation_id uuid references public.donations(id) on delete set null,
  add column inventory_item_id uuid references public.inventory_items(id) on delete set null,
  add column monetary_donation_id uuid references public.monetary_donations(id) on delete set null;
