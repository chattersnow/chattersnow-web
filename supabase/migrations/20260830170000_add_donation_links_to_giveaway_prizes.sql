-- Issue #520: giveaway_prizes only had donor_person_id (added in #20), which
-- attributes a prize to a person but not to the donation record it actually
-- came from. Add a reference that works for either donation shape in the
-- app -- an in-kind inventory_items row or a monetary_donations row (a
-- sponsor's contribution is now one of these two, per
-- 20260830160000/20260830180000, so no separate "sponsor" source is needed
-- here). on delete set null (not cascade): if the source donation is later
-- deleted, the prize and any recorded winner survive, just losing the link.
alter table public.giveaway_prizes
  add column source_inventory_item_id uuid references public.inventory_items(id) on delete set null,
  add column source_monetary_donation_id uuid references public.monetary_donations(id) on delete set null,
  add constraint giveaway_prizes_single_source
    check (source_inventory_item_id is null or source_monetary_donation_id is null);
