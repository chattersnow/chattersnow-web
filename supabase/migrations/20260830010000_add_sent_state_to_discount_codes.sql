-- Issue #74: #73 only tracked assigned/unassigned (registration_id +
-- assigned_at) -- there was no marker for "staff actually sent this code to
-- the registrant". sent_at adds that state.
--
-- sent_to_name/sent_to_email snapshot the registrant's identity at
-- mark-as-sent time. registration_id is `on delete set null`
-- (20260824200000), so if the registration is later cancelled (deleted) a
-- sent code's registration_id goes null same as an unsent one -- without a
-- snapshot that would make a sent code look unused again and eligible for
-- reassignment. The snapshot lets the UI keep showing a sent code as issued
-- regardless of what happens to the registration row afterward.
alter table public.discount_codes
  add column sent_at timestamptz,
  add column sent_to_name text,
  add column sent_to_email text;
