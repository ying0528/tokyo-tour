import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { backend, boot, store, useSession } from './services.ts';
import { navigate, useRoute } from './router.ts';
import { applyUpdate, useUpdateReady } from './pwa.ts';
import { DialogHost } from '../ui/dialog.tsx';
import { LoginPage, ResetPasswordPage, SetupNeededPage } from '../pages/AuthPages.tsx';
import { JoinPage } from '../pages/JoinPage.tsx';
import { TripsPage } from '../pages/TripsPage.tsx';
import { TripFormPage } from '../pages/TripFormPage.tsx';
import { TripShell } from '../pages/TripShell.tsx';
import type { TabKey } from '../pages/TripShell.tsx';
import { TravelerPage } from '../pages/TravelerPage.tsx';
import { MembersPage } from '../pages/MembersPage.tsx';
import { SyncPage } from '../pages/SyncPage.tsx';
import { ActivityPage } from '../pages/ActivityPage.tsx';
import { ActivityForm } from '../pages/ActivityForm.tsx';
import { DayPage } from '../pages/DayPage.tsx';
import { PlaceForm, PlacePage } from '../pages/PlacePage.tsx';
import { ListItemForm, ListPage } from '../pages/Lists.tsx';
import { LegForm, LegPage, MapViewPage } from '../pages/Routes.tsx';
import { TicketForm, TicketPage } from '../pages/TicketPage.tsx';
import { CopyTripPage } from '../pages/CopyTripPage.tsx';
import { Mascot } from '../ui/Mascot.tsx';

const TAB_KEYS: TabKey[] = ['plan', 'lists', 'routes', 'tickets', 'settings'];
let openedLastTrip = false;

function Redirect({ to }: { to: string }) {
  useEffect(() => { navigate(to, { replace: true }); }, [to]);
  return null;
}

function Routes() {
  const route = useRoute();
  const { user, recovery } = useSession();
  const [a, b, c, d, e] = route;

  if (recovery && user) return <ResetPasswordPage />;
  if (a === 'join' && b) return <JoinPage token={b} />;
  if (!user) return <LoginPage />;
  if (a === 'login') return <Redirect to="/" />;

  if (!a) {
    // 打開 APP 時直接進入上次看的旅行
    if (!openedLastTrip) {
      openedLastTrip = true;
      const last = store.getMeta<string>('active_trip');
      const trip = last ? store.get('trips', last) : undefined;
      if (trip && !trip.deleted_at && !trip.archived_at) return <Redirect to={`/t/${trip.id}/plan`} />;
    }
    return <TripsPage />;
  }
  openedLastTrip = true;
  if (a === 'new') return user.is_anonymous ? <Redirect to="/" /> : <TripFormPage />;
  if (a === 'sync') return <SyncPage />;
  if (a === 'restore') return user.is_anonymous ? <Redirect to="/" /> : <CopyTripPage />;
  if (a === 't' && b) {
    if (c === 'edit') return <TripFormPage tripId={b} />;
    if (c === 'members') return <MembersPage tripId={b} />;
    if (c === 'travelers' && d) return <TravelerPage tripId={b} travelerId={d} />;
    if (c === 'copy') return <CopyTripPage tripId={b} />;
    if (c === 'new' && d) return <ActivityForm tripId={b} date={d} />;
    if (c === 'a' && d) return e === 'edit' ? <ActivityForm tripId={b} activityId={d} /> : <ActivityPage tripId={b} activityId={d} />;
    if (c === 'day' && d) return <DayPage tripId={b} date={d} />;
    if (c === 'p' && d === 'new') return <PlaceForm tripId={b} />;
    if (c === 'p' && d) return e === 'edit' ? <PlaceForm tripId={b} placeId={d} /> : <PlacePage tripId={b} placeId={d} />;
    if (c === 'l' && d && e === 'i') return <ListItemForm tripId={b} listId={d} itemId={route[5] && route[5] !== 'new' ? route[5] : undefined} />;
    if (c === 'l' && d) return <ListPage tripId={b} listId={d} />;
    if (c === 'leg' && d) return e === 'edit' ? <LegForm key={d} tripId={b} legId={d} /> : <LegPage tripId={b} legId={d} />;
    if (c === 'map' && d) return <MapViewPage tripId={b} mapId={d} />;
    if (c === 'places') return <Redirect to={`/t/${b}/lists`} />;
    if (c === 'tk' && d === 'new') return <TicketForm tripId={b} activityId={e} />;
    if (c === 'tk' && d) return e === 'edit' ? <TicketForm tripId={b} ticketId={d} /> : <TicketPage tripId={b} ticketId={d} />;
    const tab = (TAB_KEYS as string[]).includes(c ?? '') ? (c as TabKey) : 'plan';
    return <TripShell tripId={b} tab={tab} sub={d} />;
  }
  return <Redirect to="/" />;
}

function UpdateBanner() {
  const ready = useUpdateReady();
  if (!ready) return null;
  return (
    <button type="button" className="update-banner" onClick={applyUpdate}>
      有新版本，點這裡更新
    </button>
  );
}

export function App() {
  const { ready } = useSession();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!backend.configured) return;
    boot().catch((e) => setError(String((e as Error)?.message ?? e)));
  }, []);

  let content: ReactNode;
  if (!backend.configured) content = <SetupNeededPage />;
  else if (error) content = <div className="boot-error">無法開啟手機上的資料：{error}<br />請確認沒有使用無痕模式。</div>;
  else if (!ready) content = <div className="boot"><Mascot size={80} />家庭旅行</div>;
  else content = <Routes />;

  return (
    <>
      <UpdateBanner />
      {content}
      <DialogHost />
    </>
  );
}
