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

const TAB_KEYS: TabKey[] = ['plan', 'places', 'tickets', 'settings'];
let openedLastTrip = false;

function Redirect({ to }: { to: string }) {
  useEffect(() => { navigate(to, { replace: true }); }, [to]);
  return null;
}

function Routes() {
  const route = useRoute();
  const { user, recovery } = useSession();
  const [a, b, c, d] = route;

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
  if (a === 't' && b) {
    if (c === 'edit') return <TripFormPage tripId={b} />;
    if (c === 'members') return <MembersPage tripId={b} />;
    if (c === 'travelers' && d) return <TravelerPage tripId={b} travelerId={d} />;
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
  else if (!ready) content = <div className="boot">家庭旅行</div>;
  else content = <Routes />;

  return (
    <>
      <UpdateBanner />
      {content}
      <DialogHost />
    </>
  );
}
