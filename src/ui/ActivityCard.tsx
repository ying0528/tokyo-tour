// 一張行程卡片：時間、名稱、補充；右邊只標類型和我的票券
import { store } from '../app/services.ts';
import type { Activity } from '../data/types.ts';
import { liveSteps } from '../data/actions.ts';
import { activityName, hhmm, KINDS, modeLabel } from '../lib/plan.ts';

const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;

/** 卡片上的補充文字：移動顯示交通方式；其他顯示說明第一行（網址拿掉） */
export function activitySub(a: Activity): string {
  if (a.kind === 'move') {
    const steps = liveSteps(store, a.id);
    if (steps.length) return steps.map((s) => s.line.trim() || modeLabel(s.mode)).join(' → ');
    return '';
  }
  const first = a.notes.split('\n').map((l) => l.replace(URL_RE, '').trim()).find(Boolean);
  if (!first) return '';
  return first.length > 40 ? `${first.slice(0, 40)}…` : first;
}

export function ActivityCard({ a, ticketCount, onClick, showDate, current }: {
  a: Activity;
  /** 現在進行到的行程（綠色框） */
  current?: boolean;
  /** 我在這筆行程的票券數 */
  ticketCount: number;
  onClick: () => void;
  showDate?: string;
}) {
  const kind = KINDS[a.kind];
  const name = activityName(a, store.get('places', a.place_id));
  const sub = activitySub(a);
  const flat = a.kind === 'move';
  return (
    <button type="button" className={`act${flat ? ' flat' : ''}${current ? ' is-now' : ''}`} onClick={onClick} aria-current={current ? 'step' : undefined}>
      {a.start_time ? <span className="act-time">{hhmm(a.start_time)}</span> : <span className="act-time blank" aria-hidden="true">00:00</span>}
      <span className="act-main">
        <span className="act-title">{name}</span>
        {showDate || sub ? (
          <span className="act-sub muted">{[showDate, sub].filter(Boolean).join('・')}</span>
        ) : null}
      </span>
      <span className={flat ? 'act-tags inline' : 'act-tags'}>
        {kind.short ? <span className="tag kind-tag" style={{ background: kind.bg, color: kind.sub }}>{kind.short}</span> : null}
        {ticketCount ? <span className="tag">票券 {ticketCount}</span> : null}
      </span>
    </button>
  );
}
