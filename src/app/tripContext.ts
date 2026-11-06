// 目前這趟旅行的「我是誰、能做什麼、正在看哪一組」
import { useSyncExternalStore } from 'react';
import { canEditTrip, myMember, roleOf, store } from './services.ts';
import type { AuthUser } from '../data/remote.ts';
import type { DayPlan, Ticket, Traveler, Trip } from '../data/types.ts';
import { isSplit, ticketForTraveler, travelerGroup } from '../lib/plan.ts';
import { dayPlanOf } from '../data/actions.ts';

export interface TripCtx {
  trip: Trip;
  role: ReturnType<typeof roleOf>;
  editable: boolean;
  /** 能不能切換看其他組 */
  canSeeAll: boolean;
  myTravelerId: string | null;
  travelers: Traveler[];
}

export function tripCtx(trip: Trip, user: AuthUser | null): TripCtx {
  const member = myMember(trip.id, user?.id);
  const editable = canEditTrip(trip, user?.id);
  const travelers = store.byTrip('travelers', trip.id)
    .sort((a, b) => a.sort_order - b.sort_order || (a.created_at ?? '').localeCompare(b.created_at ?? ''));
  const mine = member?.traveler_id && travelers.some((t) => t.id === member.traveler_id) ? member.traveler_id : null;
  return {
    trip,
    role: roleOf(trip, user?.id),
    editable,
    canSeeAll: editable || Boolean(member?.see_all_groups) || trip.owner_id === user?.id,
    myTravelerId: mine,
    travelers,
  };
}

// 每一天選了看哪一組（只記在這次打開期間）
const chosen = new Map<string, string | null>();
const listeners = new Set<() => void>();
let version = 0;

export function setViewGroup(tripId: string, date: string, group: string | null) {
  chosen.set(`${tripId}:${date}`, group);
  version++;
  listeners.forEach((fn) => fn());
}

export function useViewVersion() {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => version);
}

export interface DayView {
  plan: DayPlan | undefined;
  split: boolean;
  /** 正在看的組；null＝全部 */
  group: string | null;
  myGroup: string | null;
  /** 能不能切換組別 */
  canSwitch: boolean;
}

export function dayView(ctx: TripCtx, date: string): DayView {
  const plan = dayPlanOf(store, ctx.trip.id, date);
  const split = isSplit(plan);
  const myGroup = travelerGroup(plan, ctx.myTravelerId);
  if (!split) return { plan, split, group: null, myGroup: null, canSwitch: false };
  const key = `${ctx.trip.id}:${date}`;
  if (!ctx.canSeeAll && myGroup) {
    // 一般旅伴：只看自己那組（還沒選身分或沒被分組時，可以自己切換）
    return { plan, split, group: myGroup, myGroup, canSwitch: false };
  }
  const picked = chosen.has(key) ? chosen.get(key)! : myGroup;
  // 分組的日子不提供「全部」：沒有選過就看自己那組，沒有組就看第一組
  const group = picked && plan!.groups.includes(picked) ? picked : myGroup ?? plan!.groups[0];
  return { plan, split, group, myGroup, canSwitch: true };
}

/** 我看得到的票券：只看自己的（持有人是我，或全員共用且我會參加） */
export function myTickets(ctx: TripCtx): Ticket[] {
  const tickets = store.byTrip('tickets', ctx.trip.id);
  if (!ctx.myTravelerId) return tickets.filter((t) => t.traveler_ids.length === 0);
  const acts = new Map(store.byTrip('activities', ctx.trip.id).map((a) => [a.id, a]));
  const plans = new Map(store.byTrip('day_plans', ctx.trip.id).map((p) => [p.date, p]));
  return tickets.filter((t) => ticketForTraveler(t, ctx.myTravelerId!, acts, plans));
}
