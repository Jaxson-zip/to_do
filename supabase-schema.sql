create table if not exists public.memo_lists (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  emoji text not null default '📋',
  archived boolean not null default false,
  deleted_at timestamptz,
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
  status text not null check (status in ('open', 'done', 'purged')),
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

create table if not exists public.bot_bindings (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('clawbot')),
  provider_user_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (provider, provider_user_id),
  unique (provider, user_id)
);

create table if not exists public.bot_binding_codes (
  code text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.bot_reminder_events (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.memo_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('clawbot')),
  provider_user_id text not null,
  reminder_at timestamptz not null,
  sent_at timestamptz,
  snoozed_until timestamptz,
  created_at timestamptz not null default now(),
  unique (item_id, provider, reminder_at)
);

alter table public.memo_items
add column if not exists list_id uuid;

alter table public.memo_items
add column if not exists reminder_at timestamptz;

alter table public.memo_items
add column if not exists repeat_rule text not null default 'none';

alter table public.memo_lists
add column if not exists deleted_at timestamptz;

alter table public.memo_items
drop constraint if exists memo_items_repeat_rule_check;

alter table public.memo_items
add constraint memo_items_repeat_rule_check check (repeat_rule in ('none', 'daily', 'weekly', 'monthly'));

alter table public.memo_items
drop constraint if exists memo_items_status_check;

alter table public.memo_items
add constraint memo_items_status_check check (status in ('open', 'done', 'purged'));

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

create index if not exists bot_bindings_provider_user_idx
on public.bot_bindings (provider, provider_user_id);

create index if not exists bot_binding_codes_user_idx
on public.bot_binding_codes (user_id, expires_at desc);

create index if not exists bot_reminder_events_due_idx
on public.bot_reminder_events (provider, sent_at, reminder_at);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.memo_items to authenticated;
grant select, insert, update, delete on public.memo_lists to authenticated;
grant select, insert, update, delete on public.bot_bindings to authenticated;
grant select, insert, update, delete on public.bot_binding_codes to authenticated;
grant select, insert, update, delete on public.bot_reminder_events to authenticated;
