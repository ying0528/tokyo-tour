// 旅行主畫面：上方旅行名稱與同步狀態、下方四個分頁
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { store, syncer, useData, useSession, useSync } from '../app/services.ts';
import { navigate } from '../app/router.ts';
import { tripCtx } from '../app/tripContext.ts';
import { rangeLabel } from '../lib/dates.ts';
import { Button, Empty, Screen, TopBar } from '../ui/kit.tsx';
import { Icon } from '../ui/icons.tsx';
import { Mascot } from '../ui/Mascot.tsx';
import { SyncBadge } from '../ui/SyncBadge.tsx';
import { PlanTab } from './PlanTab.tsx';
import { ListsTab } from './Lists.tsx';
import { RoutesTab } from './Routes.tsx';
import { TicketsTab } from './TicketsTab.tsx';
import { SettingsTab } from './SettingsTab.tsx';

export type TabKey = 'plan' | 'lists' | 'routes' | 'tickets' | 'settings';

const TABS: { key: TabKey; label: string; icon: () => ReactNode }[] = [
  { key: 'plan', label: '行程', icon: Icon.plan },
  { key: 'lists', label: '清單', icon: Icon.note },
  { key: 'routes', label: '路線', icon: Icon.train },
  { key: 'tickets', label: '票券', icon: Icon.ticket },
  { key: 'settings', label: '旅伴・設定', icon: Icon.people },
];

export function TripShell({ tripId, tab, sub }: { tripId: string; tab: TabKey; sub?: string }) {
  useData();
  const sync = useSync();
  const { user } = useSession();
  const trip = store.get('trips', tripId);

  useEffect(() => {
    if (store.getMeta('active_trip') !== tripId) {
      void store.setMeta('active_trip', tripId).then(() => syncer.sync());
    }
  }, [tripId]);

  if (!trip || trip.deleted_at) {
    const loading = !trip && sync.status === 'syncing';
    return (
      <Screen header={<TopBar title="旅行" left={<button type="button" className="icon-btn" aria-label="我的旅行" onClick={() => navigate('/', { replace: true })}><Icon.back /></button>} />}>
        <Empty icon={<Mascot size={72} mood={loading ? 'happy' : 'wow'} />} title={loading ? '下載旅行資料中…' : trip?.deleted_at ? '這趟旅行在回收桶裡' : '找不到這趟旅行'}
          action={loading ? null : <Button onClick={() => navigate('/', { replace: true })}>回到我的旅行</Button>}>
          {loading ? null : '可能已被刪除，或你已不是成員。'}
        </Empty>
      </Screen>
    );
  }

  const ctx = tripCtx(trip, user);

  const header = (
    <TopBar
      title={trip.title || '未命名旅行'}
      subtitle={[trip.destination, rangeLabel(trip.start_date, trip.end_date)].filter(Boolean).join('・')}
      onTitleClick={() => navigate('/')}
      left={<button type="button" className="icon-btn" aria-label="我的旅行" onClick={() => navigate('/')}><Icon.home /></button>}
      right={<SyncBadge onClick={() => navigate('/sync')} />}
    />
  );

  const footer = (
    <nav className="tabbar five" aria-label="主要分頁">
      {TABS.map((t) => (
        <button key={t.key} type="button" className={`tab${t.key === tab ? ' is-on' : ''}`} aria-current={t.key === tab ? 'page' : undefined}
          onClick={() => navigate(`/t/${tripId}/${t.key}`, { replace: true })}>
          <t.icon />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );

  let body: ReactNode;
  if (tab === 'plan') body = <PlanTab ctx={ctx} date={sub} />;
  else if (tab === 'lists') body = <ListsTab ctx={ctx} />;
  else if (tab === 'routes') body = <RoutesTab ctx={ctx} date={sub} />;
  else if (tab === 'tickets') body = <TicketsTab ctx={ctx} />;
  else body = <SettingsTab trip={trip} />;

  return <Screen header={header} footer={footer} className={`has-tabbar${tab === 'routes' ? ' has-maps-btn' : ''}`}>{body}</Screen>;
}
