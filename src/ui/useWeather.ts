// 某一天、某個地點的天氣。預報存在手機裡（離線也看得到上次的），每 3 小時、或打開 App 時自動更新
import { useEffect, useState } from 'react';
import { store, useData } from '../app/services.ts';
import { fetchForecast, type DayWeather, type Forecast, type Spot } from '../lib/weather.ts';

const STALE_MS = 3 * 60 * 60 * 1000;
const inflight = new Map<string, Promise<void>>();
const failedAt = new Map<string, number>();

function metaKey(spot: Spot) {
  return `weather:${spot.key}`;
}

async function refresh(spot: Spot, timezone: string) {
  const key = metaKey(spot);
  const busy = inflight.get(key);
  if (busy) return busy;
  const p = (async () => {
    try {
      const f = await fetchForecast(spot, timezone);
      // 保留已經過去的日子（預報只給今天以後的）
      const old = store.getMeta<Forecast>(key);
      await store.setMeta(key, { at: f.at, days: { ...(old?.days ?? {}), ...f.days } });
      failedAt.delete(key);
    } catch {
      failedAt.set(key, Date.now());
    }
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export type WeatherState =
  | { kind: 'ok'; day: DayWeather; at: number }
  | { kind: 'loading' }
  | { kind: 'later' }
  | { kind: 'offline' }
  | { kind: 'none' };

/** date：YYYY-MM-DD；today：旅行時區的今天 */
export function useWeather(spot: Spot, date: string, today: string, timezone: string): WeatherState {
  useData();
  const [, setTick] = useState(0);
  const key = metaKey(spot);
  const cached = store.getMeta<Forecast>(key);

  useEffect(() => {
    const check = () => {
      const c = store.getMeta<Forecast>(key);
      const stale = !c || Date.now() - c.at > STALE_MS;
      const recentlyFailed = Date.now() - (failedAt.get(key) ?? 0) < 60_000;
      if (stale && navigator.onLine && !recentlyFailed) void refresh(spot, timezone).then(() => setTick((n) => n + 1));
    };
    check();
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', check);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', check);
    };
  }, [key, timezone]);

  const day = cached?.days[date];
  if (day) return { kind: 'ok', day, at: cached!.at };
  // 預報最多 16 天：太遠的日子還沒有
  const daysAhead = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (daysAhead > 15) return { kind: 'later' };
  if (daysAhead < 0) return { kind: 'none' };
  if (inflight.has(key)) return { kind: 'loading' };
  if (!navigator.onLine || failedAt.has(key)) return { kind: 'offline' };
  return { kind: 'loading' };
}
