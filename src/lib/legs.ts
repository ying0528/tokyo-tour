// 路線：每天（分組的日子每組）相鄰兩個行程之間自動產生一段
import type { Activity, DayPlan, LegPlan, LegStep, RouteLeg, RouteStep } from '../data/types.ts';

/** 一段路線的所有方案（舊資料只有 steps 時當作一個方案） */
export function legPlans(leg: Pick<RouteLeg, 'plans' | 'steps'> | undefined): LegPlan[] {
  if (!leg) return [];
  if (leg.plans?.length) return leg.plans;
  return [{ id: 'main', label: '方案一', steps: leg.steps ?? [] }];
}

export function planLabel(p: LegPlan, i: number): string {
  return p.label.trim() || `方案${'一二三四五六七八九十'[i] ?? i + 1}`;
}
import { activityName, hhmm, isSplit, sortActivities, stableId, visibleIn } from './plan.ts';

/** 一段路線固定的 id（兩支手機各自建立也不會重複） */
export function legId(tripId: string, date: string, group: string, fromId: string, toId: string): string {
  return stableId(`leg:${tripId}:${date}:${group}:${fromId}:${toId}`);
}

export interface LegView {
  id: string;
  /** 已經存過的資料（還沒設定時是 undefined） */
  leg: RouteLeg | undefined;
  from: Activity | null;
  to: Activity | null;
  fromName: string;
  toName: string;
  /** 用來排序與顯示的時間（出發行程的時間） */
  time: string;
  /** 依行程自動產生的（不是自己加的） */
  auto: boolean;
}

export interface DayLegs {
  /** 這一組（或全員）這天的行程（不含舊的「移動」） */
  activities: Activity[];
  legs: LegView[];
  /** 按過「不需要」的 */
  dismissed: LegView[];
}

const nameOf = (a: Activity | null | undefined, fallback: string) => (a ? activityName(a, undefined) : fallback) || '（未命名）';

/**
 * 算出某天某組的所有路線。group：分組的日子是組別代號，沒分組是 ''。
 */
export function dayLegs(
  tripId: string,
  date: string,
  group: string,
  plan: DayPlan | undefined,
  allActivities: Activity[],
  allLegs: RouteLeg[],
): DayLegs {
  const split = isSplit(plan);
  const g = split ? group : '';
  const acts = sortActivities(allActivities.filter((a) => a.date === date && !a.deleted_at && a.kind !== 'move'
    && visibleIn(a, plan, split ? g : null, null)));
  const byId = new Map(acts.map((a) => [a.id, a]));
  // 分組的日子：自己那組的路線，加上全員共用的（例如從飯店出發）
  const rows = allLegs.filter((l) => l.date === date && !l.deleted_at && (l.group_key === g || (split && l.group_key === '')));
  const rowById = new Map(rows.map((l) => [l.id, l]));
  const used = new Set<string>();
  const legs: LegView[] = [];
  const dismissed: LegView[] = [];

  for (let i = 0; i + 1 < acts.length; i++) {
    const from = acts[i];
    const to = acts[i + 1];
    const own = legId(tripId, date, g, from.id, to.id);
    const leg = rowById.get(own)
      ?? (split ? rows.find((l) => l.group_key === '' && l.from_activity_id === from.id && l.to_activity_id === to.id) : undefined);
    const id = leg?.id ?? own;
    used.add(id);
    const view: LegView = { id, leg, from, to, fromName: nameOf(from, ''), toName: nameOf(to, ''), time: hhmm(leg?.start_time) || hhmm(from.start_time), auto: true };
    (leg?.dismissed ? dismissed : legs).push(view);
  }
  // 自己加的、或行程改過順序後留下來的
  for (const leg of rows) {
    if (used.has(leg.id)) continue;
    const from = leg.from_activity_id ? byId.get(leg.from_activity_id) ?? null : null;
    const to = leg.to_activity_id ? byId.get(leg.to_activity_id) ?? null : null;
    // 原本連到的行程已經不在了（刪掉或改到別天）：不顯示
    if ((leg.from_activity_id && !from) || (leg.to_activity_id && !to)) continue;
    if (!leg.custom && !leg.steps.length) continue;
    const view: LegView = {
      id: leg.id, leg, from, to,
      fromName: nameOf(from, leg.from_name), toName: nameOf(to, leg.to_name),
      time: hhmm(leg.start_time) || hhmm(from?.start_time), auto: false,
    };
    (leg.dismissed ? dismissed : legs).push(view);
  }
  const pos = (v: LegView) => {
    // 依出發行程在當天的位置排序；只有到達行程的排在它前面
    if (v.from) return acts.indexOf(v.from) + 0.5;
    if (v.to) return acts.indexOf(v.to) - 0.5;
    return v.time ? acts.findIndex((a) => hhmm(a.start_time) > v.time) - 0.5 : acts.length;
  };
  legs.sort((a, b) => pos(a) - pos(b));
  return { activities: acts, legs, dismissed };
}

/** 卡片上的一句話，例如「步行 › 銀座線 外苑前→澀谷 › 步行」 */
export function stepSummary(s: LegStep): string {
  if (s.mode === 'walk') return '步行';
  if (s.mode === 'rail' || s.mode === 'bus') {
    const route = s.from && s.to ? ` ${s.from}→${s.to}` : '';
    return `${s.line || (s.mode === 'bus' ? '公車' : '電車')}${route}`;
  }
  return s.line || '其他';
}

/** 舊版「移動」的交通步驟換成新的路線步驟 */
export function stepFromLegacy(s: RouteStep): LegStep {
  const note = [s.exit_info && `出口：${s.exit_info}`, s.transfer_info && `轉乘：${s.transfer_info}`, s.notes].filter(Boolean).join('\n');
  const mode = s.mode === 'subway' || s.mode === 'train' ? 'rail' : s.mode === 'bus' ? 'bus' : s.mode === 'walk' ? 'walk' : 'other';
  const otherLabel: Record<string, string> = { uber: 'Uber', taxi: '計程車', other: '其他' };
  return {
    id: s.id, mode, line: mode === 'other' ? (s.line || otherLabel[s.mode] || '其他') : s.line,
    from: s.from_stop, to: s.to_stop, direction: s.direction, note, stops: null,
  };
}

/** Google 地圖：兩個地點之間的路線 */
export function directionsUrl(origin: string, destination: string, mode: 'walking' | 'transit'): string {
  const p = new URLSearchParams({ api: '1', travelmode: mode });
  if (origin.trim()) p.set('origin', origin.trim());
  if (destination.trim()) p.set('destination', destination.trim());
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}

/** Google 地圖：搜尋一個地點（例如公車站牌） */
export function searchUrl(q: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q.trim())}`;
}
