// 行程分頁：依旅行日期自動產生每天的分頁
import { useEffect, useRef } from 'react';
import { navigate } from '../app/router.ts';
import type { Trip } from '../data/types.ts';
import { dayLabel, todayIn, tripDays } from '../lib/dates.ts';
import { Empty } from '../ui/kit.tsx';
import { Icon } from '../ui/icons.tsx';

export function PlanTab({ trip, date }: { trip: Trip; date?: string }) {
  const days = tripDays(trip.start_date, trip.end_date);
  const today = todayIn(trip.timezone);
  const selected = date && days.includes(date) ? date : days.includes(today) ? today : days[0];
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [selected]);

  const index = days.indexOf(selected);

  return (
    <div className="plan">
      <div className="day-strip" ref={stripRef} role="tablist" aria-label="旅行日期">
        {days.map((d, i) => (
          <button key={d} type="button" role="tab" aria-selected={d === selected}
            className={`day-chip${d === selected ? ' is-on' : ''}${d === today ? ' is-today' : ''}`}
            onClick={() => navigate(`/t/${trip.id}/plan/${d}`, { replace: true })}>
            <span className="day-chip-n">第 {i + 1} 天</span>
            <span className="day-chip-d">{dayLabel(d)}</span>
          </button>
        ))}
      </div>

      <div className="pad stack">
        <div className="day-head">
          <h2 className="day-title">{dayLabel(selected)}</h2>
          <span className="muted small">第 {index + 1} 天{selected === today ? '・今天' : ''}</span>
        </div>
        <Empty icon={<Icon.plan />} title="這天還沒有行程">
          第一階段先完成旅行、同行者與家人共用。下一階段就能在這裡按「＋新增行程」，依時間自動排序。
        </Empty>
      </div>
    </div>
  );
}
