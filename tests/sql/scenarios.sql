-- 本機權限與資料規則測試。任何一步失敗都會中止並顯示錯誤。
\set ON_ERROR_STOP on
\set owner   '11111111-1111-4111-8111-111111111111'
\set guest   '22222222-2222-4222-8222-222222222222'
\set editor  '33333333-3333-4333-8333-333333333333'
\set stranger '44444444-4444-4444-8444-444444444444'
\set trip    'aaaaaaaa-0000-4000-8000-000000000001'
\set dad     'bbbbbbbb-0000-4000-8000-000000000001'
\set kid     'bbbbbbbb-0000-4000-8000-000000000002'
\set place   'cccccccc-0000-4000-8000-000000000001'
\set act     'dddddddd-0000-4000-8000-000000000001'
\set act2    'dddddddd-0000-4000-8000-000000000002'
\set step    'eeeeeeee-0000-4000-8000-000000000001'
\set ticket  'ffffffff-0000-4000-8000-000000000001'

insert into auth.users values (:'owner', 'mom@example.com'), (:'guest', null),
  (:'editor', 'dad@example.com'), (:'stranger', 'x@example.com');

create or replace function pg_temp.expect_error(sql text, label text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    raise notice 'OK (預期被擋下) %: %', label, sqlerrm;
    return;
  end;
  raise exception '應該失敗但成功了: %', label;
end $$;
create or replace function pg_temp.expect(cond boolean, label text) returns void language plpgsql as $$
begin
  if not cond then raise exception '檢查失敗: %', label; end if;
  raise notice 'OK %', label;
end $$;

-- ===== 擁有者建立旅行 =====
set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'owner')::text, false);
insert into public.trips (id, title, destination, start_date, end_date)
  values (:'trip', '東京家族旅行', '東京', '2026-12-20', '2026-12-26') returning rev > 0 as has_rev;
select pg_temp.expect(public.trip_role(:'trip') = 'owner', '建立者自動成為擁有者');
insert into public.travelers (id, trip_id, name) values (:'dad', :'trip', '爸爸'), (:'kid', :'trip', '小寶');
insert into public.places (id, trip_id, name, kind) values (:'place', :'trip', '淺草寺', 'sight');
insert into public.activities (id, trip_id, date, start_time, kind, place_id)
  values (:'act', :'trip', '2026-12-21', '09:00', 'sight', :'place');
insert into public.activities (id, trip_id, date, kind, from_name, to_name)
  values (:'act2', :'trip', '2026-12-21', 'move', '飯店', '淺草寺');
insert into public.route_steps (id, trip_id, activity_id, mode, line) values (:'step', :'trip', :'act2', 'subway', '銀座線');
insert into public.tickets (id, trip_id, title, traveler_ids, activity_ids)
  values (:'ticket', :'trip', '晴空塔', array[:'kid']::uuid[], array[:'act', :'act2']::uuid[]);
insert into public.trip_invites (trip_id, token, role) values (:'trip', 'viewer-token', 'viewer');
insert into public.trip_invites (trip_id, token, role, see_all_groups) values (:'trip', 'editor-token', 'editor', true);

-- 版本號：修改一次就變大
select rev as r1 from public.activities where id = :'act' \gset
update public.activities set notes = '早點去' where id = :'act';
select pg_temp.expect((select rev from public.activities where id = :'act') > :r1, '修改後版本號增加');
-- 以版本號做衝突檢查：舊版本號更新不到任何資料
update public.activities set notes = '舊裝置的修改' where id = :'act' and rev = :r1;
select pg_temp.expect((select notes from public.activities where id = :'act') = '早點去', '舊版本號的修改不會覆蓋新資料');

select pg_temp.expect_error($$update public.travelers set trip_id = gen_random_uuid() where id = 'bbbbbbbb-0000-4000-8000-000000000001'$$, '資料不能搬到別的旅行');
select pg_temp.expect_error($$insert into public.activities (id, trip_id, date, place_id) values (gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-000000000001', '2026-12-22', gen_random_uuid())$$, '行程不能連到不存在的景點');

-- ===== 匿名訪客用邀請連結加入 =====
select set_config('request.jwt.claims', json_build_object('sub', :'guest', 'is_anonymous', true)::text, false);
select pg_temp.expect((select count(*) from public.trips) = 0, '加入前看不到旅行');
select pg_temp.expect((public.get_invite('viewer-token') ->> 'title') = '東京家族旅行', '加入前可預覽邀請');
select pg_temp.expect(jsonb_array_length(public.get_invite('viewer-token') -> 'travelers') = 2, '預覽列出同行者');
select pg_temp.expect(public.get_invite('wrong') is null, '錯誤的邀請碼無效');
select public.join_trip('viewer-token', :'kid');
select pg_temp.expect((select count(*) from public.activities) = 2, '加入後看得到行程');
select pg_temp.expect((select traveler_id from public.trip_members where user_id = :'guest') = :'kid', '記住我是誰');
select pg_temp.expect((select count(*) from public.trip_invites) = 0, '只能看的成員看不到邀請碼');
update public.activities set notes = '亂改' where id = :'act';
select pg_temp.expect((select notes from public.activities where id = :'act') = '早點去', '只能看的成員改不了行程');
select pg_temp.expect_error($$insert into public.places (id, trip_id, name) values (gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-000000000001', 'x')$$, '只能看的成員不能新增');
select pg_temp.expect_error($$insert into public.trips (id, title, start_date, end_date) values (gen_random_uuid(), 'x', '2026-01-01', '2026-01-02')$$, '匿名訪客不能建立旅行');
-- 個人狀態：只能改自己
insert into public.personal_status (id, trip_id, activity_id, traveler_id, done)
  values (gen_random_uuid(), :'trip', :'act', :'kid', true);
select pg_temp.expect_error($$insert into public.personal_status (id, trip_id, activity_id, traveler_id, done) values (gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', true)$$, '不能改別人的完成狀態');
-- 檔案權限
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('trip-files', 'aaaaaaaa-0000-4000-8000-000000000001/x.jpg')$$, '只能看的成員不能上傳檔案');
reset role;
insert into storage.objects (bucket_id, name) values ('trip-files', 'aaaaaaaa-0000-4000-8000-000000000001/ticket.jpg');
set role authenticated;
select pg_temp.expect((select count(*) from storage.objects) = 1, '成員看得到旅行的檔案');

-- ===== 陌生人 =====
select set_config('request.jwt.claims', json_build_object('sub', :'stranger')::text, false);
select pg_temp.expect((select count(*) from public.trips) = 0, '陌生人看不到旅行');
select pg_temp.expect((select count(*) from public.tickets) = 0, '陌生人看不到票券');
select pg_temp.expect((select count(*) from storage.objects) = 0, '陌生人看不到檔案');
select pg_temp.expect_error($$select public.set_my_traveler('aaaaaaaa-0000-4000-8000-000000000001', null)$$, '陌生人不能設定身分');

-- ===== 可編輯的成員 =====
select set_config('request.jwt.claims', json_build_object('sub', :'editor')::text, false);
select public.join_trip('editor-token', :'dad');
update public.activities set notes = '爸爸改的' where id = :'act';
select pg_temp.expect((select notes from public.activities where id = :'act') = '爸爸改的', '可編輯成員能修改');
select pg_temp.expect_error($$update public.trips set archived_at = now() where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, '非擁有者不能封存旅行');
select pg_temp.expect_error($$select public.remove_member('aaaaaaaa-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222')$$, '非擁有者不能移除別人');
-- 行程移入回收桶，交通步驟一起移入；還原也一起還原
update public.activities set deleted_at = now() where id = :'act2';
select pg_temp.expect((select deleted_at is not null from public.route_steps where id = :'step'), '刪除行程時交通步驟一起移入回收桶');
update public.activities set deleted_at = null where id = :'act2';
select pg_temp.expect((select deleted_at is null from public.route_steps where id = :'step'), '還原行程時交通步驟一起還原');
-- 永久刪除行程：交通步驟刪除、票券關聯移除，但票券本身保留
delete from public.activities where id = :'act2';
select pg_temp.expect((select count(*) from public.route_steps) = 0, '永久刪除行程時交通步驟一起刪除');
select pg_temp.expect((select activity_ids from public.tickets where id = :'ticket') = array[:'act']::uuid[], '票券只移除被刪的關聯');
-- 永久刪除景點：行程保留，只是不再連結
delete from public.places where id = :'place';
select pg_temp.expect((select place_id is null and trip_id is not null from public.activities where id = :'act'), '刪除景點不會刪掉行程');

-- ===== 擁有者 =====
select set_config('request.jwt.claims', json_build_object('sub', :'owner')::text, false);
select pg_temp.expect((select count(*) from public.trip_members) = 3, '擁有者看得到全部成員');
select public.update_member(:'trip', :'guest', 'editor', true, :'kid');
select pg_temp.expect((select role from public.trip_members where user_id = :'guest') = 'editor', '擁有者可調整權限');
delete from public.travelers where id = :'kid';
select pg_temp.expect((select traveler_ids from public.tickets where id = :'ticket') = '{}', '刪除同行者時移除票券持有人');
select pg_temp.expect((select traveler_id from public.trip_members where user_id = :'guest') is null, '刪除同行者時清掉成員身分');
select pg_temp.expect((select count(*) from public.personal_status) = 0, '刪除同行者時刪除其完成狀態');
select public.remove_member(:'trip', :'guest');
select pg_temp.expect((select count(*) from public.trip_members) = 2, '擁有者可移除成員');
update public.trips set deleted_at = now() where id = :'trip';
delete from public.trips where id = :'trip';
reset role;
select pg_temp.expect((select count(*) from public.tickets) + (select count(*) from public.activities) + (select count(*) from public.travelers) = 0, '永久刪除旅行時清掉所有內容');
select pg_temp.expect(public.ping() = 'ok', 'ping 可用');
\echo '全部通過'
