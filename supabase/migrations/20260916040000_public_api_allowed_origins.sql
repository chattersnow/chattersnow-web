-- #813 Phase 3: which browser origins may post to a tenant's public API.
--
-- The versioned HTTP layer (`src/app/api/v1/...`) serves a tenant's public
-- content to consumers that are not this app on that tenant's domain. Reads
-- are public by definition -- the same rows the tenant's own website shows
-- anybody -- so they answer `Access-Control-Allow-Origin: *`. Writes are the
-- intake forms, and a form posted from an origin the organization has never
-- heard of is worth refusing.
--
-- `allowed_origins` is that list, per tenant, `service_role`-only like
-- `custom_domain` and `plan`: an operator sets it when a customer asks for an
-- embed, and no session can widen it.
--
-- **What this is and is not.** CORS is a rule a *browser* enforces on behalf
-- of the person using it; it is not an authentication mechanism and it stops
-- nothing that is not a browser. A `curl` post carries no `Origin` at all and
-- is refused by nothing here. What actually limits abuse of the intake RPCs is
-- `check_rate_limit()`, keyed on the caller's IP, which the handlers forward
-- exactly as the server actions do. The allow-list is worth having anyway,
-- because it is what stops somebody embedding a nonprofit's volunteer form on
-- a page the nonprofit has never seen and collecting real applications into
-- their real database under their real name.
--
-- The list is never served. `public_origin_allowed()` answers one boolean
-- about one origin, so a caller cannot enumerate a tenant's embeds -- which
-- would be a small map of that organization's partners, and nobody's business
-- but theirs. It resolves through `public_tenant_id()` like every other
-- anon-facing function, so the slug (#813 Phase 2) or the host decides whose
-- list is being asked about.
--
-- Matching is exact on the serialized origin (scheme, host and non-default
-- port), because that is the string a browser sends and the string a response
-- has to echo back. No wildcards and no subdomain rule: `https://example.org`
-- does not admit `https://shop.example.org`. A tenant that wants both lists
-- both, which is more typing and no surprises.

alter table public.tenants
  add column if not exists allowed_origins text[] not null default '{}';

comment on column public.tenants.allowed_origins is
  'Browser origins allowed to POST to this tenant''s public API (#813 Phase 3), each an exact serialized origin such as https://example.org. Empty means no embed may post; reads are public regardless. service_role only, like custom_domain -- read one at a time through public_origin_allowed(), never served as a list.';

create or replace function public.public_origin_allowed(p_origin text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.tenants t
    where t.id = public.public_tenant_id()
      and p_origin is not null
      and p_origin <> ''
      and p_origin = any (t.allowed_origins)
  );
$$;

comment on function public.public_origin_allowed(text) is
  'Whether this origin may post to the resolved tenant''s public API (#813 Phase 3). One boolean about one origin, deliberately: the allow-list is a map of an organization''s embeds and is never served.';

grant execute on function public.public_origin_allowed(text) to anon, authenticated, service_role;
