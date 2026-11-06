// 上方的日期列：Day 1 11/21（六）…
import { useEffect, useRef } from 'react';
import { dayLabel } from '../lib/dates.ts';

export function DayStrip({ days, selected, today, onPick }: {
  days: string[];
  selected: string;
  today: string;
  onPick: (d: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // 只橫向捲動日期列（scrollIntoView 在 iPhone 會連整頁一起往下捲，日期就被推到畫面外）
    const strip = ref.current;
    const el = strip?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (strip && el) strip.scrollLeft = Math.max(0, el.offsetLeft - (strip.clientWidth - el.offsetWidth) / 2);
  }, [selected]);
  return (
    <div className="day-strip" ref={ref} role="tablist" aria-label="旅行日期">
      {days.map((d, i) => (
        <button key={d} type="button" role="tab" aria-selected={d === selected}
          className={`day-chip${d === selected ? ' is-on' : ''}${d === today ? ' is-today' : ''}`}
          onClick={() => onPick(d)}>
          <span className="day-chip-n">Day {i + 1}</span>
          <span className="day-chip-d">{dayLabel(d)}</span>
        </button>
      ))}
    </div>
  );
}

/** 手機現在的日期 'YYYY-MM-DD' 與時間 'HH:MM' */
export function phoneNow(): { date: string; time: string } {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` };
}
