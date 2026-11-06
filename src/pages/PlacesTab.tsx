// 景點分頁：列出整趟旅行的景點、用餐、住宿行程，可以搜尋、依類型篩選，點進去就是那筆行程
import { useState } from 'react';
import { store } from '../app/services.ts';
import { navigate } from '../app/router.ts';
import { myTickets } from '../app/tripContext.ts';
import type { TripCtx } from '../app/tripContext.ts';
import type { ActivityKind } from '../data/types.ts';
import { dayLabel, daysBetween } from '../lib/dates.ts';
import { activityName, KINDS, sortActivities } from '../lib/plan.ts';
import { ActivityCard } from '../ui/ActivityCard.tsx';
import { Empty } from '../ui/kit.tsx';
import { Icon } from '../ui/icons.tsx';
import { Mascot } from '../ui/Mascot.tsx';

const FILTERS: ActivityKind[] = ['sight', 'food', 'lodging'];

export function PlacesTab({ ctx }: { ctx: TripCtx }) {
  const { trip } = ctx;
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<ActivityKind | 'all'>('all');
  const all = sortActivities(store.byTrip('activities', trip.id).filter((a) => a.kind !== 'move'));
  const query = q.trim().toLowerCase();
  const list = all
    .filter((a) => kind === 'all' || a.kind === kind)
    .filter((a) => !query || [activityName(a, store.get('places', a.place_id)), a.notes].some((x) => x.toLowerCase().includes(query)));
  const mine = myTickets(ctx);

  return (
    <div className="pad stack">
      <label className="input-row" style={{ background: 'var(--surface)', border: 'var(--border)', borderRadius: 999, padding: '0 14px', minHeight: 50 }}>
        <Icon.search />
        <input type="search" aria-label="搜尋" placeholder="搜尋景點、餐廳、住宿" value={q} onChange={(e) => setQ(e.target.value)}
          style={{ flex: '1 1 auto', minWidth: 0, border: 0, background: 'transparent', fontSize: 16, outline: 'none' }} />
      </label>
      <div className="chips" role="radiogroup" aria-label="類型">
        <button type="button" role="radio" aria-checked={kind === 'all'} className={`chip${kind === 'all' ? ' is-on' : ''}`}
          style={kind === 'all' ? { background: 'var(--butter)' } : undefined} onClick={() => setKind('all')}>全部</button>
        {FILTERS.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} className={`chip${kind === k ? ' is-on' : ''}`}
            style={{ background: KINDS[k].bg }} onClick={() => setKind(k)}>{KINDS[k].label}</button>
        ))}
      </div>

      {list.length ? (
        <div className="stack-sm">
          {list.map((a) => (
            <ActivityCard key={a.id} a={a} ticketCount={mine.filter((t) => t.activity_ids.includes(a.id)).length}
              showDate={`Day ${daysBetween(trip.start_date, a.date) + 1} ${dayLabel(a.date)}`}
              onClick={() => navigate(`/t/${trip.id}/a/${a.id}`)} />
          ))}
        </div>
      ) : (
        <Empty icon={<Mascot size={70} mood={all.length ? 'wow' : 'wink'} />} title={all.length ? '找不到符合的行程' : '還沒有景點'}>
          {all.length ? '換個關鍵字試試看。' : '在「行程」新增景點、用餐或住宿，就會出現在這裡。'}
        </Empty>
      )}
    </div>
  );
}
