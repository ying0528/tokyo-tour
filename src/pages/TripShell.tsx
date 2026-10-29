// 旅行主畫面：上方旅行名稱與同步狀態、下方四個分頁
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { store, syncer, useData, useSync } from '../app/services.ts';
import { navigate } from '../app/router.ts';
import { rangeLabel } from '../lib/dates.ts';
import { Button, Empty, Screen, TopBar } from '../ui/kit.tsx';
import { Icon } from '../ui/icons.tsx';
import { SyncBadge } from '../ui/SyncBadge.tsx';
import { PlanTab } from './PlanTab.tsx';
import { SettingsTab } from './SettingsTab.tsx';

export type TabKey = 'plan' | 'places' | 'tickets' | 'settings';

const TABS: { key: TabKey; label: string; icon: () => ReactNode }[] = [
  { key: 'plan', label: '行程', icon: Icon.plan },
  { key: 'places', label: '景點', icon: Icon.place },
  { key: 'tickets', label: '票券', icon: Icon.ticket },
  { key: 'settings', label: '設定', icon: Icon.settings },
];

export function TripShell({ tripId, tab, sub }: { tripId: string; tab: TabKey; sub?: string }) {
  useData();
  const sync = useSync();
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
        <Empty title={loading ? '下載旅行資料中…' : trip?.deleted_at ? '這趟旅行在回收桶裡' : '找不到這趟旅行'}
          action={loading ? null : <Button onClick={() => navigate('/', { replace: true })}>回到我的旅行</Button>}>
          {loading ? null : '可能已被刪除，或你已不是成員。'}
        </Empty>
      </Screen>
    );
  }

  const header = (
    <TopBar
      title={trip.title || '未命名旅行'}
      subtitle={[trip.destination, rangeLabel(trip.start_date, trip.end_date)].filter(Boolean).join('・')}
      onTitleClick={() => navigate('/')}
      left={<button type="button" className="icon-btn" aria-label="切換旅行" onClick={() => navigate('/')}><Icon.swap /></button>}
      right={<SyncBadge onClick={() => navigate('/sync')} />}
    />
  );

  const footer = (
    <nav className="tabbar" aria-label="主要分頁">
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
  if (tab === 'plan') body = <PlanTab trip={trip} date={sub} />;
  else if (tab === 'settings') body = <SettingsTab trip={trip} />;
  else body = (
    <Empty icon={tab === 'places' ? <Icon.place /> : <Icon.ticket />} title={tab === 'places' ? '景點資料' : '電子票券'}>
      {tab === 'places'
        ? '下一階段加入：直接在手機新增景點、餐廳、住宿，並和行程自動連結。'
        : '之後的階段加入：手機拍照或上傳票券，依旅伴和行程顯示。'}
    </Empty>
  );

  return <Screen header={header} footer={footer} className="has-tabbar">{body}</Screen>;
}
