-- #1512: a short column label per registration question.
--
-- The registrants list gives each question a column, and the only name a
-- question had was its prompt -- the tenant's own sentence ("Which
-- borough/city are you coming from/leaving from?"), which made the header
-- wrap or the table scroll sideways. `column_label` is the optional short
-- name staff give it for that list ("Borough"), at most 24 characters. Empty
-- means the list falls back to the prompt, truncated. A conditional
-- follow-up's label is the unit its answer is folded into the parent's cell
-- with ("Can drive · 2 seats").
--
-- Staff-only, like `shares_contact`: the public view and
-- my_registration_questions() do not select it, and RLS is unchanged.
-- save_event_registration_questions() is re-declared with the one new field;
-- `create or replace` keeps its grants.

alter table public.event_registration_questions
  add column column_label text
    check (column_label is null or (btrim(column_label) <> '' and char_length(column_label) <= 24));

comment on column public.event_registration_questions.column_label is
  'Optional short name for the question in the portal''s registrants list (#1512), at most 24 characters. Null falls back to the prompt. For a conditional follow-up, the unit its answer is shown with in the parent''s cell.';

create or replace function public.save_event_registration_questions(
  p_event_id uuid,
  p_questions jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_question jsonb;
  v_index integer := 0;
  v_id uuid;
  v_kind text;
  v_prompt text;
  v_help text;
  v_column_label text;
  v_required boolean;
  v_options jsonb;
  v_option jsonb;
  v_label text;
  v_min integer;
  v_max integer;
  v_shares boolean;
  v_show_if jsonb;
  v_parent jsonb;
  v_option_ids jsonb;
  v_seen jsonb := '{}'::jsonb;
  v_kept uuid[] := '{}';
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'Not authorized to edit events';
  end if;

  perform 1 from public.events
   where id = p_event_id and tenant_id = v_tenant_id
   for update;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if p_questions is null or jsonb_typeof(p_questions) <> 'array' then
    raise exception 'EVENT_QUESTIONS_INVALID';
  end if;

  if jsonb_array_length(p_questions) > 20 then
    raise exception 'EVENT_QUESTIONS_TOO_MANY';
  end if;

  for v_question in select value from jsonb_array_elements(p_questions) loop
    if jsonb_typeof(v_question) <> 'object'
       or coalesce(lower(v_question->>'id'), '') !~ v_uuid then
      raise exception 'EVENT_QUESTIONS_INVALID';
    end if;
    v_id := (v_question->>'id')::uuid;
    if v_id = any (v_kept) then
      raise exception 'EVENT_QUESTIONS_INVALID';
    end if;

    v_kind := v_question->>'kind';
    if v_kind is null or v_kind not in ('single_choice', 'multi_choice', 'short_text', 'number', 'consent') then
      raise exception 'EVENT_QUESTIONS_INVALID';
    end if;

    v_prompt := btrim(coalesce(v_question->>'prompt', ''));
    if v_prompt = '' then
      raise exception 'EVENT_QUESTIONS_PROMPT_REQUIRED';
    end if;
    if char_length(v_prompt) > 300 then
      raise exception 'EVENT_QUESTIONS_INVALID';
    end if;

    v_help := nullif(btrim(coalesce(v_question->>'help', '')), '');
    if char_length(v_help) > 500 then
      raise exception 'EVENT_QUESTIONS_INVALID';
    end if;

    -- #1512. Optional; a key the caller leaves out clears it, like help.
    v_column_label := nullif(btrim(coalesce(v_question->>'column_label', '')), '');
    if char_length(v_column_label) > 24 then
      raise exception 'EVENT_QUESTIONS_COLUMN_LABEL_TOO_LONG';
    end if;

    -- A consent box is declinable by definition, so it is never required:
    -- an unticked box is the answer "no".
    v_required := v_kind <> 'consent' and coalesce(v_question->'required' = 'true'::jsonb, false);
    v_shares := v_kind = 'consent' and coalesce(v_question->'shares_contact' = 'true'::jsonb, false);

    -- Options: the two choice kinds need at least two, distinct by label.
    v_options := '[]'::jsonb;
    if v_kind in ('single_choice', 'multi_choice') then
      if jsonb_typeof(v_question->'options') is distinct from 'array'
         or jsonb_array_length(v_question->'options') < 2
         or jsonb_array_length(v_question->'options') > 20 then
        raise exception 'EVENT_QUESTIONS_OPTIONS_INVALID';
      end if;
      for v_option in select value from jsonb_array_elements(v_question->'options') loop
        v_label := btrim(coalesce(v_option->>'label', ''));
        if jsonb_typeof(v_option) <> 'object'
           or coalesce(lower(v_option->>'id'), '') !~ v_uuid
           or v_label = '' or char_length(v_label) > 120 then
          raise exception 'EVENT_QUESTIONS_OPTIONS_INVALID';
        end if;
        v_options := v_options || jsonb_build_array(
          jsonb_build_object('id', lower(v_option->>'id'), 'label', v_label)
        );
      end loop;
      if (select count(distinct o->>'id') from jsonb_array_elements(v_options) o) <> jsonb_array_length(v_options)
         or (select count(distinct lower(o->>'label')) from jsonb_array_elements(v_options) o) <> jsonb_array_length(v_options) then
        raise exception 'EVENT_QUESTIONS_OPTIONS_INVALID';
      end if;
    end if;

    -- Bounds, for a number only.
    v_min := null;
    v_max := null;
    if v_kind = 'number' then
      if jsonb_typeof(v_question->'min_value') = 'number' then
        if (v_question->>'min_value')::numeric <> trunc((v_question->>'min_value')::numeric)
           or (v_question->>'min_value')::numeric not between -1000000 and 1000000 then
          raise exception 'EVENT_QUESTIONS_INVALID';
        end if;
        v_min := (v_question->>'min_value')::numeric::integer;
      elsif jsonb_typeof(v_question->'min_value') not in ('null') then
        raise exception 'EVENT_QUESTIONS_INVALID';
      end if;
      if jsonb_typeof(v_question->'max_value') = 'number' then
        if (v_question->>'max_value')::numeric <> trunc((v_question->>'max_value')::numeric)
           or (v_question->>'max_value')::numeric not between -1000000 and 1000000 then
          raise exception 'EVENT_QUESTIONS_INVALID';
        end if;
        v_max := (v_question->>'max_value')::numeric::integer;
      elsif jsonb_typeof(v_question->'max_value') not in ('null') then
        raise exception 'EVENT_QUESTIONS_INVALID';
      end if;
      if v_min is not null and v_max is not null and v_min > v_max then
        raise exception 'EVENT_QUESTIONS_INVALID';
      end if;
    end if;

    -- The condition: an EARLIER single-choice question of this save that is
    -- not conditional itself, and some of its options.
    v_show_if := null;
    if v_question->'show_if' is not null and jsonb_typeof(v_question->'show_if') <> 'null' then
      v_parent := v_seen -> lower(coalesce(v_question->'show_if'->>'question_id', ''));
      v_option_ids := v_question->'show_if'->'option_ids';
      if v_parent is null
         or v_parent->>'kind' <> 'single_choice'
         or (v_parent->>'conditional')::boolean
         or jsonb_typeof(v_option_ids) is distinct from 'array'
         or jsonb_array_length(v_option_ids) = 0
         or exists (
           select 1 from jsonb_array_elements(v_option_ids) i
            where jsonb_typeof(i) <> 'string'
               or not exists (
                 select 1 from jsonb_array_elements(v_parent->'options') o
                  where o->>'id' = lower(i #>> '{}')
               )
         ) then
        raise exception 'EVENT_QUESTIONS_CONDITION_INVALID';
      end if;
      v_show_if := jsonb_build_object(
        'question_id', lower(v_question->'show_if'->>'question_id'),
        'option_ids', (select jsonb_agg(distinct lower(i #>> '{}')) from jsonb_array_elements(v_option_ids) i)
      );
    end if;

    update public.event_registration_questions
       set kind = v_kind,
           prompt = v_prompt,
           help = v_help,
           column_label = v_column_label,
           required = v_required,
           sort_order = v_index,
           options = v_options,
           min_value = v_min,
           max_value = v_max,
           show_if = v_show_if,
           shares_contact = v_shares,
           archived_at = null,
           updated_at = now()
     where id = v_id
       and event_id = p_event_id
       and tenant_id = v_tenant_id;

    if not found then
      begin
        insert into public.event_registration_questions
          (id, tenant_id, event_id, kind, prompt, help, column_label, required, sort_order,
           options, min_value, max_value, show_if, shares_contact)
        values
          (v_id, v_tenant_id, p_event_id, v_kind, v_prompt, v_help, v_column_label, v_required, v_index,
           v_options, v_min, v_max, v_show_if, v_shares);
      exception when unique_violation then
        -- The id belongs to another event's question.
        raise exception 'EVENT_QUESTIONS_INVALID';
      end;
    end if;

    v_seen := v_seen || jsonb_build_object(v_id::text, jsonb_build_object(
      'kind', v_kind, 'options', v_options, 'conditional', v_show_if is not null
    ));
    v_kept := v_kept || v_id;
    v_index := v_index + 1;
  end loop;

  -- Left out: archived where somebody answered it, so the answers stay
  -- readable, and gone where nobody did.
  update public.event_registration_questions q
     set archived_at = now(), updated_at = now()
   where q.event_id = p_event_id
     and q.tenant_id = v_tenant_id
     and q.archived_at is null
     and not (q.id = any (v_kept))
     and exists (select 1 from public.event_registration_answers a where a.question_id = q.id);

  delete from public.event_registration_questions q
   where q.event_id = p_event_id
     and q.tenant_id = v_tenant_id
     and not (q.id = any (v_kept))
     and not exists (select 1 from public.event_registration_answers a where a.question_id = q.id);
end;
$$;

comment on function public.save_event_registration_questions(uuid, jsonb) is
  'Replaces an event''s registration questions (#1501) in one call, in display order. Ids are minted by the caller; an existing id is updated in place (and restored if archived). A current question left out is archived where it has answers and deleted where it has none. Requires events: manage. Raises EVENT_QUESTIONS_INVALID, EVENT_QUESTIONS_TOO_MANY (more than 20), EVENT_QUESTIONS_PROMPT_REQUIRED, EVENT_QUESTIONS_OPTIONS_INVALID, EVENT_QUESTIONS_CONDITION_INVALID or EVENT_QUESTIONS_COLUMN_LABEL_TOO_LONG (column_label over 24 characters, #1512).';

