// 行程分頁：每天一個分頁（Day 1 11/21（六）…），依時間自動排序；分組的日子各看各的組
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { store } from '../app/services.ts';
import { navigate } from '../app/router.ts';
import { canEditGroup, dayView, myTickets, setViewGroup, useViewVersion } from '../app/tripContext.ts';
import type { TripCtx } from '../app/tripContext.ts';
import type { Activity } from '../data/types.ts';
import { tripDays } from '../lib/dates.ts';
import { dayLegs } from '../lib/legs.ts';
import type { LegView } from '../lib/legs.ts';
import { DayStrip, phoneNow } from '../ui/DayStrip.tsx';
import { FlatLeg } from './Routes.tsx';
import { activityName, groupName, hhmm, isForEveryone, sortActivities, visibleIn } from '../lib/plan.ts';
import { ActivityCard } from '../ui/ActivityCard.tsx';
import { Empty } from '../ui/kit.tsx';
import { Icon } from '../ui/icons.tsx';

/** 每分鐘更新一次，讓「現在／下一個」跟著時間走 */
function useMinute() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 60_000);
    return () => clearInterval(id);
  }, []);
}

function label(a: Activity) {
  return `${a.start_time ? `${hhmm(a.start_time)} ` : ''}${activityName(a, store.get('places', a.place_id))}`;
}

export function PlanTab({ ctx, date }: { ctx: TripCtx; date?: string }) {
  useViewVersion();
  useMinute();
  const { trip } = ctx;
  const days = tripDays(trip.start_date, trip.end_date);
  const now = phoneNow();
  const selected = date && days.includes(date) ? date : days.includes(now.date) ? now.date : days[0];
  const view = dayView(ctx, selected);
  const { plan } = view;
  const all = sortActivities(store.byTrip('activities', trip.id).filter((a) => a.date === selected));
  const shown = all.filter((a) => visibleIn(a, plan, view.group, view.group === view.myGroup ? ctx.myTravelerId : null));
  const mine = myTickets(ctx);
  const ticketCount = (id: string) => mine.filter((t) => t.activity_ids.includes(id)).length;
  // 設定好的路線插在兩個行程之間（字小、框扁）
  const group = view.split ? view.group ?? '' : '';
  const legs = dayLegs(trip.id, selected, group, plan, store.byTrip('activities', trip.id), store.byTrip('route_legs', trip.id))
    .legs.filter((v) => v.leg && v.leg.steps.length);
  const legAfter = new Map<string, LegView[]>();
  const legBefore = new Map<string, LegView[]>();
  const looseLegs: LegView[] = [];
  for (const v of legs) {
    if (v.from && shown.some((x) => x.id === v.from!.id)) legAfter.set(v.from.id, [...(legAfter.get(v.from.id) ?? []), v]);
    else if (v.to && shown.some((x) => x.id === v.to!.id)) legBefore.set(v.to.id, [...(legBefore.get(v.to.id) ?? []), v]);
    else looseLegs.push(v);
  }
  const openLeg = (v: LegView) => navigate(`/t/${trip.id}/leg/${v.id}`);
  const canAdd = canEditGroup(ctx, selected, view.split ? view.group : null);
  const outside = store.byTrip('activities', trip.id).filter((a) => a.date < trip.start_date || a.date > trip.end_date).length;

  // 提醒：依手機現在的日期與時間，顯示目前行程和下一個行程
  let reminder: ReactNode;
  const timed = shown.filter((a) => a.start_time);
  if (!shown.length) {
    reminder = <span>{all.length ? '這組這天沒有自己的行程' : canAdd ? '這天還沒有行程，按 ＋ 新增' : '這天還沒有行程'}</span>;
  } else if (selected === now.date) {
    const current = [...timed].reverse().find((a) => hhmm(a.start_time) <= now.time);
    const next = timed.find((a) => hhmm(a.start_time) > now.time);
    reminder = (
      <>
        {current ? <span><span className="now-dot" aria-hidden="true" />現在：{label(current)}</span> : <span>今天還沒開始</span>}
        {next ? <span className="muted">下一個：{label(next)}</span> : current ? <span className="muted">今天最後一個行程了</span> : null}
      </>
    );
  } else if (selected < now.date) {
    reminder = <span className="muted">這天已經過了，共 {shown.length} 個行程</span>;
  } else {
    const first = timed[0] ?? shown[0];
    reminder = (
      <>
        <span>這天第一個：{label(first)}</span>
        {shown.length > 1 ? <span className="muted">共 {shown.length} 個行程</span> : null}
      </>
    );
  }

  // 分組的日子：在「開始分開」與「重新會合」的地方加上提示
  const items: ReactNode[] = [];
  let prevShared = true;
  shown.forEach((a, i) => {
    const shared = isForEveryone(a);
    if (view.split && !shared && (i === 0 || prevShared)) {
      items.push(<div key={`s-${a.id}`} className="split-banner"><span className="pill-dark">{a.start_time ? `${hhmm(a.start_time)} ` : ''}分頭行動</span></div>);
    }
    if (view.split && shared && !prevShared) {
      items.push(<div key={`m-${a.id}`} className="split-banner"><span className="pill-dark">{a.start_time ? `${hhmm(a.start_time)} ` : ''}全員會合</span></div>);
    }
    prevShared = shared;
    for (const v of legBefore.get(a.id) ?? []) items.push(<FlatLeg key={`lb-${v.id}`} v={v} onClick={() => openLeg(v)} />);
    items.push(<ActivityCard key={a.id} a={a} ticketCount={ticketCount(a.id)} onClick={() => navigate(`/t/${trip.id}/a/${a.id}`)} />);
    for (const v of legAfter.get(a.id) ?? []) items.push(<FlatLeg key={`la-${v.id}`} v={v} onClick={() => openLeg(v)} />);
  });
  for (const v of looseLegs) items.push(<FlatLeg key={`lx-${v.id}`} v={v} onClick={() => openLeg(v)} />);

  return (
    <div className="plan">
      <DayStrip days={days} selected={selected} today={now.date} onPick={(d) => navigate(`/t/${trip.id}/plan/${d}`, { replace: true })} />

      <div className="pad stack">
        <div className="day-bar">
          <div className="bubble" aria-live="polite">{reminder}</div>
          {ctx.editable ? (
            <button type="button" className="btn btn-secondary" style={{ minHeight: 44, padding: '0 12px', fontSize: 14, flex: '0 0 auto', alignSelf: 'center' }}
              onClick={() => navigate(`/t/${trip.id}/day/${selected}`)}>
              {view.split ? '分組設定' : '這天設定'}
            </button>
          ) : null}
        </div>

        {view.split && view.canSwitch ? (
          <div className="segmented" role="radiogroup" aria-label="查看哪一組">
            {plan!.groups.map((g) => (
              <button key={g} type="button" role="radio" aria-checked={view.group === g} className={view.group === g ? 'is-on' : ''}
                onClick={() => setViewGroup(trip.id, selected, g)}>
                {groupName(plan, g)}{view.myGroup === g ? '（我）' : ''}
              </button>
            ))}
          </div>
        ) : view.split && view.group ? (
          <div className="row-wrap"><span className="badge badge-ok">今天：{groupName(plan, view.group)}</span></div>
        ) : null}

        {shown.length ? (
          <div className="stack">{items}</div>
        ) : (
          <Empty title={all.length ? '這組這天沒有自己的行程' : '這天還沒有行程'}>
            {all.length ? '切換到其他組可以看到他們的行程。' : canAdd ? '按右下角的 ＋ 新增第一筆。' : null}
          </Empty>
        )}

        {outside > 0 && selected === days[0] ? (
          <p className="notice notice-warn small">有 {outside} 筆行程的日期不在旅行日期內，改回範圍內才會顯示。</p>
        ) : null}
      </div>

      {canAdd ? (
        <button type="button" className="fab" aria-label="新增行程" onClick={() => navigate(`/t/${trip.id}/new/${selected}`)}>
          <Icon.plus />
        </button>
      ) : null}
    </div>
  );
}
