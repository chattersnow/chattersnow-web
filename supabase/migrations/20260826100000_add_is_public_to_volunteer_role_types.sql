alter table public.volunteer_role_types
  add column is_public boolean not null default false;
