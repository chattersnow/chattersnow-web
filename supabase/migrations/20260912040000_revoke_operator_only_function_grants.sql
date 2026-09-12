-- Operator-only functions are executable by `authenticated` on the hosted
-- database. This closes that.
--
-- Every one of these functions was locked down with `revoke execute ... from
-- public` and either granted to `service_role` alone or to nobody. That is
-- enough locally, and it is not enough on the hosted project: that database
-- carries default privileges granting EXECUTE on each newly created function
-- in `public` to `anon` and `authenticated`, so a fresh function arrives with
-- a *direct* grant to both roles and revoking PUBLIC leaves it untouched.
--
-- It surfaced when #895's own privilege guard -- `has_function_privilege(
-- 'authenticated', 'public.copy_content_pack(uuid, uuid)', 'EXECUTE')` --
-- failed against the hosted database while passing in CI, where those default
-- privileges are not configured. The same reasoning applies to every function
-- written the same way before it, and two of them are serious:
-- `export_tenant_data()` returns every row of any tenant, donations and people
-- included, and `delete_tenant()` erases one. Both are `security definer` with
-- no check on the caller, because the grant was the check.
--
-- The fix is one revoke per function rather than a blanket revoke over the
-- schema, which would strip the many functions the portal calls by design.
-- New functions that are not for signed-in callers must name `anon` and
-- `authenticated` in their revoke from now on; the guard at the bottom is here
-- so this set cannot silently regress.

revoke execute on function public.tenant_data_snapshot(uuid) from anon, authenticated;
revoke execute on function public.export_tenant_data(uuid) from anon, authenticated;
revoke execute on function public.delete_tenant(uuid) from anon, authenticated;
revoke execute on function public.seed_demo_tenant(uuid, uuid, uuid) from anon, authenticated;
revoke execute on function public.reserve_inventory_item_for_giveaway(uuid, uuid) from anon, authenticated;
revoke execute on function public.release_inventory_item_from_giveaway(uuid, uuid) from anon, authenticated;

do $$
declare
  v_signature text;
  v_exposed text[] := '{}';
  v_signatures text[] := array[
    'public.tenant_data_snapshot(uuid)',
    'public.export_tenant_data(uuid)',
    'public.delete_tenant(uuid)',
    'public.seed_demo_tenant(uuid, uuid, uuid)',
    'public.reserve_inventory_item_for_giveaway(uuid, uuid)',
    'public.release_inventory_item_from_giveaway(uuid, uuid)',
    'public.copy_content_pack(uuid, uuid)',
    'public.provision_tenant(text, text, text, text, text, uuid, text[])'
  ];
begin
  foreach v_signature in array v_signatures loop
    if has_function_privilege('authenticated', v_signature, 'EXECUTE')
      or has_function_privilege('anon', v_signature, 'EXECUTE') then
      v_exposed := v_exposed || v_signature;
    end if;
  end loop;

  if array_length(v_exposed, 1) is not null then
    raise exception 'operator-only functions are executable by signed-in callers: %',
      array_to_string(v_exposed, ', ');
  end if;
end $$;
