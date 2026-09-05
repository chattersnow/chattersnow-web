-- Issue #602, part 6 of 6: schedule the jobs.
--
-- pg_cron rather than a Vercel cron route. #585 splits the app into two Vercel
-- projects that share this repo and therefore share vercel.json, so a `crons`
-- entry there would be read by both projects and the purge would run twice
-- against one database; the Hobby plan also caps cron at once per day with up to
-- 59 minutes of drift. Scheduling in Postgres sidesteps the split entirely,
-- needs no CRON_SECRET, and puts no new copy of the service-role key anywhere.
-- pg_cron is available on the Supabase free plan.
--
-- pg_cron runs jobs as `postgres`, which owns run_retention_purge, so the
-- ungranted function is callable from the job with no additional grant.
--
-- Schedules are UTC. 15 8 * * * is ~03:15 US Eastern -- off-peak, and after the
-- nightly E2E run at 09:00 UTC has finished with the database.
--
-- No migration in this repo has created an extension before, so both halves are
-- wrapped. CI runs `supabase db reset` on a throwaway stack
-- (.github/workflows/ci.yml) and the integration tests call the functions
-- directly; if pg_cron is unavailable there the migration degrades to
-- "functions exist, nothing scheduled", which is exactly the state those tests
-- want. If `create extension` is refused on the linked project, enabling
-- pg_cron once from the Supabase dashboard and re-running this migration is the
-- fallback -- the guard below makes that a clean no-op-then-schedule.
do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice
    'pg_cron unavailable (%). Retention jobs not scheduled; run_retention_purge() is still callable from Administration > Data Retention.',
    sqlerrm;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Unschedule first so this migration is re-runnable.
    perform cron.unschedule(jobname)
       from cron.job
      where jobname in ('retention-purge-nightly', 'rate-limit-hits-ttl-hourly');

    -- p_dry_run => false looks alarming and is not: every policy ships with
    -- mode = 'dry_run' (20260905090000), and a rule acts only when BOTH are
    -- satisfied. So from the first night the job runs, writes a full run log
    -- with real per-table counts, and changes nothing -- until somebody reviews
    -- those counts and flips a policy to 'enforce'. That is the whole rollout
    -- plan, and it is why this can land on a database that is also production.
    perform cron.schedule(
      'retention-purge-nightly', '15 8 * * *',
      $job$select public.run_retention_purge(p_dry_run => false, p_trigger => 'cron')$job$
    );

    -- Hourly and separate: rate_limit_hits is high-churn, the sweep is cheap,
    -- and it must not wait on the nightly job's advisory lock.
    perform cron.schedule(
      'rate-limit-hits-ttl-hourly', '5 * * * *',
      $job$select public.purge_rate_limit_hits()$job$
    );
  end if;
end $$;
