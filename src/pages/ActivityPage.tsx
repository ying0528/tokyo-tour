// 行程詳情：標題列固定（返回、編輯），只有內容捲動；景點資訊、地圖、交通步驟、票券都在這裡
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { store, useData, useSession } from '../app/services.ts';
import { goBack, navigate } from '../app/router.ts';
import { myTickets, tripCtx } from '../app/tripContext.ts';
import { deleteActivity, getPrivateNote, linkLabel, liveSteps, restoreActivity, savePrivateNote } from '../data/actions.ts';
import type { RouteStep } from '../data/types.ts';
import { dayLabel, daysBetween } from '../lib/dates.ts';
import { activityName, hhmm, isTransit, KINDS, modeLabel } from '../lib/plan.ts';
import { safeUrl } from '../lib/links.ts';
import { BackButton, Button, Empty, Screen, TextArea, TopBar } from '../ui/kit.tsx';
import { Icon } from '../ui/icons.tsx';
import { Mascot } from '../ui/Mascot.tsx';
import { RichText } from '../ui/RichText.tsx';
import { TicketCard } from './TicketsTab.tsx';
import { confirmDialog, toast } from '../ui/dialog.tsx';

export function modeIcon(m: RouteStep['mode']): ReactNode {
  if (m === 'walk') return <Icon.walk />;
  if (m === 'bus') return <Icon.bus />;
  if (m === 'uber' || m === 'taxi') return <Icon.car />;
  return <Icon.train />;
}

export const MODE_BG: Record<RouteStep['mode'], string> = {
  subway: '#ff8fa3', train: '#ffd34d', bus: '#8fd3ff', walk: '#c6efd9', uber: '#e6d4ff', taxi: '#ffdcb0', other: '#e4e8f0',
};

export function StepView({ s }: { s: RouteStep }) {
  const transit = isTransit(s.mode);
  const title = s.line.trim() || modeLabel(s.mode);
  const fromTo = [s.from_stop.trim(), s.to_stop.trim()].filter(Boolean).join(' → ');
  const meta = [
    s.depart_time ? `${hhmm(s.depart_time)} 出發` : '',
    s.duration_min ? `約 ${s.duration_min} 分鐘` : '',
    s.cost ? `${s.cost}` : '',
  ].filter(Boolean).join('・');
  return (
    <div className="step">
      <span className="step-icon" style={{ background: MODE_BG[s.mode] }}>{modeIcon(s.mode)}</span>
      <div className="step-body">
        <span style={{ fontSize: 17 }}>{title}{s.line.trim() ? <span className="muted tiny">　{modeLabel(s.mode)}</span> : null}</span>
        {fromTo ? <span className="small muted">{fromTo}</span> : null}
        {transit && s.direction.trim() ? <span className="small muted">方向：{s.direction}</span> : null}
        {s.exit_info.trim() ? <span className="small muted">出口：{s.exit_info}</span> : null}
        {s.transfer_info.trim() ? <span className="small muted">轉乘：{s.transfer_info}</span> : null}
        {meta ? <span className="small muted">{meta}</span> : null}
        {s.notes.trim() ? <RichText text={s.notes} className="small" /> : null}
      </div>
    </div>
  );
}

function PrivateMemo({ tripId, activityId, userId }: { tripId: string; activityId: string; userId: string }) {
  const saved = getPrivateNote(store, activityId, userId)?.note ?? '';
  const [text, setText] = useState(saved);
  const [busy, setBusy] = useState(false);
  const dirty = text !== saved;
  useEffect(() => { setText(saved); }, [activityId]);

  async function save() {
    if (!dirty) return;
    setBusy(true);
    try {
      await savePrivateNote(store, tripId, activityId, userId, text);
      toast('備忘錄已儲存');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card stack-sm" style={{ background: '#fff8df' }}>
      <div className="section-head">
        <h2 className="section-title">我的備忘錄</h2>
        <span className="tiny muted">只有你自己看得到</span>
      </div>
      <TextArea value={text} onChange={setText} minRows={2} placeholder="想買的東西、想拍的照片、提醒自己的事…" />
      {dirty ? <Button variant="primary" busy={busy} onClick={save} style={{ alignSelf: 'flex-end', minHeight: 42 }}>儲存備忘錄</Button> : null}
    </div>
  );
}

export function ActivityPage({ tripId, activityId }: { tripId: string; activityId: string }) {
  useData();
  const { user } = useSession();
  const trip = store.get('trips', tripId);
  const a = store.get('activities', activityId);
  const back = () => goBack(`/t/${tripId}/plan${a ? `/${a.date}` : ''}`);

  if (!trip || !a || a.deleted_at) {
    return (
      <Screen header={<TopBar title="行程" left={<BackButton onClick={back} />} />}>
        <Empty icon={<Mascot size={72} mood="wow" />} title="找不到這筆行程">可能已在其他手機被刪除。</Empty>
      </Screen>
    );
  }

  const ctx = tripCtx(trip, user);
  const kind = KINDS[a.kind];
  const name = activityName(a, store.get('places', a.place_id));
  const steps = a.kind === 'move' ? liveSteps(store, a.id) : [];
  const dayN = daysBetween(trip.start_date, a.date) + 1;
  const map = a.map_url ? safeUrl(a.map_url) : null;
  const links = (a.links ?? []).filter((l) => safeUrl(l.url));
  const tickets = myTickets(ctx).filter((t) => t.activity_ids.includes(a.id)).sort((x, y) => x.sort_order - y.sort_order);

  async function remove() {
    const ok = await confirmDialog({
      title: `刪除「${name}」？`,
      message: steps.length ? '這筆行程和它的交通步驟會一起移到回收桶。票券不會被刪除。' : '這筆行程會被刪除，票券會保留。',
      confirmText: '刪除',
      danger: true,
    });
    if (!ok) return;
    await deleteActivity(store, a!.id);
    navigate(`/t/${tripId}/plan/${a!.date}`, { replace: true });
    toast('已刪除', 'ok', { label: '復原', run: () => { void restoreActivity(store, a!.id); } });
  }

  return (
    <Screen header={
      <TopBar title={`Day ${dayN}・${dayLabel(a.date)}`}
        left={<BackButton onClick={back} />}
        right={ctx.editable ? <Button variant="ghost" onClick={() => navigate(`/t/${tripId}/a/${a.id}/edit`)}>編輯</Button> : null} />
    }>
      <div className="pad stack">
        <div className="detail-hero" style={{ background: kind.bg }}>
          <span className="badge">{kind.label}</span>
          <h1 className="detail-title">{name}</h1>
          {a.start_time ? <span className="num" style={{ fontSize: 22 }}>{hhmm(a.start_time)}</span> : <span className="muted">時間未定</span>}
        </div>

        {a.notes.trim() ? (
          <div className="info-row"><Icon.note /><RichText text={a.notes} /></div>
        ) : null}

        {map || links.length ? (
          <div className="stack-sm">
            {map ? (
              <a className="btn btn-block" style={{ background: 'var(--mint)', boxShadow: 'var(--pop)', minHeight: 54, fontSize: 17 }} href={map} target="_blank" rel="noopener noreferrer">
                <Icon.place /> 打開地圖
              </a>
            ) : null}
            {links.map((l, i) => (
              <a key={i} className="btn btn-block" style={{ justifyContent: 'flex-start' }} href={safeUrl(l.url)!} target="_blank" rel="noopener noreferrer">
                <Icon.link /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{linkLabel(l)}</span>
              </a>
            ))}
          </div>
        ) : null}

        {a.kind === 'move' ? (
          <div className="stack-sm">
            <h2 className="section-title">怎麼去</h2>
            {steps.length ? (
              <div className="steps">{steps.map((s) => <StepView key={s.id} s={s} />)}</div>
            ) : (
              <p className="notice small">還沒有交通步驟。{ctx.editable ? '按右上角「編輯」加入。' : ''}</p>
            )}
          </div>
        ) : null}

        <div className="stack-sm">
          <div className="section-head">
            <h2 className="section-title">我的票券</h2>
            {ctx.editable ? (
              <button type="button" className="link-btn" onClick={() => navigate(`/t/${tripId}/tk/new/${a.id}`)}>＋ 加票券</button>
            ) : null}
          </div>
          {tickets.length ? tickets.map((t) => <TicketCard key={t.id} t={t} ctx={ctx} />) : (
            <p className="muted small">{ctx.myTravelerId ? '這筆行程沒有你的票券。' : '到「旅伴・設定」選「我是誰」，就會顯示你的票券。'}</p>
          )}
        </div>

        {user ? <PrivateMemo tripId={tripId} activityId={a.id} userId={user.id} /> : null}

        {ctx.editable ? (
          <Button variant="danger" block onClick={remove}><Icon.trash /> 刪除這筆行程</Button>
        ) : null}
      </div>
    </Screen>
  );
}
