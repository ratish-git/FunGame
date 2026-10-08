-- ============================================================
--  Supabase schema for the Ratish & Sohani gender reveal page.
--  Run this in the Supabase dashboard: SQL Editor > New query.
-- ============================================================

-- 1) settings: single row holding the current answer ('boy' | 'girl')
create table if not exists public.settings (
  id      bigint primary key,
  answer  text not null default 'girl'
);

insert into public.settings (id, answer)
values (1, 'girl')
on conflict (id) do nothing;

-- 2) wishes: one row per guest wish
create table if not exists public.wishes (
  id         bigint generated always as identity primary key,
  name       text not null,
  message    text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
--  Row Level Security
--  This is a public party page using the anon key, so we allow
--  anonymous read/insert on wishes and read/update on settings.
--  (Light security — fine for a one-off celebration page.)
-- ============================================================
alter table public.settings enable row level security;
alter table public.wishes   enable row level security;

-- settings: anyone can read the answer; anyone can set it.
-- If you want to lock down who can change the answer, remove the
-- update/insert policies below and change it from the SQL editor instead.
create policy "settings read"   on public.settings for select using (true);
create policy "settings update" on public.settings for update using (true) with check (true);
create policy "settings insert" on public.settings for insert with check (true);

-- wishes: anyone can read and add a wish; no update/delete.
create policy "wishes read"   on public.wishes for select using (true);
create policy "wishes insert" on public.wishes for insert with check (true);
