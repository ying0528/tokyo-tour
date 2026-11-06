// 一張行程卡片：時間、名稱、補充、類型與參加者標籤
import { store } from '../app/services.ts';
import type { Activity, DayPlan, Traveler } from '../data/types.ts';
import { liveSteps } from '../data/actions.ts';
import { activityName, audienceLabel, endTime, hhmm, KINDS, modeLabel } from '../lib/plan.ts';

export function activitySub(a: Activity): string {
  if (a.kind === 'move') {
    const steps = liveSteps(store, a.id);
    if (steps.length) return steps.map((s) => s.line.trim() || modeLabel(s.mode)).join(' → ');
  }
  const first = a.notes.split('\n').map((l) => l.trim()).find(Boolean);
  if (first) return first.length > 40 ? `${first.slice(0, 40)}…` : first;
  const place = store.get('places', a.place_id);
  const d = place?.description.split('\n').map((l) => l.trim()).find(Boolean);
  return d ? (d.length > 40 ? `${d.slice(0, 40)}…` : d) : '';
}

export function ActivityCard({ a, plan, travelers, onClick, showDate }: {
  a: Activity;
  plan: DayPlan | undefined;
  travelers: Traveler[];
  onClick: () => void;
  showDate?: string;
}) {
  const kind = KINDS[a.kind];
  const place = store.get('places', a.place_id);
  const name = activityName(a, place);
  const sub = activitySub(a);
  const aud = audienceLabel(a, plan, travelers);
  const end = endTime(a);
  const tickets = store.all('tickets').filter((t) => !t.deleted_at && t.activity_ids.includes(a.id)).length;
  const pending = store.isPending('activities', a.id);
  return (
    <button type="button" className="act" style={{ background: kind.bg }} onClick={onClick}>
      <span className={`act-time${a.start_time ? '' : ' none'}`}>
        {a.start_time ? hhmm(a.start_time) : '未定'}
      </span>
      <span className="act-main">
        <span className="act-title">{name}</span>
        {showDate || end || sub ? (
          <span className="act-sub" style={{ color: kind.sub }}>
            {[showDate, end ? `到 ${end}` : '', sub].filter(Boolean).join('・')}
          </span>
        ) : null}
      </span>
      <span className="act-tags">
        <span className="tag">{kind.short}</span>
        {aud ? <span className="tag">{aud}</span> : null}
        {tickets ? <span className="tag">票券 {tickets}</span> : null}
        {pending ? <span className="tag" style={{ background: 'var(--warn-soft)' }}>待同步</span> : null}
      </span>
    </button>
  );
}
