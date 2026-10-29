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
  kind text not null default 'sight' check (kind in ('sight','food','lodging','shop','other')),
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
  kind text not null default 'sight' check (kind in ('sight','food','lodging','move','other')),
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
  foreach t in array array['trips','travelers','places','activities','route_steps','tickets','day_plans','personal_status'] loop
    execute format('drop trigger if exists touch on public.%I', t);
    execute format('create trigger touch before insert or update on public.%I for each row execute function public.tg_touch()', t);
  end loop;
  foreach t in array array['travelers','places','activities','route_steps','tickets','day_plans','personal_status'] loop
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

-- 一般內容表：成員可看，可編輯者可改
do $$
declare t text;
begin
  foreach t in array array['travelers','places','activities','route_steps','tickets','day_plans'] loop
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
create policy trip_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'trip-files' and public.can_edit(public.try_uuid((storage.foldername(name))[1])));
drop policy if exists trip_files_update on storage.objects;
create policy trip_files_update on storage.objects for update to authenticated
  using (bucket_id = 'trip-files' and public.can_edit(public.try_uuid((storage.foldername(name))[1])));
drop policy if exists trip_files_delete on storage.objects;
create policy trip_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'trip-files' and public.can_edit(public.try_uuid((storage.foldername(name))[1])));
