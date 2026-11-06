// 票券：全螢幕看圖（點一下放大）、PDF 開啟、編輯（拍照或上傳、持有人、連到哪些行程）
import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { store, useData, useSession } from '../app/services.ts';
import { goBack, navigate } from '../app/router.ts';
import { canAddTicket, canEditTicket, tripCtx } from '../app/tripContext.ts';
import { saveTicket } from '../data/actions.ts';
import type { TicketDraft } from '../data/actions.ts';
import { dayLabel, daysBetween, tripDays } from '../lib/dates.ts';
import { activityName, hhmm, sortActivities } from '../lib/plan.ts';
import { formatSize, prepareUpload } from '../lib/image.ts';
import { useFileUrl } from '../ui/useFile.ts';
import { BackButton, Button, Empty, Field, Screen, TextArea, TopBar } from '../ui/kit.tsx';
import { Icon } from '../ui/icons.tsx';
import { Mascot } from '../ui/Mascot.tsx';
import { RichText } from '../ui/RichText.tsx';
import { linkedActivities } from './TicketsTab.tsx';
import { confirmDialog, toast } from '../ui/dialog.tsx';

const KIND_PRESETS = ['樂園門票', '機票', '車票', '餐廳訂位', '景點門票', '其他'];

/** 新票券預設是自己的（只有持有人看得到） */
function defaultHolder(tripId: string, userId: string | undefined): string[] {
  const trip = store.get('trips', tripId);
  if (!trip || !userId) return [];
  const me = tripCtx(trip, { id: userId, email: null, is_anonymous: false }).myTravelerId;
  return me ? [me] : [];
}

export function TicketPage({ tripId, ticketId }: { tripId: string; ticketId: string }) {
  useData();
  const { user } = useSession();
  const trip = store.get('trips', tripId);
  const t = store.get('tickets', ticketId);
  const [zoom, setZoom] = useState(false);
  const file = useFileUrl(t?.file_path);
  const back = () => goBack(`/t/${tripId}/tickets`);
  if (!trip || !t || t.deleted_at) {
    return <Screen header={<TopBar title="票券" left={<BackButton onClick={back} />} />}><Empty icon={<Mascot size={72} mood="wow" />} title="找不到這張票券" /></Screen>;
  }
  const ctx = tripCtx(trip, user);
  const acts = linkedActivities(t);
  const holders = t.traveler_ids.map((id) => ctx.travelers.find((x) => x.id === id)?.name).filter(Boolean);

  async function remove() {
    const ok = await confirmDialog({ title: `刪除「${t!.title}」？`, message: '連到的行程不會被刪除。', confirmText: '刪除', danger: true });
    if (!ok) return;
    await store.softDelete('tickets', t!.id);
    toast('已刪除', 'ok', { label: '復原', run: () => { void store.restore('tickets', t!.id); } });
    navigate(`/t/${tripId}/tickets`, { replace: true });
  }

  return (
    <Screen header={
      <TopBar title={t.title} subtitle={holders.length ? holders.join('、') : '全員共用'} left={<BackButton onClick={back} />}
        right={canEditTicket(ctx, t) ? <Button variant="ghost" onClick={() => navigate(`/t/${tripId}/tk/${t.id}/edit`)}>編輯</Button> : null} />
    }>
      <div className="stack">
        {t.file_type === 'image' ? (
          <div className={`ticket-view${zoom ? ' zoom' : ''}`} style={{ overflow: 'auto', maxHeight: '70dvh' }}>
            {file.url ? (
              <button type="button" onClick={() => setZoom(!zoom)} aria-label={zoom ? '縮小' : '放大'} style={{ border: 0, padding: 0, background: 'none', cursor: zoom ? 'zoom-out' : 'zoom-in', display: 'block', width: zoom ? 'auto' : '100%' }}>
                <img src={file.url} alt={`${t.title} 的票券圖片`} />
              </button>
            ) : (
              <p style={{ color: '#fff', padding: 40, textAlign: 'center' }}>
                {file.state === 'loading' ? '讀取中…' : file.state === 'offline' ? '這張還沒下載到手機，連上網路後再打開一次。' : '圖片還在上傳中或找不到。'}
              </p>
            )}
          </div>
        ) : null}
        <div className="pad stack" style={{ paddingTop: t.file_type === 'image' ? 0 : 14 }}>
          {t.file_type === 'image' && file.url ? <p className="muted tiny center">點圖片可以放大，入場時把螢幕亮度調高</p> : null}
          {t.file_type === 'pdf' ? (
            file.url ? (
              <a className="btn btn-primary btn-block" href={file.url} target="_blank" rel="noopener noreferrer"><Icon.ticket /> 打開 PDF</a>
            ) : <p className="notice small">{file.state === 'loading' ? '讀取中…' : 'PDF 還沒下載到手機，連上網路後再打開一次。'}</p>
          ) : null}
          {!t.file_path ? <p className="notice small">還沒有圖片。{canEditTicket(ctx, t) ? '按「編輯」拍照或上傳。' : ''}</p> : null}
          {t.kind.trim() ? <div className="row-wrap"><span className="badge">{t.kind}</span>{t.file_size ? <span className="muted tiny">{formatSize(t.file_size)}</span> : null}</div> : null}
          {t.notes.trim() ? <div className="info-row"><Icon.note /><RichText text={t.notes} /></div> : null}
          <div className="stack-sm">
            <h2 className="section-title">連到的行程</h2>
            {acts.length ? acts.map((a) => (
              <button key={a.id} type="button" className="act" onClick={() => navigate(`/t/${tripId}/a/${a.id}`)}>
                <span className="act-time">{a.start_time ? hhmm(a.start_time) : '未定'}</span>
                <span className="act-main">
                  <span className="act-title">{activityName(a, store.get('places', a.place_id))}</span>
                  <span className="act-sub muted">Day {daysBetween(trip.start_date, a.date) + 1}・{dayLabel(a.date)}</span>
                </span>
              </button>
            )) : <p className="muted small">沒有連到行程。</p>}
          </div>
          {canEditTicket(ctx, t) ? <Button variant="danger" block onClick={remove}><Icon.trash /> 刪除這張票券</Button> : null}
        </div>
      </div>
    </Screen>
  );
}

export function TicketForm({ tripId, ticketId, activityId }: { tripId: string; ticketId?: string; activityId?: string }) {
  useData();
  const { user } = useSession();
  const trip = store.get('trips', tripId);
  const existing = ticketId ? store.get('tickets', ticketId) : undefined;
  const [d, setD] = useState<TicketDraft>(() => existing
    ? { title: existing.title, kind: existing.kind, traveler_ids: [...existing.traveler_ids], activity_ids: [...existing.activity_ids], notes: existing.notes, file: null, fileName: '' }
    : { title: '', kind: '', traveler_ids: defaultHolder(tripId, user?.id), activity_ids: activityId ? [activityId] : [], notes: '', file: null, fileName: '' });
  const [preview, setPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = useFileUrl(existing?.file_type === 'image' && !d.file ? existing.file_path : null);
  const close = () => goBack(ticketId ? `/t/${tripId}/tk/${ticketId}` : activityId ? `/t/${tripId}/a/${activityId}` : `/t/${tripId}/tickets`);
  const set = (patch: Partial<TicketDraft>) => { setD((x) => ({ ...x, ...patch })); setError(null); };

  if (!trip) return <Screen header={<TopBar title="票券" left={<Button variant="text" onClick={close}>返回</Button>} />}><Empty title="找不到這趟旅行" /></Screen>;
  const ctx = tripCtx(trip, user);
  const allowed = existing ? canEditTicket(ctx, existing) : canAddTicket(ctx);
  if (!allowed) {
    return <Screen header={<TopBar title="票券" left={<Button variant="text" onClick={close}>返回</Button>} />}>
      <Empty title={ctx.myTravelerId ? '只能改自己的票券' : '請先選「我是誰」'}>{ctx.myTravelerId ? null : '到「旅伴・設定」選了「我是誰」之後，就可以上傳自己的票券。'}</Empty>
    </Screen>;
  }

  const days = tripDays(trip.start_date, trip.end_date);
  const acts = sortActivities(store.byTrip('activities', tripId));

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) return setError('檔案太大（超過 25 MB）');
    setProcessing(true);
    try {
      const blob = await prepareUpload(f);
      if (blob.size > 10 * 1024 * 1024) return setError('檔案太大，壓縮後仍超過 10 MB');
      set({ file: blob, fileName: f.name, title: d.title || f.name.replace(/\.[^.]+$/, '').slice(0, 40) });
      if (preview) URL.revokeObjectURL(preview);
      setPreview(blob.type.startsWith('image/') ? URL.createObjectURL(blob) : null);
    } finally {
      setProcessing(false);
    }
  }

  function toggle(key: 'traveler_ids' | 'activity_ids', id: string) {
    set({ [key]: d[key].includes(id) ? d[key].filter((x) => x !== id) : [...d[key], id] } as Partial<TicketDraft>);
  }

  async function save() {
    setBusy(true);
    try {
      // 使用者的票券持有人固定是自己
      const id = await saveTicket(store, tripId, ticketId ?? null, ctx.editable ? d : { ...d, traveler_ids: [ctx.myTravelerId!] });
      toast(d.file && !navigator.onLine ? '已存在手機，連上網路後自動上傳' : '已儲存');
      if (ticketId) close();
      else navigate(`/t/${tripId}/tk/${id}`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const showImg = preview ?? (current.url && !d.file ? current.url : null);
  const fileLabel = d.file ? `${d.file.type === 'application/pdf' ? 'PDF' : '圖片'}・${formatSize(d.file.size)}` : existing?.file_path ? (existing.file_type === 'pdf' ? '目前是 PDF' : '') : '';

  return (
    <Screen header={
      <TopBar title={ticketId ? '編輯票券' : '新增票券'}
        left={<Button variant="text" onClick={close}>取消</Button>}
        right={<Button variant="primary" busy={busy} onClick={save} style={{ minHeight: 44 }}>儲存</Button>} />
    }>
      <div className="pad stack">
        <div className="card stack-sm center" style={{ background: '#fff8df' }}>
          {showImg ? <img src={showImg} alt="票券預覽" style={{ maxHeight: 260, objectFit: 'contain', borderRadius: 12, border: '2px solid var(--ink)', alignSelf: 'center' }} /> : (
            <Mascot size={60} mood="wink" label="還沒有圖片" />
          )}
          {fileLabel ? <span className="small muted">{fileLabel}</span> : null}
          <label className="btn btn-ghost" style={{ alignSelf: 'center' }}>
            {processing ? <span className="spinner" aria-hidden="true" /> : <Icon.camera />}
            {existing?.file_path || d.file ? '換一張' : '拍照或選擇檔案'}
            <input type="file" accept="image/*,application/pdf" onChange={pick} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />
          </label>
          <span className="tiny muted">支援 JPG、PNG、PDF。照片會自動縮小，QR Code 一樣清楚。</span>
        </div>

        <Field label="票券名稱" error={error}>
          <input id="tk-title" className="input" value={d.title} placeholder="例如：迪士尼海洋一日券" onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <div className="field">
          <span className="field-label">類型</span>
          <div className="chips">
            {KIND_PRESETS.map((k) => (
              <button key={k} type="button" aria-pressed={d.kind === k} className={`chip${d.kind === k ? ' is-on' : ''}`}
                style={d.kind === k ? { background: 'var(--pink)' } : undefined} onClick={() => set({ kind: d.kind === k ? '' : k })}>{k}</button>
            ))}
          </div>
        </div>
        {ctx.editable ? <div className="field">
          <span className="field-label">誰的票</span>
          <div className="chips">
            <button type="button" aria-pressed={d.traveler_ids.length === 0} className={`chip${d.traveler_ids.length === 0 ? ' is-on' : ''}`}
              style={d.traveler_ids.length === 0 ? { background: 'var(--butter)' } : undefined} onClick={() => set({ traveler_ids: [] })}>全員共用</button>
            {ctx.travelers.map((t) => (
              <button key={t.id} type="button" aria-pressed={d.traveler_ids.includes(t.id)} className={`chip${d.traveler_ids.includes(t.id) ? ' is-on' : ''}`}
                style={d.traveler_ids.includes(t.id) ? { background: 'var(--peach)' } : undefined} onClick={() => toggle('traveler_ids', t.id)}>{t.name}</button>
            ))}
          </div>
          <span className="field-hint">只有持有人看得到這張票。每個人各自一張的話，分別上傳並選持有人。</span>
        </div> : <p className="notice small">這張是你自己的票券，只有你看得到。</p>}
        <div className="field">
          <span className="field-label">用在哪些行程（可複選）</span>
          {acts.length ? (
            <div className="list">
              {days.map((day) => {
                const list = acts.filter((a) => a.date === day);
                if (!list.length) return null;
                return (
                  <div key={day}>
                    <div className="row" style={{ minHeight: 36, background: '#fff8df' }}><span className="tiny muted">Day {daysBetween(trip.start_date, day) + 1}・{dayLabel(day)}</span></div>
                    {list.map((a) => (
                      <label key={a.id} className="row row-btn">
                        <input type="checkbox" checked={d.activity_ids.includes(a.id)} onChange={() => toggle('activity_ids', a.id)} style={{ width: 22, height: 22 }} />
                        <span className="row-main">
                          <span className="row-title">{a.start_time ? `${hhmm(a.start_time)} ` : ''}{activityName(a, store.get('places', a.place_id))}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
          ) : <p className="muted small">還沒有行程，之後可以再回來連結。</p>}
        </div>
        <Field label="備註（可不填）">
          <TextArea value={d.notes} onChange={(v) => set({ notes: v })} minRows={2} placeholder="入場時間、訂位編號…" />
        </Field>
        <Button variant="primary" block busy={busy} onClick={save}>儲存</Button>
      </div>
    </Screen>
  );
}
