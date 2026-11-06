// 行程分頁：每天一個分頁（Day 1 11/21（六）…），依時間自動排序；分組的日子各看各的
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { store } from '../app/services.ts';
import { navigate } from '../app/router.ts';
import { dayView, setViewGroup, useViewVersion } from '../app/tripContext.ts';
import type { TripCtx } from '../app/tripContext.ts';
import type { Activity } from '../data/types.ts';
import { dayPlanOf } from '../data/actions.ts';
import { dayLabel, todayIn, tripDays } from '../lib/dates.ts';
import { activityName, groupName, hhmm, isForEveryone, sortActivities, visibleIn } from '../lib/plan.ts';
import { ActivityCard } from '../ui/ActivityCard.tsx';
import { Empty } from '../ui/kit.tsx';
import { Icon } from '../ui/icons.tsx';
import { Mascot } from '../ui/Mascot.tsx';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return '早安';
  if (h < 17) return '午安';
  return '晚安';
}

export function PlanTab({ ctx, date }: { ctx: TripCtx; date?: string }) {
  useViewVersion();
  const { trip } = ctx;
  const days = tripDays(trip.start_date, trip.end_date);
  const today = todayIn(trip.timezone);
  const selected = date && days.includes(date) ? date : days.includes(today) ? today : days[0];
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [selected]);

  const view = dayView(ctx, selected);
  const { plan } = view;
  const all = sortActivities(store.byTrip('activities', trip.id).filter((a) => a.date === selected));
  const shown = all.filter((a) => visibleIn(a, plan, view.group, view.group === view.myGroup ? ctx.myTravelerId : null));
  const me = ctx.travelers.find((t) => t.id === ctx.myTravelerId);
  const index = days.indexOf(selected);
  const outside = store.byTrip('activities', trip.id).filter((a) => a.date < trip.start_date || a.date > trip.end_date).length;

  // 吉祥物要說的話
  let say: ReactNode;
  const firstTimed = shown.find((a) => a.start_time);
  if (!all.length) {
    say = ctx.editable ? <>這天還沒有行程，按右下角的 ＋ 新增第一筆吧！</> : <>這天還沒有行程喔。</>;
  } else if (view.split && view.myGroup) {
    const rejoin = shown.find((a, i) => isForEveryone(a) && shown.slice(0, i).some((b) => !isForEveryone(b)));
    say = (
      <>
        {me?.name ? `${me.name}${greeting()}！` : ''}今天是<b>{groupName(plan, view.myGroup)}</b>
        {rejoin?.start_time ? `，${hhmm(rejoin.start_time)} ${activityName(rejoin, store.get('places', rejoin.place_id))}會合喔` : ''}
      </>
    );
  } else if (view.split && !ctx.myTravelerId) {
    say = <>這天分組行動！到「旅伴・設定」選「我是誰」，就只會看到你那組。</>;
  } else if (firstTimed) {
    say = <>{me?.name ? `${me.name}${greeting()}！` : ''}今天第一站：{hhmm(firstTimed.start_time)} {activityName(firstTimed, store.get('places', firstTimed.place_id))}</>;
  } else {
    say = <>{me?.name ? `${me.name}${greeting()}！` : ''}今天有 {shown.length} 個行程。</>;
  }

  // 分組的日子：在「開始分開」與「重新會合」的地方加上提示
  const items: ReactNode[] = [];
  let prevShared = true;
  shown.forEach((a: Activity, i) => {
    const shared = isForEveryone(a);
    if (view.split && i > 0 && prevShared && !shared) {
      items.push(<div key={`s-${a.id}`} className="split-banner"><span className="pill-dark">{a.start_time ? `${hhmm(a.start_time)} ` : ''}分頭行動</span></div>);
    } else if (view.split && i === 0 && !shared) {
      items.push(<div key={`s-${a.id}`} className="split-banner"><span className="pill-dark">分頭行動</span></div>);
    }
    if (view.split && shared && !prevShared) {
      items.push(<div key={`m-${a.id}`} className="split-banner"><span className="pill-dark">{a.start_time ? `${hhmm(a.start_time)} ` : ''}全員會合</span></div>);
    }
    prevShared = shared;
    items.push(
      <ActivityCard key={a.id} a={a} plan={plan} travelers={ctx.travelers} onClick={() => navigate(`/t/${trip.id}/a/${a.id}`)} />,
    );
  });

  const hidden = all.length - shown.length;
  const dayTitle = (dayPlanOf(store, trip.id, selected)?.title ?? '').trim();

  return (
    <div className="plan">
      <div className="day-strip" ref={stripRef} role="tablist" aria-label="旅行日期">
        {days.map((d, i) => {
          const [, m, dd] = d.split('-').map(Number);
          const label = dayLabel(d).replace(/^\d+\/\d+/, `${m}/${dd}`);
          return (
            <button key={d} type="button" role="tab" aria-selected={d === selected}
              className={`day-chip${d === selected ? ' is-on' : ''}${d === today ? ' is-today' : ''}`}
              onClick={() => navigate(`/t/${trip.id}/plan/${d}`, { replace: true })}>
              <span className="day-chip-n">Day {i + 1}</span>
              <span className="day-chip-d">{label}</span>
            </button>
          );
        })}
      </div>

      <div className="pad stack">
        <div className="day-head">
          <h2 className="day-title">{dayTitle || `Day ${index + 1}`}</h2>
          <span className="row-wrap">
            {selected === today ? <span className="badge badge-accent">今天</span> : null}
            {ctx.editable ? (
              <button type="button" className="btn btn-secondary" style={{ minHeight: 40, padding: '0 12px', fontSize: 14 }}
                onClick={() => navigate(`/t/${trip.id}/day/${selected}`)}>
                {view.split ? '分組設定' : '這天設定'}
              </button>
            ) : null}
          </span>
        </div>

        <div className="mascot-row">
          <Mascot size={54} mood={all.length ? 'happy' : 'wink'} />
          <div className="bubble">{say}</div>
        </div>

        {view.split && view.canSwitch ? (
          <div className="segmented" role="radiogroup" aria-label="查看哪一組">
            <button type="button" role="radio" aria-checked={view.group === null} className={view.group === null ? 'is-on' : ''}
              onClick={() => setViewGroup(trip.id, selected, null)}>全部</button>
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
        ) : all.length ? (
          <Empty title="這組這天沒有自己的行程">切換到「全部」可以看到其他組。</Empty>
        ) : null}

        {hidden > 0 && view.group !== null ? (
          <p className="muted tiny center">另外有 {hidden} 筆是其他組的行程</p>
        ) : null}
        {outside > 0 && index === 0 ? (
          <p className="notice notice-warn small">有 {outside} 筆行程的日期不在旅行日期內，改回範圍內才會顯示。</p>
        ) : null}
      </div>

      {ctx.editable ? (
        <button type="button" className="fab" aria-label="新增行程" onClick={() => navigate(`/t/${trip.id}/new/${selected}`)}>
          <Icon.plus />
        </button>
      ) : null}
    </div>
  );
}
