// 設定分頁：旅程資訊、同行者、我是誰、家人共用、同步、封存與刪除
import { useState } from 'react';
import { canEditTrip, myMember, remote, roleOf, store, syncer, useData, useOnline, useSession } from '../app/services.ts';
import { navigate } from '../app/router.ts';
import type { Trip } from '../data/types.ts';
import { dayCount, rangeLabel, TIMEZONES } from '../lib/dates.ts';
import { Button, Dot, List, Notice, Row, Section } from '../ui/kit.tsx';
import { Icon } from '../ui/icons.tsx';
import { useSyncSummary } from '../ui/SyncBadge.tsx';
import { confirmDialog, toast } from '../ui/dialog.tsx';
import { RichText } from '../ui/RichText.tsx';
import { downloadBackup } from './CopyTripPage.tsx';
import { alreadyImported, importIntoTrip, importSummary, parseImport } from '../data/importer.ts';

export function SettingsTab({ trip }: { trip: Trip }) {
  useData();
  const { user } = useSession();
  const online = useOnline();
  const sync = useSyncSummary();
  const role = roleOf(trip, user?.id);
  const editable = canEditTrip(trip, user?.id);
  const travelers = store.byTrip('travelers', trip.id).sort((a, b) => a.sort_order - b.sort_order || (a.created_at ?? '').localeCompare(b.created_at ?? ''));
  const removedTravelers = store.byTrip('travelers', trip.id, { includeDeleted: true }).filter((t) => t.deleted_at);
  const members = store.members(trip.id);
  const me = myMember(trip.id, user?.id);
  const [savingMe, setSavingMe] = useState(false);

  async function setMe(travelerId: string | null) {
    setSavingMe(true);
    try {
      // 剛建立的旅行可能還沒上傳，先同步再設定
      if (store.pending().length) await syncer.sync({ pull: false });
      await remote.setMyTraveler(trip.id, travelerId);
      await syncer.sync();
      toast('已更新');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSavingMe(false);
    }
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    try {
      const d = parseImport(await file.text());
      const sum = importSummary(d);
      const again = alreadyImported(trip.settings, d.id);
      const ok = await confirmDialog({
        title: again ? '這份行程檔已經匯入過，要再匯入一次嗎？' : `匯入「${d.title}」？`,
        message: again ? '再匯入一次，行程會重複出現。' : `會加入 ${sum.days} 天、${sum.activities} 個行程、${sum.legs} 段路線、${sum.images} 張圖片${sum.groups ? `，以及 ${sum.groups} 天的分組` : ''}。原本的行程不會被刪除。`,
        confirmText: '匯入',
        danger: again,
      });
      if (!ok) return;
      const r = await importIntoTrip(store, trip.id, d);
      toast(`已匯入 ${r.activities} 個行程${r.addedTravelers.length ? `，新增同行者：${r.addedTravelers.join('、')}` : ''}`);
      navigate(`/t/${trip.id}/plan/${trip.start_date}`);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function toggleArchive() {
    if (trip.archived_at) {
      await store.update('trips', trip.id, { archived_at: null });
      toast('已取消封存');
    } else {
      const ok = await confirmDialog({
        title: '封存這趟旅行？',
        message: '封存後會收到「我的旅行」最下方的「已封存」，資料都保留，隨時可以取消封存。',
        confirmText: '封存',
      });
      if (!ok) return;
      await store.update('trips', trip.id, { archived_at: new Date().toISOString() });
      toast('已封存');
      navigate('/', { replace: true });
    }
  }

  async function moveToBin() {
    const ok = await confirmDialog({
      title: '把旅行移到回收桶？',
      message: '所有成員都會看不到這趟旅行。資料不會馬上刪除，可以在「我的旅行 → 回收桶」還原或永久刪除。',
      confirmText: '移到回收桶',
      danger: true,
    });
    if (!ok) return;
    await store.softDelete('trips', trip.id);
    navigate('/', { replace: true });
    toast('已移到回收桶');
  }

  async function leave() {
    const ok = await confirmDialog({
      title: '離開這趟旅行？',
      message: '離開後就看不到這趟旅行，需要再請家人傳邀請連結才能加入。',
      confirmText: '離開',
      danger: true,
    });
    if (!ok || !user) return;
    try {
      await remote.removeMember(trip.id, user.id);
      await store.removeTripLocal(trip.id);
      navigate('/', { replace: true });
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  const tzLabel = TIMEZONES.find((z) => z.value === trip.timezone)?.label ?? trip.timezone;

  return (
    <div className="pad stack-lg">
      <Section title="旅程資訊">
        <List>
          <Row title={trip.title || '未命名旅行'}
            detail={<>{[trip.destination, rangeLabel(trip.start_date, trip.end_date), `${dayCount(trip.start_date, trip.end_date)} 天`].filter(Boolean).join('・')}<br />時區：{tzLabel}{trip.timezone === 'Asia/Tokyo' ? '（路線頁使用東京地鐵版本）' : ''}</>}
            onClick={editable ? () => navigate(`/t/${trip.id}/edit`) : undefined} />
        </List>
        {trip.notes ? <RichText text={trip.notes} className="note-text" /> : null}
      </Section>

      <Section title="同行者" action={editable ? (
        <Button variant="ghost" onClick={() => navigate(`/t/${trip.id}/travelers/new`)}><Icon.plus /> 新增</Button>
      ) : null}>
        {travelers.length ? (
          <List>
            {travelers.map((t) => (
              <Row key={t.id} leading={<Dot color={t.color} />} title={t.name || '未命名'}
                detail={members.filter((m) => m.traveler_id === t.id).length ? '已連結手機' : undefined}
                onClick={editable ? () => navigate(`/t/${trip.id}/travelers/${t.id}`) : undefined} />
            ))}
          </List>
        ) : (
          <Notice>還沒有同行者。{editable ? '按「新增」加入家人。' : ''}</Notice>
        )}
        {editable && removedTravelers.length ? (
          <p className="muted small">
            已刪除：{removedTravelers.map((t, i) => (
              <span key={t.id}>
                {i ? '、' : ''}{t.name}{' '}
                <button type="button" className="link-btn inline" onClick={() => store.restore('travelers', t.id)}>還原</button>
              </span>
            ))}
          </p>
        ) : null}
      </Section>

      <Section title="我是誰">
        <div className="stack">
          <select className="input" aria-label="我是誰" value={me?.traveler_id ?? ''} disabled={!online || savingMe || (!me && role !== 'owner')}
            onChange={(e) => setMe(e.target.value || null)}>
            <option value="">（未選擇）</option>
            {travelers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <p className="muted small">
            {!me && role !== 'owner' ? '同步完成後就可以選擇。' : !online ? '需要連上網路才能更改。' : '選了之後，APP 會優先顯示你自己的行程和票券。'}
          </p>
        </div>
      </Section>

      <Section title="家人共用">
        <List>
          <Row leading={<Icon.users />} title="成員與邀請連結"
            detail={`${members.length || 1} 位成員${editable ? '・產生邀請連結給家人' : ''}`}
            onClick={() => navigate(`/t/${trip.id}/members`)} />
        </List>
      </Section>

      <Section title="同步">
        <List>
          <Row leading={<Icon.cloud />} title={sync.label} detail="查看待同步項目、立即同步" onClick={() => navigate('/sync')} />
        </List>
      </Section>

      <Section title="備份與範本">
        <List>
 {editable ? (
            <label className="row row-btn" style={{ cursor: 'pointer' }}>
              <span className="row-lead"><Icon.plan /></span>
              <span className="row-main"><span className="row-title">匯入行程檔</span><span className="row-detail">把整理好的行程（含圖片、分組、路線）一次加進這趟旅行</span></span>
              <span className="row-trail muted"><Icon.chevron /></span>
              <input type="file" accept=".json,application/json" hidden aria-label="選擇行程檔" onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          ) : null}
          <Row leading={<Icon.download />} title="匯出備份" detail="把整趟旅行存成一個檔案（不含票券圖片）" onClick={() => { downloadBackup(trip.id); toast('已下載備份檔'); }} />
          {user && !user.is_anonymous ? (
            <Row leading={<Icon.copy />} title="複製成新旅行" detail="當作下一趟的範本，可選擇帶不帶行程" onClick={() => navigate(`/t/${trip.id}/copy`)} />
          ) : null}
        </List>
      </Section>

      <Section title="旅行管理">
        <List>
          {role === 'owner' ? (
            <>
              <Row leading={<Icon.archive />} title={trip.archived_at ? '取消封存' : '封存這趟旅行'} onClick={toggleArchive} />
              <Row leading={<Icon.trash />} title="移到回收桶" danger onClick={moveToBin} />
            </>
          ) : (
            <Row leading={<Icon.logout />} title="離開這趟旅行" danger onClick={leave} />
          )}
        </List>
        {role !== 'owner' ? <p className="muted small">你的權限：{role === 'editor' ? '管理者（可以編輯所有內容）' : '使用者（可以改分組那天自己那組的行程、自己的備忘錄、清單、票券）'}</p> : null}
      </Section>
    </div>
  );
}
