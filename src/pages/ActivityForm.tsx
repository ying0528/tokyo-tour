// 新增／編輯行程。景點類自動建立或連結景點；移動類填起終點，標題自動產生，並可編輯多步交通。
import { useMemo, useState } from 'react';
import { store, useData, useSession } from '../app/services.ts';
import { goBack, navigate } from '../app/router.ts';
import { tripCtx } from '../app/tripContext.ts';
import {
  dayPlanOf, draftFromActivity, emptyStep, findPlaceByName, placeUsage, saveActivity, validateActivity,
} from '../data/actions.ts';
import type { ActivityDraft, StepDraft } from '../data/actions.ts';
import type { ActivityKind, RouteMode } from '../data/types.ts';
import { dayLabel, daysBetween, tripDays } from '../lib/dates.ts';
import { ACTIVITY_KINDS, groupName, isPlaceKind, isSplit, isTransit, KINDS, ROUTE_MODES } from '../lib/plan.ts';
import { Button, Empty, Field, Screen, TextArea, TopBar } from '../ui/kit.tsx';
import { Icon } from '../ui/icons.tsx';
import { chooseDialog, confirmDialog, toast } from '../ui/dialog.tsx';

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
        <span className="num" style={{ fontSize: 18 }}>第 {index + 1} 步</span>
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
    kind: 'sight', date: date && days.includes(date) ? date : days[0] ?? '', start_time: null, duration_min: null, cost: null, notes: '',
    audience_groups: [], audience_travelers: [], name: '', placeId: null, renameMode: 'all', from_name: '', to_name: '', steps: [],
  });
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPeople, setShowPeople] = useState(() => Boolean(existing?.audience_travelers.length));
  const [costText, setCostText] = useState(existing?.cost != null ? String(existing.cost) : '');

  const set = (patch: Partial<ActivityDraft>) => { setD((x) => ({ ...x, ...patch })); setError(null); };
  const close = () => goBack(isEdit ? `/t/${tripId}/a/${activityId}` : `/t/${tripId}/plan/${d.date}`);

  const places = store.byTrip('places', tripId);
  const suggestions = useMemo(() => {
    const q = d.name.trim().toLowerCase();
    if (!q || !isPlaceKind(d.kind)) return [];
    return places
      .filter((p) => p.name.toLowerCase().includes(q) && p.id !== d.placeId)
      .sort((a, b) => (a.kind === d.kind ? 0 : 1) - (b.kind === d.kind ? 0 : 1) || a.name.length - b.name.length)
      .slice(0, 5);
  }, [d.name, d.kind, d.placeId, store.version]);

  if (!trip || (isEdit && (!existing || existing.deleted_at))) {
    return <Screen header={<TopBar title="行程" left={<Button variant="text" onClick={close}>返回</Button>} />}><Empty title="找不到這筆行程" /></Screen>;
  }
  const ctx = tripCtx(trip, user);
  if (!ctx.editable) {
    return <Screen header={<TopBar title="行程" left={<Button variant="text" onClick={close}>返回</Button>} />}><Empty title="你只能查看這趟旅行">請管理者把你的權限改成「可以編輯」。</Empty></Screen>;
  }

  const plan = dayPlanOf(store, tripId, d.date);
  const split = isSplit(plan);
  const linked = d.placeId ? store.get('places', d.placeId) : undefined;
  const nameExists = !d.placeId && d.name.trim() ? findPlaceByName(store, tripId, d.name) : undefined;

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

  async function save() {
    const cost = num(costText);
    if (Number.isNaN(cost)) return setError({ field: 'cost', message: '費用請輸入數字' });
    const draft: ActivityDraft = { ...d, cost, audience_groups: split ? d.audience_groups : d.audience_groups, steps: d.kind === 'move' ? d.steps : [] };
    const v = validateActivity(draft);
    if (v) return setError(v);

    // 已連結的景點改了名字：問要不要一起改
    if (isPlaceKind(draft.kind) && linked && existing?.place_id === linked.id && existing.title.trim() && existing.title.trim() === draft.name.trim()) {
      draft.renameMode = 'this'; // 本來就是自訂名稱，沒有改
    } else if (isPlaceKind(draft.kind) && linked && linked.name.trim() !== draft.name.trim()) {
      const others = placeUsage(store, linked.id, activityId).length;
      if (others > 0) {
        const pick = await chooseDialog<'all' | 'this'>({
          title: '名稱改了，要怎麼處理？',
          message: <>「{linked.name}」還有 {others} 筆其他行程在用。</>,
          choices: [
            { value: 'all', label: `全部一起改成「${draft.name.trim()}」`, primary: true },
            { value: 'this', label: '只改這一筆的顯示名稱' },
          ],
        });
        if (!pick) return;
        draft.renameMode = pick;
      } else {
        draft.renameMode = 'all';
      }
    }
    // 移動改成別的類型：交通步驟會移到回收桶
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
          <span className="field-label">要去做什麼？</span>
          <div className="kind-grid" role="radiogroup" aria-label="行程類型">
            {ACTIVITY_KINDS.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={d.kind === k} className="kind-btn"
                style={d.kind === k ? { background: KINDS[k].bg, boxShadow: 'var(--pop)' } : undefined}
                onClick={() => changeKind(k)}>
                {KINDS[k].label}
              </button>
            ))}
          </div>
        </div>

        {isPlaceKind(d.kind) ? (
          <div className="field">
            <label className="field-label" htmlFor="act-name">名稱</label>
            <input id="act-name" className="input" value={d.name} autoComplete="off" placeholder={d.kind === 'food' ? '例如：一蘭拉麵' : '例如：明治神宮'}
              onChange={(e) => set({ name: e.target.value })} />
            {error?.field === 'name' ? <span className="field-error">{error.message}</span> : null}
            {linked ? (
              <span className="field-hint">
                已連結景點「{linked.name}」
                <button type="button" className="link-btn inline" style={{ marginLeft: 8 }} onClick={() => set({ placeId: null })}>改成新的景點</button>
              </span>
            ) : nameExists ? (
              <span className="field-hint">會連到已有的景點「{nameExists.name}」</span>
            ) : d.name.trim() ? (
              <span className="field-hint">會自動建立「{d.name.trim()}」的景點資料，之後可以補地址和地圖</span>
            ) : null}
            {suggestions.length ? (
              <div className="chips" aria-label="已有的景點">
                {suggestions.map((p) => (
                  <button key={p.id} type="button" className="chip" onClick={() => set({ placeId: p.id, name: p.name })}>
                    用「{p.name}」
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {d.kind === 'move' ? (
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
        ) : null}

        <div className="grid-2">
          <div className="field">
            <label className="field-label" htmlFor="act-date">哪一天</label>
            <select id="act-date" className="input" value={d.date} onChange={(e) => set({ date: e.target.value, audience_groups: [] })}>
              {days.includes(d.date) ? null : <option value={d.date}>{dayLabel(d.date)}（不在旅行日期內）</option>}
              {days.map((x) => <option key={x} value={x}>Day {daysBetween(trip.start_date, x) + 1}・{dayLabel(x)}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="act-time">幾點（可不填）</label>
            <input id="act-time" className="input" type="time" value={d.start_time ?? ''} onChange={(e) => set({ start_time: e.target.value || null })} />
          </div>
        </div>

        <div className="grid-2">
          <Field label="停留幾分鐘（可不填）" error={error?.field === 'duration_min' ? error.message : null}>
            <input id="act-dur" className="input" inputMode="numeric" value={d.duration_min ?? ''} placeholder="例如：120"
              onChange={(e) => { const n = num(e.target.value); set({ duration_min: n === null ? null : n }); }} />
          </Field>
          <Field label="費用（可不填）" error={error?.field === 'cost' ? error.message : null}>
            <input id="act-cost" className="input" inputMode="decimal" value={costText} placeholder="例如：3500" onChange={(e) => { setCostText(e.target.value); setError(null); }} />
          </Field>
        </div>

        {split || d.audience_groups.length || d.audience_travelers.length ? (
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

        <Field label="補充說明（可不填，網址可以直接貼）">
          <TextArea value={d.notes} onChange={(v) => set({ notes: v })} placeholder="營業時間、要排隊、訂位資訊…" />
        </Field>

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
      </div>
    </Screen>
  );
}
