// 票券分頁：依旅伴分開顯示（預設是自己），依日期排列；顯示是否已存在手機、離線能不能看
import { useState } from 'react';
import { store, useData } from '../app/services.ts';
import { navigate } from '../app/router.ts';
import type { TripCtx } from '../app/tripContext.ts';
import type { Activity, Ticket } from '../data/types.ts';
import { dayLabel, daysBetween } from '../lib/dates.ts';
import { activityName, hhmm, sortActivities, ticketForTraveler } from '../lib/plan.ts';
import { useFileUrl } from '../ui/useFile.ts';
import { Empty } from '../ui/kit.tsx';
import { Icon } from '../ui/icons.tsx';
import { Mascot } from '../ui/Mascot.tsx';

function Thumb({ t }: { t: Ticket }) {
  const isImage = t.file_type === 'image';
  const { url } = useFileUrl(isImage && store.hasFile(t.file_path) ? t.file_path : null);
  if (url) return <img className="ticket-thumb" src={url} alt="" />;
  return <span className="ticket-thumb">{t.file_type === 'pdf' ? 'PDF' : t.file_path ? 'QR' : '—'}</span>;
}

export function linkedActivities(t: Ticket): Activity[] {
  return sortActivities(t.activity_ids.map((id) => store.get('activities', id)).filter((a): a is Activity => Boolean(a && !a.deleted_at)));
}

export function TicketCard({ t, ctx }: { t: Ticket; ctx: TripCtx }) {
  useData();
  const acts = linkedActivities(t);
  const holders = t.traveler_ids.map((id) => ctx.travelers.find((x) => x.id === id)?.name).filter(Boolean);
  const cached = store.hasFile(t.file_path);
  const pendingUpload = t.file_path ? store.pendingUploads().includes(t.file_path) : false;
  return (
    <button type="button" className="ticket" onClick={() => navigate(`/t/${t.trip_id}/tk/${t.id}`)}>
      <span className="ticket-main">
        {t.kind.trim() ? <span className="tag" style={{ alignSelf: 'flex-start', background: 'var(--pink)' }}>{t.kind}</span> : null}
        <span style={{ fontSize: 18, overflowWrap: 'anywhere' }}>{t.title}</span>
        <span className="tiny muted">
          {[holders.length ? holders.join('、') : '全員共用', acts.length ? `連到：${acts.map((a) => `${a.start_time ? `${hhmm(a.start_time)} ` : ''}${activityName(a, store.get('places', a.place_id))}`).join('、')}` : ''].filter(Boolean).join('・')}
        </span>
        {t.file_path ? (
          <span className="tiny" style={{ color: pendingUpload ? 'var(--warn)' : cached ? 'var(--ok)' : 'var(--warn)', display: 'flex', alignItems: 'center', gap: 4 }}>
            {pendingUpload ? '等待上傳（已存在這支手機）' : cached ? '已存在手機，離線也能看' : <><Icon.download />還沒下載到這支手機</>}
          </span>
        ) : <span className="tiny muted">還沒有圖片</span>}
      </span>
      <span className="ticket-stub"><Thumb t={t} /></span>
    </button>
  );
}

export function TicketsTab({ ctx }: { ctx: TripCtx }) {
  useData();
  const { trip } = ctx;
  const [who, setWho] = useState<string | 'all'>(() => ctx.myTravelerId ?? 'all');
  const tickets = store.byTrip('tickets', trip.id);
  const actMap = new Map(store.byTrip('activities', trip.id).map((a) => [a.id, a]));
  const planMap = new Map(store.byTrip('day_plans', trip.id).map((p) => [p.date, p]));
  const shown = who === 'all' ? tickets : tickets.filter((t) => ticketForTraveler(t, who, actMap, planMap));

  // 依第一個關聯行程的日期分組
  const groups = new Map<string, Ticket[]>();
  for (const t of shown) {
    const first = linkedActivities(t)[0];
    const key = first ? first.date : '';
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const keys = [...groups.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
  const notCached = shown.filter((t) => t.file_path && !store.hasFile(t.file_path)).length;

  return (
    <div className="pad stack">
      <div className="section-head">
        <h2 className="day-title">票券</h2>
        {ctx.editable ? (
          <button type="button" className="btn btn-ghost" onClick={() => navigate(`/t/${trip.id}/tk/new`)}><Icon.camera /> 拍照／上傳</button>
        ) : null}
      </div>
      {ctx.travelers.length ? (
        <div className="chips" role="radiogroup" aria-label="看誰的票券">
          <button type="button" role="radio" aria-checked={who === 'all'} className={`chip${who === 'all' ? ' is-on' : ''}`}
            style={who === 'all' ? { background: 'var(--butter)' } : undefined} onClick={() => setWho('all')}>全部</button>
          {ctx.travelers.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={who === t.id} className={`chip${who === t.id ? ' is-on' : ''}`}
              style={who === t.id ? { background: 'var(--peach)' } : undefined} onClick={() => setWho(t.id)}>
              {t.name}{t.id === ctx.myTravelerId ? '（我）' : ''}
            </button>
          ))}
        </div>
      ) : null}
      {notCached && navigator.onLine === false ? (
        <p className="notice notice-warn small">有 {notCached} 張票券還沒下載到這支手機，連上網路後打開這頁就會自動下載。</p>
      ) : null}

      {shown.length ? keys.map((k) => (
        <div key={k || 'none'} className="stack-sm">
          <span className="section-title">{k ? `Day ${daysBetween(trip.start_date, k) + 1}・${dayLabel(k)}` : '沒有連到行程'}</span>
          {groups.get(k)!.sort((a, b) => a.sort_order - b.sort_order).map((t) => <TicketCard key={t.id} t={t} ctx={ctx} />)}
        </div>
      )) : (
        <Empty icon={<Mascot size={70} mood="wink" />} title={tickets.length ? '這個人沒有票券' : '還沒有票券'}>
          {ctx.editable ? '按「拍照／上傳」加入門票、機票或 QR Code，可以一張票連到好幾個行程。' : '規劃的人上傳後，這裡就會出現。'}
        </Empty>
      )}
    </div>
  );
}
