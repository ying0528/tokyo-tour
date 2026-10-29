// 建立新資料時的預設值（id 由手機產生，離線也能新增）
import type { Activity, Place, RouteStep, Traveler, Trip } from './types.ts';

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
    audience_groups: [], audience_travelers: [], ...fields,
  };
}

export function newRouteStep(tripId: string, activityId: string, fields: Partial<RouteStep> = {}): RouteStep {
  return {
    ...base(), trip_id: tripId, activity_id: activityId, sort_order: 0, mode: 'subway', line: '', direction: '',
    from_stop: '', to_stop: '', exit_info: '', transfer_info: '', depart_time: null, duration_min: null,
    cost: null, notes: '', ...fields,
  };
}
