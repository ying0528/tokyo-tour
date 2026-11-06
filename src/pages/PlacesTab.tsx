// 景點分頁：搜尋、依類型篩選、新增；每個景點顯示用在哪幾天
import { useState } from 'react';
import { store } from '../app/services.ts';
import { navigate } from '../app/router.ts';
import type { TripCtx } from '../app/tripContext.ts';
import type { PlaceKind } from '../data/types.ts';
import { placeUsage } from '../data/actions.ts';
import { daysBetween } from '../lib/dates.ts';
import { hhmm, KINDS, PLACE_KINDS, sortActivities } from '../lib/plan.ts';
import { Empty } from '../ui/kit.tsx';
import { Icon } from '../ui/icons.tsx';
import { Mascot } from '../ui/Mascot.tsx';

export function PlacesTab({ ctx }: { ctx: TripCtx }) {
  const { trip } = ctx;
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<PlaceKind | 'all'>('all');
  const all = store.byTrip('places', trip.id);
  const query = q.trim().toLowerCase();
  const list = all
    .filter((p) => kind === 'all' || p.kind === kind)
    .filter((p) => !query || [p.name, p.address, p.description, p.notes].some((x) => x.toLowerCase().includes(query)))
    .map((p) => ({ p, uses: sortActivities(placeUsage(store, p.id)) }))
    .sort((a, b) => {
      const da = a.uses[0] ? `${a.uses[0].date}${a.uses[0].start_time ?? '99'}` : '9999';
      const db = b.uses[0] ? `${b.uses[0].date}${b.uses[0].start_time ?? '99'}` : '9999';
      return da.localeCompare(db) || a.p.name.localeCompare(b.p.name, 'zh-Hant');
    });
  const kindsPresent = PLACE_KINDS.filter((k) => all.some((p) => p.kind === k));

  return (
    <div className="pad stack">
      <label className="input-row" style={{ background: 'var(--surface)', border: 'var(--border)', borderRadius: 999, padding: '0 14px', minHeight: 50 }}>
        <Icon.search />
        <input type="search" aria-label="搜尋景點" placeholder="搜尋景點、餐廳、廁所" value={q} onChange={(e) => setQ(e.target.value)}
          style={{ flex: '1 1 auto', minWidth: 0, border: 0, background: 'transparent', fontSize: 16, outline: 'none' }} />
      </label>
      {kindsPresent.length > 1 ? (
        <div className="chips" role="radiogroup" aria-label="類型">
          <button type="button" role="radio" aria-checked={kind === 'all'} className={`chip${kind === 'all' ? ' is-on' : ''}`}
            style={kind === 'all' ? { background: 'var(--butter)' } : undefined} onClick={() => setKind('all')}>全部</button>
          {kindsPresent.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className={`chip${kind === k ? ' is-on' : ''}`}
              style={{ background: KINDS[k].bg }} onClick={() => setKind(k)}>{KINDS[k].short}</button>
          ))}
        </div>
      ) : null}

      {list.length ? (
        <div className="stack-sm">
          {list.map(({ p, uses }) => {
            const first = uses[0];
            const detail = first
              ? `Day ${daysBetween(trip.start_date, first.date) + 1}${first.start_time ? `・${hhmm(first.start_time)}` : ''}${uses.length > 1 ? `・共 ${uses.length} 次` : ''}`
              : '還沒排進行程';
            return (
              <button key={p.id} type="button" className="act" style={{ background: KINDS[p.kind].bg }} onClick={() => navigate(`/t/${trip.id}/p/${p.id}`)}>
                <span className="act-main">
                  <span className="act-title">{p.name}</span>
                  <span className="act-sub" style={{ color: KINDS[p.kind].sub }}>{[p.address.trim(), detail].filter(Boolean).join('・')}</span>
                </span>
                <span className="act-tags"><span className="tag">{KINDS[p.kind].short}</span></span>
              </button>
            );
          })}
        </div>
      ) : (
        <Empty icon={<Mascot size={70} mood={all.length ? 'wow' : 'wink'} />} title={all.length ? '找不到符合的景點' : '還沒有景點'}>
          {all.length ? '換個關鍵字試試看。' : '在行程裡新增景點、餐廳時，會自動出現在這裡。也可以先按 ＋ 收藏想去的地方。'}
        </Empty>
      )}

      {ctx.editable ? (
        <button type="button" className="fab" aria-label="新增景點" onClick={() => navigate(`/t/${trip.id}/p/new`)}><Icon.plus /></button>
      ) : null}
    </div>
  );
}
