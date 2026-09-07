-- Issue #667, follow-up. 20260904150000 seeded resolve_inventory_category()'s
-- alias list from the spellings visible in supabase/seed.sql, because the
-- worktree cannot read production. Auditing production after that migration
-- landed left 16 of 56 items uncategorized, all of them garments the list
-- simply did not spell out:
--
--   Snowbib (4), bottom thermal (2), hoodie (2), thermal top (2),
--   crew sweater, Crew Sweater Puffer, hooded jacket, long sleeve tee,
--   puffer, thermal set (1 each)
--
-- Matching is deliberately exact-after-normalization rather than substring
-- (so 'ski' cannot swallow 'ski boots'), which is why "thermal top" missed
-- despite 'thermal' being an alias. Each of these therefore needs naming.
--
-- "Crew Sweater Puffer" is the one genuine judgement call: it reads as a
-- puffer jacket styled like a crew sweater, and bare "puffer" already maps to
-- jacket, so it goes there for consistency. Like every other row here it stays
-- editable, and inventory_items.type keeps the original wording either way.
--
-- Safe to re-run and safe to follow with more of the same: the backfill at the
-- bottom only touches rows that are still uncategorized, and no existing
-- classification is revisited.

create or replace function public.resolve_inventory_category(p_text text)
returns uuid
language sql
stable
set search_path = public
as $$
  with term as (
    select nullif(lower(btrim(coalesce(p_text, ''))), '') as value
  ),
  alias as (
    select * from (values
      ('snow board', 'snowboard'), ('board', 'snowboard'), ('snowboards', 'snowboard'),
      ('split board', 'splitboard'),
      ('ski', 'skis'), ('skies', 'skis'),
      ('ski poles', 'poles'), ('pole', 'poles'),
      ('binding', 'bindings'),
      -- Outerwear. 'puffer'/'puffy' and the hooded/sweater-styled variants of
      -- it are jackets, not mid layers -- they are the outer shell in practice.
      ('coat', 'jacket'), ('jackets', 'jacket'), ('winter jacket', 'jacket'),
      ('insulated jacket', 'jacket'), ('parka', 'jacket'),
      ('hooded jacket', 'jacket'), ('puffer', 'jacket'), ('puffy', 'jacket'),
      ('puffer jacket', 'jacket'), ('crew sweater puffer', 'jacket'),
      ('pant', 'pants'), ('snow pants', 'pants'), ('snowpants', 'pants'),
      ('ski pants', 'pants'), ('bib', 'pants'), ('bibs', 'pants'),
      ('snowbib', 'pants'), ('snowbibs', 'pants'), ('snow bib', 'pants'),
      ('snow bibs', 'pants'), ('overalls', 'pants'),
      ('snow suit', 'snowsuit'), ('one piece', 'snowsuit'),
      ('shell jacket', 'shell'),
      -- Layers. "thermal set", "thermal top" and "bottom thermal" are all the
      -- same garment family; the vocabulary does not split thermals by half.
      ('baselayer', 'base_layer'), ('long johns', 'base_layer'),
      ('long underwear', 'base_layer'), ('long sleeve tee', 'base_layer'),
      ('long sleeve shirt', 'base_layer'),
      ('fleece', 'mid_layer'), ('pullover', 'mid_layer'), ('midlayer', 'mid_layer'),
      ('mid layer', 'mid_layer'), ('sweater', 'mid_layer'),
      ('hoodie', 'mid_layer'), ('hoody', 'mid_layer'), ('sweatshirt', 'mid_layer'),
      ('crew sweater', 'mid_layer'), ('crewneck', 'mid_layer'),
      ('thermal', 'thermals'), ('thermal top', 'thermals'),
      ('thermal bottom', 'thermals'), ('bottom thermal', 'thermals'),
      ('top thermal', 'thermals'), ('thermal set', 'thermals'),
      ('thermal bottoms', 'thermals'), ('thermal tops', 'thermals'),
      ('boot', 'boots'), ('snowboots', 'boots'), ('snow boots', 'boots'),
      ('winter boots', 'boots'), ('snowboard boots', 'boots'),
      ('snowboard boot', 'boots'), ('ski boots', 'boots'), ('ski boot', 'boots'),
      ('helmets', 'helmet'),
      ('pack', 'backpack'), ('daypack', 'backpack'), ('bag', 'backpack'),
      ('gift card', 'voucher'), ('giftcard', 'voucher'), ('vouchers', 'voucher'),
      ('lift pass', 'lift_ticket'), ('day pass', 'lift_ticket'),
      ('rentals', 'rental'),
      ('wrist guard', 'wrist_guards'),
      ('pad', 'pads'), ('knee pads', 'pads'),
      ('beanies', 'beanie'), ('hat', 'beanie'), ('toque', 'beanie'),
      ('glove', 'gloves'), ('mitten', 'gloves'), ('mittens', 'gloves'),
      ('mitts', 'gloves'),
      ('goggle', 'goggles'),
      ('gaiter', 'neck_gaiter'), ('neck warmer', 'neck_gaiter'),
      ('buff', 'neck_gaiter'), ('scarf', 'neck_gaiter'),
      ('balaclava', 'neck_gaiter'),
      ('sock', 'socks'),
      ('accessory', 'other'), ('accessories', 'other'), ('misc', 'other'),
      ('gear', 'other')
    ) as a(term, category_key)
  )
  select c.id
  from public.inventory_categories c
  where c.is_active
    and (
      c.key = (select value from term)
      or lower(c.label) = (select value from term)
      or c.key = (
        select a.category_key from alias a where a.term = (select value from term)
      )
    )
  limit 1;
$$;

-- Only the rows nobody has classified yet. An item that already carries a
-- category -- whether from the first backfill or from a staffer -- is left
-- exactly as it is.
update public.inventory_items
set category_id = public.resolve_inventory_category(type)
where category_id is null;
