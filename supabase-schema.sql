create table if not exists public.memo_lists (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  emoji text not null default '📋',
  archived boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.memo_items (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  list_id uuid,
  title text not null,
  body text not null default '',
  kind text not null check (kind in ('task', 'note')),
  status text not null check (status in ('open', 'done')),
  priority text not null check (priority in ('low', 'normal', 'high')),
  repeat_rule text not null default 'none' check (repeat_rule in ('none', 'daily', 'weekly', 'monthly')),
  due_date date,
  reminder_at timestamptz,
  tags text[] not null default '{}',
  pinned boolean not null default false,
  archived boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

alter table public.memo_items
add column if not exists list_id uuid;

alter table public.memo_items
add column if not exists reminder_at timestamptz;

alter table public.memo_items
add column if not exists repeat_rule text not null default 'none';

alter table public.memo_items
drop constraint if exists memo_items_repeat_rule_check;

alter table public.memo_items
add constraint memo_items_repeat_rule_check check (repeat_rule in ('none', 'daily', 'weekly', 'monthly'));

alter table public.memo_items enable row level security;
alter table public.memo_lists enable row level security;

drop policy if exists "Users can read their own memo lists" on public.memo_lists;
create policy "Users can read their own memo lists"
on public.memo_lists for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own memo lists" on public.memo_lists;
create policy "Users can insert their own memo lists"
on public.memo_lists for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own memo lists" on public.memo_lists;
create policy "Users can update their own memo lists"
on public.memo_lists for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own memo lists" on public.memo_lists;
create policy "Users can delete their own memo lists"
on public.memo_lists for delete
using (auth.uid() = user_id);

drop policy if exists "Users can read their own memo items" on public.memo_items;
create policy "Users can read their own memo items"
on public.memo_items for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own memo items" on public.memo_items;
create policy "Users can insert their own memo items"
on public.memo_items for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own memo items" on public.memo_items;
create policy "Users can update their own memo items"
on public.memo_items for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own memo items" on public.memo_items;
create policy "Users can delete their own memo items"
on public.memo_items for delete
using (auth.uid() = user_id);

create index if not exists memo_items_user_updated_idx
on public.memo_items (user_id, updated_at desc);

create index if not exists memo_lists_user_updated_idx
on public.memo_lists (user_id, updated_at desc);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.memo_items to authenticated;
grant select, insert, update, delete on public.memo_lists to authenticated;
