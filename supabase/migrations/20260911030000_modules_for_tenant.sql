-- #903: the sessionless read of one tenant's module entitlements.
--
-- #900 subtracted disabled modules inside the three functions the portal
-- resolves access through, and most of the product followed for free. The
-- surfaces that did not are the ones that read something other than
-- my_permissions(), and the weekly ops report is the one of them that has no
-- session at all: ops-report-job.ts runs on the service-role client under a
-- cron route, reads its counts straight off the tables (its own comment
-- explains why -- the portal's count_pending_* RPCs answer for auth.uid()),
-- and would therefore keep telling a tenant with Finance off how many expense
-- approvals are waiting.
--
-- my_modules() (20260911000000) is the same answer for the caller's own
-- tenant, and cannot stand in: a job with no session has no
-- current_tenant_id(). So this is to my_modules() exactly what
-- people_with_permission() is to has_permission() -- the same question with
-- the tenant as a parameter, and therefore service_role only.
--
-- One call rather than a module_enabled_for_tenant() per module: the ops
-- report alone spans six of them, and the resolution rule stays in the one
-- place 20260910010000 put it rather than being re-implemented in TypeScript
-- over tenant_modules, plan_modules and modules.
create or replace function public.modules_for_tenant(p_tenant_id uuid)
returns table (module_key text, enabled boolean)
language sql
security definer
set search_path = public
stable
as $$
  select m.key, public.module_enabled_for_tenant(p_tenant_id, m.key)
  from public.modules m
  order by m.sort_order, m.key;
$$;

comment on function public.modules_for_tenant(uuid) is
  'One named tenant''s module entitlements, resolved the way module_enabled_for_tenant() resolves them (#903). Sessionless counterpart to my_modules(), for the jobs that run as service_role with no current_tenant_id().';

-- Takes an arbitrary tenant, so it is service_role only -- the same stance
-- module_enabled_for_tenant() and people_with_permission() take. A signed-in
-- caller asks about itself through my_modules().
revoke execute on function public.modules_for_tenant(uuid) from public, anon, authenticated;
grant execute on function public.modules_for_tenant(uuid) to service_role;
