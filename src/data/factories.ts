// 建立新資料時的預設值（id 由手機產生，離線也能新增）
import type { Activity, DayPlan, ListCheck, Place, PrivateNote, RouteLeg, RouteStep, Ticket, Traveler, Trip, TripList } from './types.ts';

const base = () => ({
  id: crypto.randomUUID(),
  deleted_at: null,
  created_at: null,
  updated_at: null,
  updated_by: null,
  rev: 0,
});

export function newTrip(ownerId: string, fields: Partial<Trip> & Pick<Trip, 'start_date' | 'end_date'>): Trip {
  return {
    ...base(),
    owner_id: ownerId,
    title: '',
    destination: '',
    timezone: 'Asia/Tokyo',
    cover_path: null,
    notes: '',
    settings: {},
    archived_at: null,
    ...fields,
  };
}

export const TRAVELER_COLORS = ['#e2725b', '#3d8f8a', '#d9a521', '#6a6fc4', '#c2577f', '#5f9e4c', '#8a6d5a', '#4a8bd6'];

export function newTraveler(tripId: string, fields: Partial<Traveler> = {}): Traveler {
  return { ...base(), trip_id: tripId, name: '', color: TRAVELER_COLORS[0], sort_order: 0, notes: '', ...fields };
}

export function newPlace(tripId: string, fields: Partial<Place> = {}): Place {
  return {
    ...base(), trip_id: tripId, name: '', kind: 'sight', address: '', map_url: '',
    description: '', notes: '', image_path: null, ...fields,
  };
}

export function newActivity(tripId: string, fields: Partial<Activity> & Pick<Activity, 'date'>): Activity {
  return {
    ...base(), trip_id: tripId, start_time: null, duration_min: null, kind: 'sight', place_id: null,
    title: '', from_name: '', to_name: '', cost: null, currency: '', notes: '',
    audience_groups: [], audience_travelers: [], map_url: '', links: [], images: [], after_activity_id: null, ...fields,
  };
}

export function newRouteStep(tripId: string, activityId: string, fields: Partial<RouteStep> = {}): RouteStep {
  return {
    ...base(), trip_id: tripId, activity_id: activityId, sort_order: 0, mode: 'subway', line: '', direction: '',
    from_stop: '', to_stop: '', exit_info: '', transfer_info: '', depart_time: null, duration_min: null,
    cost: null, notes: '', ...fields,
  };
}

export function newDayPlan(tripId: string, date: string, id: string, fields: Partial<DayPlan> = {}): DayPlan {
  return {
    ...base(), id, trip_id: tripId, date, mode: 'together', groups: ['A', 'B'], assignments: {},
    group_names: {}, title: '', notes: '', ...fields,
  };
}

export function newTicket(tripId: string, fields: Partial<Ticket> = {}): Ticket {
  return {
    ...base(), trip_id: tripId, title: '', kind: '', file_path: null, file_type: null, file_size: null,
    traveler_ids: [], activity_ids: [], sort_order: 0, notes: '', ...fields,
  };
}

export function newPrivateNote(tripId: string, activityId: string, userId: string, id: string, note: string): PrivateNote {
  return { ...base(), id, trip_id: tripId, activity_id: activityId, user_id: userId, note };
}

export function newList(tripId: string, ownerId: string, fields: Partial<TripList> = {}): TripList {
  return { ...base(), trip_id: tripId, owner_id: ownerId, title: '', icon: '', shared: false, sort_order: 0, items: [], ...fields };
}

export function newListCheck(tripId: string, listId: string, userId: string, id: string, checked: string[]): ListCheck {
  return { ...base(), id, trip_id: tripId, list_id: listId, user_id: userId, checked };
}

export function newLeg(tripId: string, fields: Partial<RouteLeg> & Pick<RouteLeg, 'date'>): RouteLeg {
  return {
    ...base(), trip_id: tripId, group_key: '', from_activity_id: null, to_activity_id: null, from_name: '', to_name: '',
    start_time: null, custom: false, dismissed: false, steps: [], plans: [], notes: '', ...fields,
  };
}
