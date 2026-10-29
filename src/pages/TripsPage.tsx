// 我的旅行：列表、建立新旅行、封存、回收桶
import { useMemo, useState } from 'react';
import { remote, roleOf, signOut, store, syncer, useData, useSession } from '../app/services.ts';
import { navigate } from '../app/router.ts';
import type { Trip } from '../data/types.ts';
import { dayCount, rangeLabel, todayIn } from '../lib/dates.ts';
import { Badge, Button, Empty, List, Row, Screen, Section, TopBar } from '../ui/kit.tsx';
import { Icon } from '../ui/icons.tsx';
import { SyncBadge } from '../ui/SyncBadge.tsx';
import { confirmDialog, toast } from '../ui/dialog.tsx';

const ROLE_LABEL = { owner: '', editor: '可編輯', viewer: '只能查看' } as const;

export function TripsPage() {
  useData();
  const { user } = useSession();
  const [showArchived, setShowArchived] = useState(false);
  const [showBin, setShowBin] = useState(false);

  const { upcoming, past, archived, bin } = useMemo(() => {
    const trips = store.all('trips');
    const live = trips.filter((t) => !t.deleted_at && !t.archived_at);
    const isPast = (t: Trip) => t.end_date < todayIn(t.timezone);
    return {
      upcoming: live.filter((t) => !isPast(t)).sort((a, b) => a.start_date.localeCompare(b.start_date)),
      past: live.filter(isPast).sort((a, b) => b.start_date.localeCompare(a.start_date)),
      archived: trips.filter((t) => !t.deleted_at && t.archived_at).sort((a, b) => b.start_date.localeCompare(a.start_date)),
      bin: trips.filter((t) => t.deleted_at).sort((a, b) => (b.deleted_at ?? '').localeCompare(a.deleted_at ?? '')),
    };
  }, [store.version]);

  function open(t: Trip) {
    void store.setMeta('active_trip', t.id);
    navigate(`/t/${t.id}/plan`);
    void syncer.sync();
  }

  async function purge(t: Trip) {
    const ok = await confirmDialog({
      title: `永久刪除「${t.title || '未命名旅行'}」？`,
      message: '這趟旅行的所有行程、景點、票券和成員都會一起刪除，而且無法復原。',
      confirmText: '永久刪除',
      danger: true,
    });
    if (!ok) return;
    try {
      await remote.hardDelete('trips', t.id);
      await store.removeTripLocal(t.id);
      toast('已永久刪除');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function logout() {
    const pending = store.pending().length;
    const ok = await confirmDialog({
      title: '登出？',
      message: pending
        ? `還有 ${pending} 筆修改沒有上傳到雲端，登出後會遺失。建議先連上網路同步。`
        : '登出後，這支手機上的旅行資料會清除，重新登入就會再下載。',
      confirmText: '登出',
      danger: pending > 0,
    });
    if (ok) await signOut();
  }

  const card = (t: Trip) => {
    const role = roleOf(t, user?.id);
    const today = todayIn(t.timezone);
    const ongoing = t.start_date <= today && today <= t.end_date;
    return (
      <button key={t.id} type="button" className="trip-card" onClick={() => open(t)}>
        <span className="trip-card-top">
          <span className="trip-card-title">{t.title || '未命名旅行'}</span>
          {ongoing ? <Badge tone="accent">旅行中</Badge> : null}
          {role && role !== 'owner' ? <Badge>{ROLE_LABEL[role]}</Badge> : null}
        </span>
        <span className="trip-card-meta">
          {[t.destination, rangeLabel(t.start_date, t.end_date), `${dayCount(t.start_date, t.end_date)} 天`].filter(Boolean).join('・')}
        </span>
        {store.isPending('trips', t.id) ? <span className="trip-card-pending">待同步</span> : null}
      </button>
    );
  };

  const canCreate = user && !user.is_anonymous;

  return (
    <Screen header={<TopBar title="我的旅行" right={<SyncBadge onClick={() => navigate('/sync')} />} />}>
      <div className="pad stack-lg">
        {upcoming.length + past.length === 0 ? (
          <Empty icon={<Icon.sparkle />} title="還沒有旅行"
            action={canCreate ? <Button variant="primary" onClick={() => navigate('/new')}><Icon.plus /> 建立新旅行</Button> : null}>
            {canCreate ? '建立一趟旅行，輸入名稱、日期和同行者就可以開始。' : '請向家人要邀請連結。'}
          </Empty>
        ) : (
          <>
            {canCreate ? (
              <Button variant="primary" block onClick={() => navigate('/new')}><Icon.plus /> 建立新旅行</Button>
            ) : null}
            {upcoming.length ? <Section title="即將出發／進行中"><div className="stack">{upcoming.map(card)}</div></Section> : null}
            {past.length ? <Section title="已結束"><div className="stack">{past.map(card)}</div></Section> : null}
          </>
        )}

        {archived.length ? (
          <Section title={`已封存（${archived.length}）`}
            action={<button type="button" className="link-btn" onClick={() => setShowArchived(!showArchived)}>{showArchived ? '收起' : '顯示'}</button>}>
            {showArchived ? <div className="stack">{archived.map(card)}</div> : null}
          </Section>
        ) : null}

        {bin.length ? (
          <Section title={`回收桶（${bin.length}）`}
            action={<button type="button" className="link-btn" onClick={() => setShowBin(!showBin)}>{showBin ? '收起' : '顯示'}</button>}>
            {showBin ? (
              <List>
                {bin.map((t) => {
                  const isOwner = roleOf(t, user?.id) === 'owner';
                  return (
                    <Row key={t.id} title={t.title || '未命名旅行'} detail={rangeLabel(t.start_date, t.end_date)}
                      trailing={isOwner ? (
                        <span className="row-actions">
                          <Button variant="ghost" onClick={() => store.restore('trips', t.id)}>還原</Button>
                          <Button variant="text" className="danger" onClick={() => purge(t)}>永久刪除</Button>
                        </span>
                      ) : null} />
                  );
                })}
              </List>
            ) : null}
          </Section>
        ) : null}

        <Section title="帳號">
          <List>
            <Row leading={<Icon.user />} title={user?.email ?? '家人（訪客）'}
              detail={user?.is_anonymous ? '用邀請連結加入，不需要密碼' : undefined} />
            <Row leading={<Icon.logout />} title="登出" onClick={logout} />
          </List>
        </Section>
      </div>
    </Screen>
  );
}
