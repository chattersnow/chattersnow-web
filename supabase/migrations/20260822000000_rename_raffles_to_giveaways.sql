-- Rename the raffle feature to "giveaway" throughout the schema. Forward-only
-- rename on top of 20260821040000_create_raffles.sql and
-- 20260821090000_role_scoped_rls_events.sql, which stay as-is since they are
-- already applied to production. No data is dropped or recreated.

alter table public.raffles rename to giveaways;
alter table public.raffle_prizes rename to giveaway_prizes;
alter table public.giveaway_prizes rename column raffle_id to giveaway_id;
alter table public.raffle_winners rename to giveaway_winners;
alter table public.giveaway_winners rename column raffle_prize_id to giveaway_prize_id;

alter table public.giveaways rename constraint raffles_one_per_event to giveaways_one_per_event;
alter table public.giveaway_winners rename constraint raffle_winners_one_per_prize to giveaway_winners_one_per_prize;

alter policy "raffles select" on public.giveaways rename to "giveaways select";
alter policy "raffles insert" on public.giveaways rename to "giveaways insert";
alter policy "raffles update" on public.giveaways rename to "giveaways update";
alter policy "raffles delete" on public.giveaways rename to "giveaways delete";

alter policy "raffle_prizes select" on public.giveaway_prizes rename to "giveaway_prizes select";
alter policy "raffle_prizes insert" on public.giveaway_prizes rename to "giveaway_prizes insert";
alter policy "raffle_prizes update" on public.giveaway_prizes rename to "giveaway_prizes update";
alter policy "raffle_prizes delete" on public.giveaway_prizes rename to "giveaway_prizes delete";

alter policy "raffle_winners select" on public.giveaway_winners rename to "giveaway_winners select";
alter policy "raffle_winners insert" on public.giveaway_winners rename to "giveaway_winners insert";
alter policy "raffle_winners update" on public.giveaway_winners rename to "giveaway_winners update";
alter policy "raffle_winners delete" on public.giveaway_winners rename to "giveaway_winners delete";

update public.roles
set description = 'Manages events end-to-end: details, sponsors, giveaway, attendance, event expenses'
where name = 'event_coordinator';
