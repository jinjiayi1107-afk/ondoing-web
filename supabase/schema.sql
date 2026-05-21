create extension if not exists pgcrypto;

create table if not exists public.tasks (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  project text not null default '',
  status text not null default '待启动' check (status in ('待启动', '进行中', '搁置', '已完成')),
  latest text not null default '',
  history text not null default '',
  owner text not null default '',
  created_date date not null default current_date,
  updated_at timestamptz
);

alter table public.tasks drop constraint if exists tasks_pkey;
alter table public.tasks add constraint tasks_pkey primary key (user_id, id);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  payment_date date not null default current_date,
  item text not null default '',
  amount numeric,
  currency text not null default 'USD',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

alter table public.tasks enable row level security;
alter table public.payments enable row level security;

drop policy if exists "tasks_select_own" on public.tasks;
drop policy if exists "tasks_insert_own" on public.tasks;
drop policy if exists "tasks_update_own" on public.tasks;
drop policy if exists "tasks_delete_own" on public.tasks;

create policy "tasks_select_own"
  on public.tasks for select
  using (auth.uid() = user_id);

create policy "tasks_insert_own"
  on public.tasks for insert
  with check (auth.uid() = user_id);

create policy "tasks_update_own"
  on public.tasks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "tasks_delete_own"
  on public.tasks for delete
  using (auth.uid() = user_id);

drop policy if exists "payments_select_own" on public.payments;
drop policy if exists "payments_insert_own" on public.payments;
drop policy if exists "payments_update_own" on public.payments;
drop policy if exists "payments_delete_own" on public.payments;

create policy "payments_select_own"
  on public.payments for select
  using (auth.uid() = user_id);

create policy "payments_insert_own"
  on public.payments for insert
  with check (auth.uid() = user_id);

create policy "payments_update_own"
  on public.payments for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "payments_delete_own"
  on public.payments for delete
  using (auth.uid() = user_id);

create index if not exists tasks_user_updated_idx on public.tasks(user_id, updated_at desc);
create index if not exists payments_user_date_idx on public.payments(user_id, payment_date desc);
