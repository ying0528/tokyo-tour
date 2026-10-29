// 用邀請連結加入旅行：選「我是誰」→ 加入。家人不需要註冊。
import { useEffect, useState } from 'react';
import { backend, remote, store, syncer, useSession } from '../app/services.ts';
import { navigate } from '../app/router.ts';
import { isStandalone } from '../app/pwa.ts';
import type { InvitePreview } from '../data/types.ts';
import { rangeLabel } from '../lib/dates.ts';
import { Button, Dot, Empty, Notice, Screen, TopBar } from '../ui/kit.tsx';
import { Icon } from '../ui/icons.tsx';

export function JoinPage({ token }: { token: string }) {
  const { user } = useSession();
  const [preview, setPreview] = useState<InvitePreview | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    remote.getInvite(token)
      .then((p) => { if (alive) setPreview(p); })
      .catch((e) => { if (alive) { setPreview(null); setError((e as Error).message); } });
    return () => { alive = false; };
  }, [token, user?.id]);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      if (!user) await backend.auth.signInAnonymously();
      const tripId = await remote.joinTrip(token, picked);
      await store.setMeta('active_trip', tripId);
      await syncer.sync();
      navigate(`/t/${tripId}/plan`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function loginFirst() {
    sessionStorage.setItem('pending-invite', token);
    navigate('/login');
  }

  if (preview === undefined) {
    return <Screen header={<TopBar title="加入旅行" />}><div className="pad center muted">讀取邀請中…</div></Screen>;
  }

  if (!preview) {
    return (
      <Screen header={<TopBar title="加入旅行" />}>
        <Empty icon={<Icon.link />} title="這個邀請連結無法使用"
          action={<Button onClick={() => navigate('/', { replace: true })}>回首頁</Button>}>
          {error ?? '連結可能已被停用，或旅行已刪除。請向規劃旅行的家人要新的連結。'}
        </Empty>
      </Screen>
    );
  }

  return (
    <Screen header={<TopBar title="加入旅行" />}>
      <div className="pad stack-lg">
        <div className="hero">
          <p className="hero-kicker">你被邀請加入</p>
          <h1 className="hero-title">{preview.title || '未命名旅行'}</h1>
          <p className="muted">{[preview.destination, rangeLabel(preview.start_date, preview.end_date)].filter(Boolean).join('・')}</p>
          <p className="muted small">{preview.role === 'editor' ? '加入後可以一起編輯行程' : '加入後可以查看行程（不能修改）'}</p>
        </div>

        {preview.already_member ? <Notice>你已經是這趟旅行的成員，可以重新選擇你是誰。</Notice> : null}

        <div className="stack">
          <h2 className="section-title">你是誰？</h2>
          <div className="choice-grid">
            {preview.travelers.map((t) => (
              <button key={t.id} type="button" className={`choice${picked === t.id ? ' is-on' : ''}`}
                aria-pressed={picked === t.id} onClick={() => setPicked(t.id)}>
                <Dot color={t.color} /> {t.name}
              </button>
            ))}
            <button type="button" className={`choice${picked === null ? ' is-on' : ''}`} aria-pressed={picked === null}
              onClick={() => setPicked(null)}>
              先不選
            </button>
          </div>
          <p className="muted small">選了之後，APP 會優先顯示你的行程和票券。之後可以在「設定」更改。</p>
        </div>

        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Button variant="primary" block busy={busy} onClick={join}>加入這趟旅行</Button>
        {!user ? (
          <button type="button" className="link-btn" onClick={loginFirst}>我有 Email 帳號，先登入</button>
        ) : null}
        {!isStandalone() ? (
          <Notice>
            想像 APP 一樣使用？加入後，用瀏覽器的「分享 → 加入主畫面」。從主畫面打開時若要求登入，
            再貼一次這個邀請連結即可。
          </Notice>
        ) : null}
      </div>
    </Screen>
  );
}
