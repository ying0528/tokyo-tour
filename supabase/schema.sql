-- =====================================================================
-- 家庭旅行 APP 資料庫結構（Supabase / PostgreSQL）
-- 使用方式：Supabase 後台 → SQL Editor → 貼上整份 → Run
-- 這份檔案可以重複執行（之後更新版本時，再貼一次新的即可）
-- =====================================================================

-- ---------- 共用：版本號與更新時間 ----------
create sequence if not exists public.row_rev_seq;
grant usage on sequence public.row_rev_seq to authenticated;

-- 每次新增或修改都自動更新 updated_at / rev / updated_by
create or replace function public.tg_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  new.rev := nextval('public.row_rev_seq');
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, clock_timestamp());
  else
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

-- 資料不能被搬到別的旅行
create or replace function public.tg_lock_trip() returns trigger
language plpgsql as $$
begin
  if new.trip_id is distinct from old.trip_id then
    raise exception '不能變更資料所屬的旅行';
  end if;
  return new;
end $$;

-- 安全地把文字轉成 uuid（失敗回傳 null）
create or replace function public.try_uuid(p text) returns uuid
language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

-- ---------- 旅行 ----------
create table if not exists public.trips (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '',
  destination text not null default '',
  start_date date not null,
  end_date date not null,
  timezone text not null default 'Asia/Tokyo',
  cover_path text,
  notes text not null default '',
  settings jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  rev bigint not null default 0,
  constraint trips_dates_ok check (end_date >= start_date and end_date - start_date <= 90)
);

-- ---------- 成員（誰可以用這趟旅行）----------
create table if not exists public.trip_members (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','editor','viewer')),
  traveler_id uuid,
  see_all_groups boolean not null default false,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

-- ---------- 權限判斷 ----------
create or replace function public.trip_role(p_trip uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.trip_members where trip_id = p_trip and user_id = auth.uid()
$$;

create or replace function public.is_member(p_trip uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.trip_members where trip_id = p_trip and user_id = auth.uid())
$$;

create or replace function public.can_edit(p_trip uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.trip_members
                 where trip_id = p_trip and user_id = auth.uid() and role in ('owner','editor'))
$$;

create or replace function public.is_anonymous() returns boolean
language sql stable as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;

-- ---------- 邀請連結 ----------
create table if not exists public.trip_invites (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  token text not null unique default (replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')),
  role text not null default 'viewer' check (role in ('editor','viewer')),
  see_all_groups boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- ---------- 同行者 ----------
create table if not exists public.travelers (
  id uuid primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  name text not null default '',
  color text not null default '',
  sort_order double precision not null default 0,
  notes text not null default '',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  rev bigint not null default 0,
  unique (id, trip_id)
);

-- ---------- 景點／餐廳／住宿 ----------
create table if not exists public.places (
  id uuid primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  name text not null default '',
  kind text not null default 'sight',
  address text not null default '',
  map_url text not null default '',
  description text not null default '',
  notes text not null default '',
  image_path text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  rev bigint not null default 0,
  unique (id, trip_id)
);

-- ---------- 行程 ----------
create table if not exists public.activities (
  id uuid primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  date date not null,
  start_time time,
  duration_min integer check (duration_min is null or duration_min >= 0),
  kind text not null default 'sight',
  place_id uuid,
  title text not null default '',
  from_name text not null default '',
  to_name text not null default '',
  cost numeric(12,2),
  currency text not null default '',
  notes text not null default '',
  audience_groups text[] not null default '{}',
  audience_travelers uuid[] not null default '{}',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  rev bigint not null default 0,
  unique (id, trip_id),
  foreign key (place_id, trip_id) references public.places(id, trip_id) on delete set null (place_id)
);

-- ---------- 移動步驟 ----------
create table if not exists public.route_steps (
  id uuid primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  activity_id uuid not null,
  sort_order double precision not null default 0,
  mode text not null default 'subway' check (mode in ('subway','bus','walk','uber','taxi','train','other')),
  line text not null default '',
  direction text not null default '',
  from_stop text not null default '',
  to_stop text not null default '',
  exit_info text not null default '',
  transfer_info text not null default '',
  depart_time time,
  duration_min integer,
  cost numeric(12,2),
  notes text not null default '',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  rev bigint not null default 0,
  foreign key (activity_id, trip_id) references public.activities(id, trip_id) on delete cascade
);

-- ---------- 電子票券 ----------
create table if not exists public.tickets (
  id uuid primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  title text not null default '',
  kind text not null default '',
  file_path text,
  file_type text check (file_type is null or file_type in ('image','pdf')),
  file_size integer,
  traveler_ids uuid[] not null default '{}',
  activity_ids uuid[] not null default '{}',
  sort_order double precision not null default 0,
  notes text not null default '',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  rev bigint not null default 0
);

-- ---------- 每日設定（全員／分組）----------
create table if not exists public.day_plans (
  id uuid primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  date date not null,
  mode text not null default 'together' check (mode in ('together','split')),
  groups text[] not null default '{A,B}',
  assignments jsonb not null default '{}'::jsonb,
  notes text not null default '',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  rev bigint not null default 0,
  unique (trip_id, date)
);

-- ---------- 第二版補充（可重複執行）----------
-- 類型：必去景點、好吃的、買買買、廁所、住宿、移動、其他
alter table public.places drop constraint if exists places_kind_check;
alter table public.places add constraint places_kind_check
  check (kind in ('sight','food','shop','toilet','lodging','other'));
alter table public.activities drop constraint if exists activities_kind_check;
alter table public.activities add constraint activities_kind_check
  check (kind in ('sight','food','shop','toilet','lodging','move','other'));
-- 每天的主題（例如「澀谷・原宿」）與組別名稱（例如 {"A":"逛街組","B":"廁所組"}）
alter table public.day_plans add column if not exists title text not null default '';
alter table public.day_plans add column if not exists group_names jsonb not null default '{}'::jsonb;

-- 第三版：行程的地圖連結與其他連結（[{"label":"官網","url":"https://…"}]）
alter table public.activities add column if not exists map_url text not null default '';
alter table public.activities add column if not exists links jsonb not null default '[]'::jsonb;
-- 第四版：行程的補充圖片（[{"id":"…","path":"旅行id/檔名"}]）
alter table public.activities add column if not exists images jsonb not null default '[]'::jsonb;
-- 第四版：沒填時間的行程排在哪個行程後面
alter table public.activities add column if not exists after_activity_id uuid;

-- ---------- 個人狀態（可選的「已完成」）----------
create table if not exists public.personal_status (
  id uuid primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  activity_id uuid not null,
  traveler_id uuid not null,
  done boolean not null default false,
  note text not null default '',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  rev bigint not null default 0,
  foreign key (activity_id, trip_id) references public.activities(id, trip_id) on delete cascade,
  foreign key (traveler_id, trip_id) references public.travelers(id, trip_id) on delete cascade
);

-- ---------- 私人備忘錄：只有寫的人自己看得到 ----------
create table if not exists public.private_notes (
  id uuid primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  activity_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  note text not null default '',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  rev bigint not null default 0,
  foreign key (activity_id, trip_id) references public.activities(id, trip_id) on delete cascade
);
create index if not exists private_notes_sync_idx on public.private_notes(trip_id, updated_at);

-- ---------- 第四版：清單（每個人自己的，可以分享給大家看）----------
-- items：[{"id":"…","kind":"text"|"link","text":"顯示文字","url":"https://…"}]
create table if not exists public.lists (
  id uuid primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '',
  icon text not null default '',
  shared boolean not null default false,
  sort_order double precision not null default 0,
  items jsonb not null default '[]'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  rev bigint not null default 0
);
create index if not exists lists_sync_idx on public.lists(trip_id, updated_at);
-- 與他人共用：這些人也可以編輯（user id）
alter table public.lists add column if not exists editors uuid[] not null default '{}';

-- 清單打勾：每個人自己的，別人看不到（在別人分享的清單上打勾也不會影響對方）
create table if not exists public.list_checks (
  id uuid primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  list_id uuid not null references public.lists(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  checked jsonb not null default '[]'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  rev bigint not null default 0
);
create index if not exists list_checks_sync_idx on public.list_checks(trip_id, updated_at);
-- 釘選別人分享的清單（只有自己看得到）
alter table public.list_checks add column if not exists pinned boolean not null default false;

-- ---------- 第四版：路線（行程與行程之間怎麼走）----------
-- 每天（分組的日子每組）相鄰兩個行程之間是一段；steps：
-- [{"id":"…","mode":"rail"|"bus"|"walk"|"other","line_id":"…","line":"…","color":"#…","code":"G",
--   "from":"…","to":"…","from_station":"…","to_station":"…","direction":"…","stops":2,"note":"…","map_url":"…"}]
create table if not exists public.route_legs (
  id uuid primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  date date not null,
  group_key text not null default '',
  from_activity_id uuid,
  to_activity_id uuid,
  from_name text not null default '',
  to_name text not null default '',
  start_time time,
  custom boolean not null default false,
  dismissed boolean not null default false,
  steps jsonb not null default '[]'::jsonb,
  notes text not null default '',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  rev bigint not null default 0
);
create index if not exists route_legs_sync_idx on public.route_legs(trip_id, updated_at);
-- 一段路線可以有好幾個方案：[{"id":"…","label":"京急到品川","steps":[…]}]，第一個是主要方案（steps 存主要方案）
alter table public.route_legs add column if not exists plans jsonb not null default '[]'::jsonb;

-- ---------- 索引（同步時依旅行與更新時間查詢）----------
create index if not exists trips_updated_idx on public.trips(updated_at);
create index if not exists travelers_sync_idx on public.travelers(trip_id, updated_at);
create index if not exists places_sync_idx on public.places(trip_id, updated_at);
create index if not exists activities_sync_idx on public.activities(trip_id, updated_at);
create index if not exists route_steps_sync_idx on public.route_steps(trip_id, updated_at);
create index if not exists route_steps_activity_idx on public.route_steps(activity_id);
create index if not exists tickets_sync_idx on public.tickets(trip_id, updated_at);
create index if not exists day_plans_sync_idx on public.day_plans(trip_id, updated_at);
create index if not exists personal_status_sync_idx on public.personal_status(trip_id, updated_at);
create index if not exists trip_members_user_idx on public.trip_members(user_id);

-- ---------- 觸發器 ----------
do $$
declare t text;
begin
  foreach t in array array['trips','travelers','places','activities','route_steps','tickets','day_plans','personal_status','private_notes','lists','list_checks','route_legs'] loop
    execute format('drop trigger if exists touch on public.%I', t);
    execute format('create trigger touch before insert or update on public.%I for each row execute function public.tg_touch()', t);
  end loop;
  foreach t in array array['travelers','places','activities','route_steps','tickets','day_plans','personal_status','private_notes','lists','list_checks','route_legs'] loop
    execute format('drop trigger if exists lock_trip on public.%I', t);
    execute format('create trigger lock_trip before update on public.%I for each row execute function public.tg_lock_trip()', t);
  end loop;
end $$;

-- 建立旅行時，建立者自動成為擁有者
create or replace function public.tg_trip_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.trip_members (trip_id, user_id, role, see_all_groups, display_name)
  values (new.id, new.owner_id, 'owner', true,
          coalesce((select email from auth.users where id = new.owner_id), ''))
  on conflict (trip_id, user_id) do update set role = 'owner', see_all_groups = true;
  return new;
end $$;
drop trigger if exists trip_owner on public.trips;
create trigger trip_owner after insert on public.trips
  for each row execute function public.tg_trip_owner();

-- 只有擁有者能封存、刪除旅行或變更擁有者
create or replace function public.tg_trip_guard() returns trigger
language plpgsql as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception '不能變更旅行擁有者';
  end if;
  if (new.deleted_at is distinct from old.deleted_at or new.archived_at is distinct from old.archived_at)
     and coalesce(public.trip_role(old.id), '') <> 'owner' then
    raise exception '只有建立旅行的人可以封存或刪除旅行';
  end if;
  return new;
end $$;
drop trigger if exists trip_guard on public.trips;
create trigger trip_guard before update on public.trips
  for each row execute function public.tg_trip_guard();

-- 行程移到回收桶時，它的移動步驟一起移入；從回收桶還原時一起還原
create or replace function public.tg_activity_cascade() returns trigger
language plpgsql as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update public.route_steps set deleted_at = new.deleted_at
     where activity_id = new.id and deleted_at is null;
  elsif new.deleted_at is null and old.deleted_at is not null then
    update public.route_steps set deleted_at = null
     where activity_id = new.id and deleted_at = old.deleted_at;
  end if;
  return new;
end $$;
drop trigger if exists activity_cascade on public.activities;
create trigger activity_cascade after update of deleted_at on public.activities
  for each row execute function public.tg_activity_cascade();

-- 永久刪除行程時，把票券上的關聯移除
create or replace function public.tg_activity_purge() returns trigger
language plpgsql as $$
begin
  update public.tickets set activity_ids = array_remove(activity_ids, old.id)
   where trip_id = old.trip_id and old.id = any(activity_ids);
  return old;
end $$;
drop trigger if exists activity_purge on public.activities;
create trigger activity_purge after delete on public.activities
  for each row execute function public.tg_activity_purge();

-- 永久刪除同行者時，清掉票券持有人、行程對象與分組設定
create or replace function public.tg_traveler_purge() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.tickets set traveler_ids = array_remove(traveler_ids, old.id)
   where trip_id = old.trip_id and old.id = any(traveler_ids);
  update public.activities set audience_travelers = array_remove(audience_travelers, old.id)
   where trip_id = old.trip_id and old.id = any(audience_travelers);
  update public.day_plans set assignments = assignments - old.id::text
   where trip_id = old.trip_id and assignments ? old.id::text;
  update public.trip_members set traveler_id = null
   where trip_id = old.trip_id and traveler_id = old.id;
  return old;
end $$;
drop trigger if exists traveler_purge on public.travelers;
create trigger traveler_purge after delete on public.travelers
  for each row execute function public.tg_traveler_purge();

-- ---------- 資料列權限（RLS）----------
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_invites enable row level security;
alter table public.travelers enable row level security;
alter table public.places enable row level security;
alter table public.activities enable row level security;
alter table public.route_steps enable row level security;
alter table public.tickets enable row level security;
alter table public.day_plans enable row level security;
alter table public.personal_status enable row level security;
alter table public.private_notes enable row level security;

-- 旅行
drop policy if exists trips_select on public.trips;
create policy trips_select on public.trips for select to authenticated
  using (owner_id = auth.uid() or public.is_member(id));
drop policy if exists trips_insert on public.trips;
create policy trips_insert on public.trips for insert to authenticated
  with check (owner_id = auth.uid() and not public.is_anonymous());
drop policy if exists trips_update on public.trips;
create policy trips_update on public.trips for update to authenticated
  using (public.can_edit(id)) with check (public.can_edit(id));
drop policy if exists trips_delete on public.trips;
create policy trips_delete on public.trips for delete to authenticated
  using (owner_id = auth.uid());

-- 成員：只能查看；新增／修改透過下方函式
drop policy if exists members_select on public.trip_members;
create policy members_select on public.trip_members for select to authenticated
  using (public.is_member(trip_id));

-- 邀請：只有可編輯的人看得到與建立
drop policy if exists invites_all on public.trip_invites;
create policy invites_all on public.trip_invites for all to authenticated
  using (public.can_edit(trip_id)) with check (public.can_edit(trip_id));

-- 一般內容表：成員可看，管理者可改
do $$
declare t text;
begin
  foreach t in array array['travelers','places','route_steps','day_plans'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_member(trip_id))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_edit(trip_id))', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_edit(trip_id)) with check (public.can_edit(trip_id))', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_edit(trip_id))', t || '_delete', t);
  end loop;
end $$;

-- 個人狀態：本人（自己選的同行者）或可編輯者可改
create or replace function public.is_my_traveler(p_trip uuid, p_traveler uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.trip_members
                 where trip_id = p_trip and user_id = auth.uid() and traveler_id = p_traveler)
$$;
drop policy if exists personal_status_select on public.personal_status;
create policy personal_status_select on public.personal_status for select to authenticated
  using (public.is_member(trip_id));
drop policy if exists personal_status_insert on public.personal_status;
create policy personal_status_insert on public.personal_status for insert to authenticated
  with check (public.can_edit(trip_id) or public.is_my_traveler(trip_id, traveler_id));
drop policy if exists personal_status_update on public.personal_status;
create policy personal_status_update on public.personal_status for update to authenticated
  using (public.can_edit(trip_id) or public.is_my_traveler(trip_id, traveler_id))
  with check (public.can_edit(trip_id) or public.is_my_traveler(trip_id, traveler_id));
drop policy if exists personal_status_delete on public.personal_status;
create policy personal_status_delete on public.personal_status for delete to authenticated
  using (public.can_edit(trip_id));

-- 私人備忘錄：只能看、寫自己的
drop policy if exists private_notes_own on public.private_notes;
create policy private_notes_own on public.private_notes for all to authenticated
  using (user_id = auth.uid() and public.is_member(trip_id))
  with check (user_id = auth.uid() and public.is_member(trip_id));

-- ---------- 第四版：使用者（非管理者）能改的範圍 ----------
-- 我在某一天被分到哪一組（那天沒有分組就是 null）
create or replace function public.my_group(p_trip uuid, p_date date) returns text
language sql stable security definer set search_path = public as $$
  select dp.assignments ->> m.traveler_id::text
    from public.day_plans dp
    join public.trip_members m on m.trip_id = dp.trip_id and m.user_id = auth.uid()
   where dp.trip_id = p_trip and dp.date = p_date and dp.mode = 'split' and dp.deleted_at is null
     and m.traveler_id is not null
     and (dp.assignments ->> m.traveler_id::text) = any(dp.groups)
   limit 1
$$;

-- 使用者只能改：分組那天、只給自己那一組的行程
create or replace function public.can_edit_group_activity(p_trip uuid, p_date date, p_groups text[], p_travelers uuid[])
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_member(p_trip)
     and coalesce(cardinality(p_travelers), 0) = 0
     and p_groups is not null and cardinality(p_groups) = 1
     and p_groups[1] = public.my_group(p_trip, p_date)
$$;

-- 使用者只能改：持有人只有自己的票券
create or replace function public.is_my_ticket(p_trip uuid, p_travelers uuid[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(cardinality(p_travelers), 0) = 1 and public.is_my_traveler(p_trip, p_travelers[1])
$$;

-- 行程
drop policy if exists activities_select on public.activities;
create policy activities_select on public.activities for select to authenticated
  using (public.is_member(trip_id));
drop policy if exists activities_insert on public.activities;
create policy activities_insert on public.activities for insert to authenticated
  with check (public.can_edit(trip_id) or public.can_edit_group_activity(trip_id, date, audience_groups, audience_travelers));
drop policy if exists activities_update on public.activities;
create policy activities_update on public.activities for update to authenticated
  using (public.can_edit(trip_id) or public.can_edit_group_activity(trip_id, date, audience_groups, audience_travelers))
  with check (public.can_edit(trip_id) or public.can_edit_group_activity(trip_id, date, audience_groups, audience_travelers));
drop policy if exists activities_delete on public.activities;
create policy activities_delete on public.activities for delete to authenticated
  using (public.can_edit(trip_id));

-- 票券
drop policy if exists tickets_select on public.tickets;
create policy tickets_select on public.tickets for select to authenticated
  using (public.is_member(trip_id));
drop policy if exists tickets_insert on public.tickets;
create policy tickets_insert on public.tickets for insert to authenticated
  with check (public.can_edit(trip_id) or public.is_my_ticket(trip_id, traveler_ids));
drop policy if exists tickets_update on public.tickets;
create policy tickets_update on public.tickets for update to authenticated
  using (public.can_edit(trip_id) or public.is_my_ticket(trip_id, traveler_ids))
  with check (public.can_edit(trip_id) or public.is_my_ticket(trip_id, traveler_ids));
drop policy if exists tickets_delete on public.tickets;
create policy tickets_delete on public.tickets for delete to authenticated
  using (public.can_edit(trip_id));

-- 路線：管理者全部可改；使用者只能改分組那天自己那一組的
drop policy if exists route_legs_select on public.route_legs;
create policy route_legs_select on public.route_legs for select to authenticated
  using (public.is_member(trip_id));
drop policy if exists route_legs_insert on public.route_legs;
create policy route_legs_insert on public.route_legs for insert to authenticated
  with check (public.can_edit(trip_id) or (group_key <> '' and group_key = public.my_group(trip_id, date)));
drop policy if exists route_legs_update on public.route_legs;
create policy route_legs_update on public.route_legs for update to authenticated
  using (public.can_edit(trip_id) or (group_key <> '' and group_key = public.my_group(trip_id, date)))
  with check (public.can_edit(trip_id) or (group_key <> '' and group_key = public.my_group(trip_id, date)));
drop policy if exists route_legs_delete on public.route_legs;
create policy route_legs_delete on public.route_legs for delete to authenticated
  using (public.can_edit(trip_id));

-- 清單：自己的可以改；分享出來的大家都看得到（只能看）
alter table public.lists enable row level security;
alter table public.list_checks enable row level security;
alter table public.route_legs enable row level security;
create or replace function public.tg_lock_owner() returns trigger
language plpgsql as $$
begin
  if new.owner_id is distinct from old.owner_id then raise exception '不能變更清單擁有者'; end if;
  -- 共用的人可以改內容，但分享、共用名單、刪除只有擁有者能改
  if old.owner_id is distinct from auth.uid() and (
       new.shared is distinct from old.shared or new.editors is distinct from old.editors
       or new.deleted_at is distinct from old.deleted_at) then
    raise exception '只有建立清單的人可以改分享、共用或刪除';
  end if;
  return new;
end $$;
drop trigger if exists lock_owner on public.lists;
create trigger lock_owner before update on public.lists
  for each row execute function public.tg_lock_owner();
drop policy if exists lists_select on public.lists;
create policy lists_select on public.lists for select to authenticated
  using (public.is_member(trip_id) and (owner_id = auth.uid() or shared or auth.uid() = any(editors)));
drop policy if exists lists_insert on public.lists;
create policy lists_insert on public.lists for insert to authenticated
  with check (owner_id = auth.uid() and public.is_member(trip_id));
drop policy if exists lists_update on public.lists;
create policy lists_update on public.lists for update to authenticated
  using ((owner_id = auth.uid() or auth.uid() = any(editors)) and public.is_member(trip_id))
  with check ((owner_id = auth.uid() or auth.uid() = any(editors)) and public.is_member(trip_id));
drop policy if exists lists_delete on public.lists;
create policy lists_delete on public.lists for delete to authenticated
  using (owner_id = auth.uid());
drop policy if exists list_checks_own on public.list_checks;
create policy list_checks_own on public.list_checks for all to authenticated
  using (user_id = auth.uid() and public.is_member(trip_id))
  with check (user_id = auth.uid() and public.is_member(trip_id));


-- ---------- 函式（API）----------

-- 保持專案喚醒用
create or replace function public.ping() returns text
language sql stable as $$ select 'ok'::text $$;

-- 查看邀請內容（加入前顯示旅行名稱與同行者）
create or replace function public.get_invite(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare inv public.trip_invites; tr public.trips;
begin
  select * into inv from public.trip_invites where token = p_token and revoked_at is null;
  if not found then return null; end if;
  select * into tr from public.trips where id = inv.trip_id and deleted_at is null;
  if not found then return null; end if;
  return jsonb_build_object(
    'trip_id', tr.id, 'title', tr.title, 'destination', tr.destination,
    'start_date', tr.start_date, 'end_date', tr.end_date, 'role', inv.role,
    'already_member', public.is_member(tr.id),
    'travelers', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color) order by t.sort_order, t.created_at)
      from public.travelers t where t.trip_id = tr.id and t.deleted_at is null), '[]'::jsonb));
end $$;

-- 用邀請連結加入旅行
create or replace function public.join_trip(p_token text, p_traveler uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv public.trip_invites; v_name text; v_email text;
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  select * into inv from public.trip_invites where token = p_token and revoked_at is null;
  if not found then raise exception '邀請連結無效或已停用'; end if;
  if not exists (select 1 from public.trips where id = inv.trip_id and deleted_at is null) then
    raise exception '這趟旅行已不存在';
  end if;
  if p_traveler is not null then
    select name into v_name from public.travelers
     where id = p_traveler and trip_id = inv.trip_id and deleted_at is null;
    if not found then raise exception '找不到這位同行者'; end if;
  end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into public.trip_members (trip_id, user_id, role, traveler_id, see_all_groups, display_name)
  values (inv.trip_id, auth.uid(), inv.role, p_traveler, inv.see_all_groups,
          coalesce(nullif(v_email, ''), v_name, '訪客'))
  on conflict (trip_id, user_id) do update set
    traveler_id = coalesce(excluded.traveler_id, public.trip_members.traveler_id),
    role = case
      when public.trip_members.role = 'owner' then 'owner'
      when public.trip_members.role = 'editor' or excluded.role = 'editor' then 'editor'
      else 'viewer' end,
    see_all_groups = public.trip_members.see_all_groups or excluded.see_all_groups,
    display_name = case when public.trip_members.display_name = '' then excluded.display_name
                        else public.trip_members.display_name end;
  return inv.trip_id;
end $$;

-- 設定「我是誰」
create or replace function public.set_my_traveler(p_trip uuid, p_traveler uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member(p_trip) then raise exception '你不是這趟旅行的成員'; end if;
  if p_traveler is not null and not exists (
      select 1 from public.travelers where id = p_traveler and trip_id = p_trip and deleted_at is null) then
    raise exception '找不到這位同行者';
  end if;
  update public.trip_members set traveler_id = p_traveler
   where trip_id = p_trip and user_id = auth.uid();
end $$;

-- 擁有者調整成員權限
create or replace function public.update_member(p_trip uuid, p_user uuid, p_role text, p_see_all boolean, p_traveler uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.trip_role(p_trip), '') <> 'owner' then raise exception '只有擁有者可以調整成員'; end if;
  if p_user = auth.uid() then
    update public.trip_members set see_all_groups = coalesce(p_see_all, see_all_groups),
                                   traveler_id = p_traveler
     where trip_id = p_trip and user_id = p_user;
    return;
  end if;
  if p_role not in ('editor','viewer') then raise exception '權限設定不正確'; end if;
  if p_traveler is not null and not exists (
      select 1 from public.travelers where id = p_traveler and trip_id = p_trip) then
    raise exception '找不到這位同行者';
  end if;
  update public.trip_members set role = p_role, see_all_groups = coalesce(p_see_all, see_all_groups),
                                 traveler_id = p_traveler
   where trip_id = p_trip and user_id = p_user;
end $$;

-- 擁有者移除成員，或成員自己離開
create or replace function public.remove_member(p_trip uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user = auth.uid() then
    if public.trip_role(p_trip) = 'owner' then raise exception '擁有者不能離開自己的旅行'; end if;
  elsif coalesce(public.trip_role(p_trip), '') <> 'owner' then
    raise exception '只有擁有者可以移除成員';
  end if;
  delete from public.trip_members where trip_id = p_trip and user_id = p_user and role <> 'owner';
end $$;

-- 權限設定
revoke all on function public.get_invite(text) from public;
revoke all on function public.join_trip(text, uuid) from public;
revoke all on function public.set_my_traveler(uuid, uuid) from public;
revoke all on function public.update_member(uuid, uuid, text, boolean, uuid) from public;
revoke all on function public.remove_member(uuid, uuid) from public;
grant execute on function public.ping() to anon, authenticated;
grant execute on function public.get_invite(text) to anon, authenticated;
grant execute on function public.join_trip(text, uuid) to authenticated;
grant execute on function public.set_my_traveler(uuid, uuid) to authenticated;
grant execute on function public.update_member(uuid, uuid, text, boolean, uuid) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;

-- ---------- 檔案儲存（票券圖片、PDF）----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trip-files', 'trip-files', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 路徑格式：<旅行 id>/<檔名>
drop policy if exists trip_files_select on storage.objects;
create policy trip_files_select on storage.objects for select to authenticated
  using (bucket_id = 'trip-files' and public.is_member(public.try_uuid((storage.foldername(name))[1])));
drop policy if exists trip_files_insert on storage.objects;
-- 成員都可以上傳（使用者要上傳自己的票券）；只有管理者或上傳的人可以改、刪
create policy trip_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'trip-files' and public.is_member(public.try_uuid((storage.foldername(name))[1])));
drop policy if exists trip_files_update on storage.objects;
create policy trip_files_update on storage.objects for update to authenticated
  using (bucket_id = 'trip-files' and (public.can_edit(public.try_uuid((storage.foldername(name))[1]))
         or (owner_id = auth.uid()::text and public.is_member(public.try_uuid((storage.foldername(name))[1])))));
drop policy if exists trip_files_delete on storage.objects;
create policy trip_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'trip-files' and (public.can_edit(public.try_uuid((storage.foldername(name))[1]))
         or (owner_id = auth.uid()::text and public.is_member(public.try_uuid((storage.foldername(name))[1])))));
