// 新增／編輯行程。景點類自動建立或連結景點；移動類填起終點，標題自動產生，並可編輯多步交通。
import { useState } from 'react';
import { store, useData, useSession } from '../app/services.ts';
import { goBack, navigate } from '../app/router.ts';
import { canEditActivity, myGroupOn, tripCtx } from '../app/tripContext.ts';
import { dayPlanOf, deleteActivity, draftFromActivity, emptyStep, liveSteps, restoreActivity, saveActivity, validateActivity } from '../data/actions.ts';
import type { ActivityDraft, StepDraft } from '../data/actions.ts';
import type { ActivityKind, NamedLink, RouteMode } from '../data/types.ts';
import { dayLabel, daysBetween, tripDays } from '../lib/dates.ts';
import { ACTIVITY_KINDS, activityName, groupName, isSplit, isTransit, KINDS, ROUTE_MODES, sortActivities } from '../lib/plan.ts';
import { Button, Empty, Field, Screen, TextArea, TopBar } from '../ui/kit.tsx';
import { Icon } from '../ui/icons.tsx';
import { confirmDialog, toast } from '../ui/dialog.tsx';
import { prepareUpload } from '../lib/image.ts';
import { ActImage } from '../ui/ActImage.tsx';

function num(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

function StepEditor({ s, index, count, onChange, onMove, onRemove }: {
  s: StepDraft;
  index: number;
  count: number;
  onChange: (patch: Partial<StepDraft>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const transit = isTransit(s.mode);
  const id = `step-${index}`;
  return (
    <div className="step-editor">
      <div className="step-editor-head">
        <span className="num" style={{ fontSize: 'calc(19px + var(--fs-add))' }}>第 {index + 1} 步</span>
        <span className="spacer" />
        <button type="button" className="icon-btn plain" aria-label="往上移" disabled={index === 0} onClick={() => onMove(-1)}><Icon.up /></button>
        <button type="button" className="icon-btn plain" aria-label="往下移" disabled={index === count - 1} onClick={() => onMove(1)}><Icon.down /></button>
        <button type="button" className="icon-btn plain" aria-label="刪除這一步" onClick={onRemove}><Icon.trash /></button>
      </div>
      <div className="chips" role="radiogroup" aria-label="交通方式">
        {ROUTE_MODES.map((m) => (
          <button key={m.value} type="button" role="radio" aria-checked={s.mode === m.value}
            className={`chip${s.mode === m.value ? ' is-on' : ''}`} style={s.mode === m.value ? { background: 'var(--aqua)' } : undefined}
            onClick={() => onChange({ mode: m.value as RouteMode })}>{m.label}</button>
        ))}
      </div>
      {transit ? (
        <>
          <div className="grid-2">
            <Field label="路線"><input id={`${id}-line`} className="input" value={s.line} placeholder="例如：銀座線" onChange={(e) => onChange({ line: e.target.value })} /></Field>
            <Field label="方向"><input id={`${id}-dir`} className="input" value={s.direction} placeholder="往哪個方向" onChange={(e) => onChange({ direction: e.target.value })} /></Field>
          </div>
          <div className="grid-2">
            <Field label="上車站"><input id={`${id}-from`} className="input" value={s.from_stop} onChange={(e) => onChange({ from_stop: e.target.value })} /></Field>
            <Field label="下車站"><input id={`${id}-to`} className="input" value={s.to_stop} onChange={(e) => onChange({ to_stop: e.target.value })} /></Field>
          </div>
          <div className="grid-2">
            <Field label="出口（可不填）"><input id={`${id}-exit`} className="input" value={s.exit_info} onChange={(e) => onChange({ exit_info: e.target.value })} /></Field>
            <Field label="轉乘（可不填）"><input id={`${id}-tr`} className="input" value={s.transfer_info} onChange={(e) => onChange({ transfer_info: e.target.value })} /></Field>
          </div>
        </>
      ) : (
        <div className="grid-2">
          <Field label="從"><input id={`${id}-from`} className="input" value={s.from_stop} onChange={(e) => onChange({ from_stop: e.target.value })} /></Field>
          <Field label="到"><input id={`${id}-to`} className="input" value={s.to_stop} onChange={(e) => onChange({ to_stop: e.target.value })} /></Field>
        </div>
      )}
      <div className="grid-2">
        <Field label="出發時間（可不填）"><input id={`${id}-time`} className="input" type="time" value={s.depart_time ? s.depart_time.slice(0, 5) : ''} onChange={(e) => onChange({ depart_time: e.target.value || null })} /></Field>
        <Field label="大約幾分鐘"><input id={`${id}-min`} className="input" inputMode="numeric" value={s.duration_min ?? ''} onChange={(e) => { const n = num(e.target.value); onChange({ duration_min: n === null || Number.isNaN(n) ? null : Math.max(0, Math.round(n)) }); }} /></Field>
      </div>
      <Field label="說明（網址可以直接貼，可多行）">
        <TextArea value={s.notes} onChange={(v) => onChange({ notes: v })} minRows={2} placeholder={s.mode === 'uber' ? '上車地點、預估費用…' : '月台、車廂、注意事項…'} />
      </Field>
    </div>
  );
}

export function ActivityForm({ tripId, activityId, date }: { tripId: string; activityId?: string; date?: string }) {
  useData();
  const { user } = useSession();
  const trip = store.get('trips', tripId);
  const existing = activityId ? store.get('activities', activityId) : undefined;
  const isEdit = Boolean(activityId);
  const days = trip ? tripDays(trip.start_date, trip.end_date) : [];

  const [d, setD] = useState<ActivityDraft>(() => existing ? draftFromActivity(store, existing) : {
    kind: 'sight', date: date && days.includes(date) ? date : days[0] ?? '', start_time: null, notes: '',
    audience_groups: [], audience_travelers: [], name: '', from_name: '', to_name: '', steps: [], map_url: '', links: [], images: [],
  });
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPeople, setShowPeople] = useState(() => Boolean(existing?.audience_travelers.length));
  const [processing, setProcessing] = useState(false);

  async function addImages(files: FileList | null) {
    if (!files?.length) return;
    setProcessing(true);
    try {
      const added: { id: string; blob: Blob }[] = [];
      for (const f of Array.from(files)) {
        if (!f.type.startsWith('image/')) continue;
        added.push({ id: crypto.randomUUID(), blob: await prepareUpload(f) });
      }
      setD((x) => ({ ...x, images: [...x.images, ...added] }));
    } finally {
      setProcessing(false);
    }
  }

  const set = (patch: Partial<ActivityDraft>) => { setD((x) => ({ ...x, ...patch })); setError(null); };
  const close = () => goBack(isEdit ? `/t/${tripId}/a/${activityId}` : `/t/${tripId}/plan/${d.date}`);

  if (!trip || (isEdit && (!existing || existing.deleted_at))) {
    return <Screen header={<TopBar title="行程" left={<Button variant="text" onClick={close}>返回</Button>} />}><Empty title="找不到這筆行程" /></Screen>;
  }
  const ctx = tripCtx(trip, user);
  // 使用者：只能新增、修改分組那天自己那一組的行程
  const userDays = ctx.editable ? days : days.filter((x) => myGroupOn(ctx, x));
  if (!ctx.editable && (existing ? !canEditActivity(ctx, existing) : !userDays.length)) {
    return <Screen header={<TopBar title="行程" left={<Button variant="text" onClick={close}>返回</Button>} />}><Empty title="只能看，不能改">使用者只能新增、修改分組那天自己那一組的行程。</Empty></Screen>;
  }
  const userGroup = ctx.editable ? null : myGroupOn(ctx, d.date);

  const plan = dayPlanOf(store, tripId, d.date);
  const sameDay = sortActivities(store.byTrip('activities', tripId).filter((a) => a.date === d.date && a.id !== activityId));
  const split = isSplit(plan);
  // 舊資料可能是其他類型（買買買、廁所…），編輯時保留選項
  const kinds: ActivityKind[] = ACTIVITY_KINDS.includes(d.kind) ? ACTIVITY_KINDS : [...ACTIVITY_KINDS, d.kind];

  function changeKind(k: ActivityKind) {
    set({ kind: k, steps: k === 'move' && d.steps.length === 0 ? [emptyStep()] : d.steps });
  }

  function toggleGroup(g: string) {
    set({ audience_groups: d.audience_groups.includes(g) ? d.audience_groups.filter((x) => x !== g) : [...d.audience_groups, g] });
  }

  function toggleTraveler(id: string) {
    set({ audience_travelers: d.audience_travelers.includes(id) ? d.audience_travelers.filter((x) => x !== id) : [...d.audience_travelers, id] });
  }

  function setStep(i: number, patch: Partial<StepDraft>) {
    set({ steps: d.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  }

  function moveStep(i: number, dir: -1 | 1) {
    const next = [...d.steps];
    const [s] = next.splice(i, 1);
    next.splice(i + dir, 0, s);
    set({ steps: next });
  }

  function setLink(i: number, patch: Partial<NamedLink>) {
    set({ links: d.links.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  }

  async function save() {
    const draft: ActivityDraft = { ...d, steps: d.kind === 'move' ? d.steps : [] };
    if (!ctx.editable) {
      const g = myGroupOn(ctx, draft.date);
      if (!g) return setError({ field: 'save', message: '這天沒有分組，只有管理者可以新增行程' });
      draft.audience_groups = [g];
      draft.audience_travelers = [];
    }
    const v = validateActivity(draft);
    if (v) return setError(v);
    if (existing?.kind === 'move' && draft.kind !== 'move' && d.steps.some((s) => s.id)) {
      const ok = await confirmDialog({ title: '改成其他類型？', message: '這筆行程的交通步驟會一起移到回收桶。', confirmText: '確定修改' });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const id = await saveActivity(store, tripId, activityId ?? null, draft);
      toast('已儲存');
      if (isEdit) goBack(`/t/${tripId}/a/${id}`);
      else navigate(`/t/${tripId}/plan/${draft.date}`, { replace: true });
    } catch (e) {
      setError({ field: 'save', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;
    const name = activityName(existing, store.get('places', existing.place_id));
    const ok = await confirmDialog({
      title: `刪除「${name}」？`,
      message: existing.kind === 'move' && liveSteps(store, existing.id).length ? '這筆行程和它的交通步驟會一起移到回收桶。票券不會被刪除。' : '這筆行程會被刪除，票券會保留。',
      confirmText: '刪除',
      danger: true,
    });
    if (!ok) return;
    await deleteActivity(store, existing.id);
    navigate(`/t/${tripId}/plan/${existing.date}`, { replace: true });
    toast('已刪除', 'ok', { label: '復原', run: () => { void restoreActivity(store, existing.id); } });
  }

  const routeTitle = [d.from_name.trim(), d.to_name.trim()].filter(Boolean).join('－');
  const everyone = d.audience_groups.length === 0 && d.audience_travelers.length === 0;

  return (
    <Screen header={
      <TopBar title={isEdit ? '編輯行程' : '新增行程'}
        left={<Button variant="text" onClick={close}>取消</Button>}
        right={<Button variant="primary" busy={busy} onClick={save} style={{ minHeight: 44 }}>儲存</Button>} />
    }>
      <div className="pad stack">
        <div className="field">
          <span className="field-label">類型</span>
          <div className="kind-grid" style={{ gridTemplateColumns: `repeat(${kinds.length > 4 ? 3 : 2}, minmax(0, 1fr))` }} role="radiogroup" aria-label="行程類型">
            {kinds.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={d.kind === k} className="kind-btn"
                style={d.kind === k ? { background: KINDS[k].bg, boxShadow: 'var(--pop)' } : undefined}
                onClick={() => changeKind(k)}>
                {KINDS[k].label}
              </button>
            ))}
          </div>
        </div>

        {d.kind !== 'move' ? (
          <Field label="名稱" error={error?.field === 'name' ? error.message : null}>
            <input id="act-name" className="input" value={d.name} autoComplete="off"
              placeholder={d.kind === 'food' ? '例如：一蘭拉麵' : d.kind === 'lodging' ? '例如：HOTEL METS 大森' : '例如：明治神宮'}
              onChange={(e) => set({ name: e.target.value })} />
          </Field>
        ) : (
          <>
            <div className="grid-2">
              <Field label="從哪裡" error={error?.field === 'from_name' ? error.message : null}>
                <input id="act-from" className="input" value={d.from_name} placeholder="例如：羽田機場" onChange={(e) => set({ from_name: e.target.value })} />
              </Field>
              <Field label="到哪裡">
                <input id="act-to" className="input" value={d.to_name} placeholder="例如：大森飯店" onChange={(e) => set({ to_name: e.target.value })} />
              </Field>
            </div>
            {routeTitle ? <p className="field-hint">標題會自動顯示「{routeTitle}」</p> : null}
          </>
        )}

        <div className="grid-2">
          <div className="field">
            <label className="field-label" htmlFor="act-date">哪一天</label>
            <select id="act-date" className="input" value={d.date} onChange={(e) => set({ date: e.target.value, audience_groups: ctx.editable ? [] : [myGroupOn(ctx, e.target.value) ?? ''] })}>
              {userDays.includes(d.date) ? null : <option value={d.date}>{dayLabel(d.date)}{days.includes(d.date) ? '' : '（不在旅行日期內）'}</option>}
              {userDays.map((x) => <option key={x} value={x}>Day {daysBetween(trip.start_date, x) + 1}・{dayLabel(x)}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="act-time">幾點</label>
            <input id="act-time" className="input" type="time" value={d.start_time ?? ''} onChange={(e) => set({ start_time: e.target.value || null })} />
          </div>
        </div>
        {!d.start_time ? (
          <div className="field">
            <label className="field-label" htmlFor="act-after">沒填時間：排在哪個行程後面</label>
            <select id="act-after" className="input" value={d.after_activity_id ?? ''} onChange={(e) => set({ after_activity_id: e.target.value || null })}>
              <option value="">當天最後</option>
              {sameDay.map((a) => <option key={a.id} value={a.id}>{a.start_time ? `${a.start_time.slice(0, 5)} ` : ''}{activityName(a, undefined)}</option>)}
            </select>
            <span className="field-hint">時間可以不填，行程頁時間格會空著。</span>
          </div>
        ) : null}

        {!ctx.editable && userGroup ? (
          <p className="notice small">這筆行程只有「{groupName(plan, userGroup)}」看得到。</p>
        ) : split || d.audience_groups.length || d.audience_travelers.length ? (
          <div className="field">
            <span className="field-label">誰會看到</span>
            <div className="chips" role="group" aria-label="誰會看到">
              <button type="button" aria-pressed={everyone} className={`chip${everyone ? ' is-on' : ''}`} style={everyone ? { background: 'var(--butter)' } : undefined}
                onClick={() => set({ audience_groups: [], audience_travelers: [] })}>所有人</button>
              {split ? plan!.groups.map((g) => (
                <button key={g} type="button" aria-pressed={d.audience_groups.includes(g)} className={`chip${d.audience_groups.includes(g) ? ' is-on' : ''}`}
                  style={d.audience_groups.includes(g) ? { background: 'var(--mint)' } : undefined}
                  onClick={() => toggleGroup(g)}>{groupName(plan, g)}</button>
              )) : null}
              <button type="button" className="chip" onClick={() => setShowPeople(!showPeople)}>{showPeople ? '收起' : '指定人…'}</button>
            </div>
            {showPeople ? (
              <div className="chips" role="group" aria-label="指定人">
                {ctx.travelers.map((t) => (
                  <button key={t.id} type="button" aria-pressed={d.audience_travelers.includes(t.id)}
                    className={`chip${d.audience_travelers.includes(t.id) ? ' is-on' : ''}`}
                    style={d.audience_travelers.includes(t.id) ? { background: 'var(--lilac)' } : undefined}
                    onClick={() => toggleTraveler(t.id)}>{t.name}</button>
                ))}
              </div>
            ) : null}
            <span className="field-hint">「所有人」＝共同活動，只要輸入一次，每一組都看得到。</span>
          </div>
        ) : null}

        <Field label="補充說明（可不填）">
          <TextArea value={d.notes} onChange={(v) => set({ notes: v })} placeholder="營業時間、要排隊、訂位資訊…" />
        </Field>

        <div className="field">
          <span className="field-label">補充圖片（可不填）</span>
          {d.images.map((img, i) => (
            <div key={img.id} className="act-img-edit">
              <ActImage path={img.path} blob={img.blob} alt={`補充圖片 ${i + 1}`} />
              <button type="button" className="icon-btn" aria-label={`刪除補充圖片 ${i + 1}`} onClick={() => set({ images: d.images.filter((x) => x.id !== img.id) })}><Icon.trash /></button>
            </div>
          ))}
          <label className="btn btn-secondary" style={{ borderStyle: 'dashed', alignSelf: 'flex-start', position: 'relative' }}>
            {processing ? <span className="spinner" aria-hidden="true" /> : <Icon.camera />} 新增補充圖片
            <input type="file" accept="image/*" multiple aria-label="選擇補充圖片" style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
              onChange={(e) => { void addImages(e.target.files); e.target.value = ''; }} />
          </label>
          <span className="field-hint">例如菜單、地圖截圖、排隊位置。照片會自動縮小，沒網路也能先存。</span>
        </div>

        <Field label="地圖連結（可不填）" hint="在 Google Maps 或 Naver Map 按「分享」複製連結貼上" error={error?.field === 'map_url' ? error.message : null}>
          <input id="act-map" className="input" inputMode="url" value={d.map_url} placeholder="https://maps.app.goo.gl/…" onChange={(e) => set({ map_url: e.target.value })} />
        </Field>

        <div className="field">
          <span className="field-label">其他連結（可不填）</span>
          <div className="link-list">
            {d.links.map((l, i) => (
              <div key={i} className="stack-sm">
                <div className="link-row">
                  <input className="input" aria-label={`連結 ${i + 1} 名稱`} value={l.label} placeholder="名稱，例如：官網" onChange={(e) => setLink(i, { label: e.target.value })} />
                  <input className="input" aria-label={`連結 ${i + 1} 網址`} inputMode="url" value={l.url} placeholder="https://…" onChange={(e) => setLink(i, { url: e.target.value })} />
                  <button type="button" className="icon-btn plain" aria-label={`刪除連結 ${i + 1}`} onClick={() => set({ links: d.links.filter((_, j) => j !== i) })}><Icon.close /></button>
                </div>
                {error?.field === `link-${i}` ? <span className="field-error">{error.message}</span> : null}
              </div>
            ))}
            <Button variant="secondary" onClick={() => set({ links: [...d.links, { label: '', url: '' }] })} style={{ borderStyle: 'dashed', alignSelf: 'flex-start' }}>
              <Icon.plus /> 新增連結
            </Button>
          </div>
        </div>

        {d.kind === 'move' ? (
          <div className="stack">
            <div className="section-head">
              <h2 className="section-title">交通步驟</h2>
              <span className="muted tiny">{d.steps.length} 步</span>
            </div>
            {d.steps.map((s, i) => (
              <StepEditor key={s.id ?? `new-${i}`} s={s} index={i} count={d.steps.length}
                onChange={(p) => setStep(i, p)} onMove={(dir) => moveStep(i, dir)}
                onRemove={() => set({ steps: d.steps.filter((_, j) => j !== i) })} />
            ))}
            <Button variant="ghost" onClick={() => set({ steps: [...d.steps, emptyStep(d.steps.length ? 'walk' : 'subway')] })}>
              <Icon.plus /> 再加一步
            </Button>
          </div>
        ) : null}

        {error?.field === 'save' || error?.field === 'date' ? <p className="notice notice-danger">{error.message}</p> : null}
        <Button variant="primary" block busy={busy} onClick={save}>儲存</Button>
        {isEdit && existing ? <Button variant="danger" block onClick={remove}><Icon.trash /> 刪除這筆行程</Button> : null}
      </div>
    </Screen>
  );
}
