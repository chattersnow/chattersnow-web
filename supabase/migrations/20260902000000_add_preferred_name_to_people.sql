-- Portal display names are currently whatever the identity provider sent:
-- there is no profiles table and no trigger on auth.users anywhere in this
-- schema, so every consumer reads
-- coalesce(raw_user_meta_data ->> 'full_name', ->> 'name') on demand. A user
-- who signs in with Google is stuck with their Google account name in the
-- portal, with nowhere to change it.
--
-- preferred_name lives on people rather than a new auth-keyed profiles table
-- because every owner/assignee column in the portal already resolves to a
-- people row (see 20260830210000_link_event_lead_to_people.sql and the
-- calendar repoint in 20260902010000). Keeping it here means no picker needs
-- a join to render a name, and a directory-only person -- someone with no
-- portal login at all -- can carry a nickname too.
--
-- No index: the People search (people/page.tsx) already runs an unindexed
-- `or(name.ilike...)` scan, and this column joins that same predicate.

alter table public.people
  add column preferred_name text;

comment on column public.people.preferred_name is
  'Optional display name that overrides `name` everywhere a person is shown. Set by the person themselves (/portal/account) or by an admin (Administration -> Users). Display rule is coalesce(preferred_name, name, email).';
