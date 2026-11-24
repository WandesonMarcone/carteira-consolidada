create table if not exists public.personal_valuations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ticker text not null check (ticker = upper(ticker) and ticker ~ '^[A-Z0-9._-]{1,16}$'),
  asset_type text not null,
  method text not null check (method in ('graham','income_ceiling')),
  ceiling_price numeric check (ceiling_price is null or ceiling_price >= 0),
  assumptions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, ticker, asset_type, method)
);

alter table public.personal_valuations enable row level security;

create policy "valuation owners select" on public.personal_valuations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "valuation owners insert" on public.personal_valuations
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "valuation owners update" on public.personal_valuations
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "valuation owners delete" on public.personal_valuations
  for delete to authenticated using ((select auth.uid()) = user_id);

create index if not exists transactions_position_id_idx on public.transactions(position_id);
create index if not exists personal_valuations_user_asset_idx on public.personal_valuations(user_id, ticker, asset_type);

grant select, insert, update, delete on public.personal_valuations to authenticated;
