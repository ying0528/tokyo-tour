// 建立新旅行／編輯旅程資訊
import { useState } from 'react';
import type { FormEvent } from 'react';
import { store, useData, useSession } from '../app/services.ts';
import { goBack, navigate } from '../app/router.ts';
import { newTraveler, newTrip, TRAVELER_COLORS } from '../data/factories.ts';
import type { Trip } from '../data/types.ts';
import { addDays, dayCount, daysBetween, TIMEZONES } from '../lib/dates.ts';
import { Button, Field, Notice, Screen, TextArea, TopBar } from '../ui/kit.tsx';
import { Icon } from '../ui/icons.tsx';
import { confirmDialog, toast } from '../ui/dialog.tsx';

interface Form {
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  timezone: string;
  notes: string;
}

function validate(f: Form): Partial<Record<keyof Form, string>> {
  const e: Partial<Record<keyof Form, string>> = {};
  if (!f.title.trim()) e.title = '請輸入旅行名稱';
  if (!f.start_date) e.start_date = '請選擇開始日期';
  if (!f.end_date) e.end_date = '請選擇結束日期';
  if (f.start_date && f.end_date) {
    const n = daysBetween(f.start_date, f.end_date);
    if (n < 0) e.end_date = '結束日期不能早於開始日期';
    else if (n > 90) e.end_date = '一趟旅行最多 91 天';
  }
  return e;
}

export function TripFormPage({ tripId }: { tripId?: string }) {
  useData();
  const { user } = useSession();
  const existing = tripId ? store.get('trips', tripId) : undefined;
  const isEdit = Boolean(tripId);

  const [form, setForm] = useState<Form>(() => existing
    ? { title: existing.title, destination: existing.destination, start_date: existing.start_date, end_date: existing.end_date, timezone: existing.timezone, notes: existing.notes }
    : { title: '', destination: '', start_date: '', end_date: '', timezone: 'Asia/Tokyo', notes: '' });
  const [people, setPeople] = useState<string[]>(['', '']);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const close = () => goBack(isEdit ? `/t/${tripId}/settings` : '/');

  if (isEdit && !existing) {
    return <Screen header={<TopBar title="旅程資訊" left={<Button variant="text" onClick={close}>取消</Button>} />}><div className="pad muted">找不到這趟旅行。</div></Screen>;
  }

  async function save(e?: FormEvent) {
    e?.preventDefault();
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    if (!user) return;
    setBusy(true);
    try {
      const fields: Partial<Trip> = { ...form, title: form.title.trim(), destination: form.destination.trim() };
      if (existing) {
        const outside = store.byTrip('activities', existing.id)
          .filter((a) => a.date < form.start_date || a.date > form.end_date).length;
        if (outside) {
          const ok = await confirmDialog({
            title: '有行程不在新的日期範圍內',
            message: `有 ${outside} 筆行程的日期不在新的旅行日期內。它們不會被刪除，但要把日期改回範圍內才會顯示。`,
            confirmText: '仍要儲存',
          });
          if (!ok) return;
        }
        await store.update('trips', existing.id, fields);
        toast('已儲存');
        close();
      } else {
        const trip = await store.create('trips', newTrip(user.id, { ...fields, start_date: form.start_date, end_date: form.end_date }));
        const names = people.map((p) => p.trim()).filter(Boolean);
        for (let i = 0; i < names.length; i++) {
          await store.create('travelers', newTraveler(trip.id, { name: names[i], sort_order: i, color: TRAVELER_COLORS[i % TRAVELER_COLORS.length] }));
        }
        await store.setMeta('active_trip', trip.id);
        navigate(`/t/${trip.id}/plan`, { replace: true });
        toast('旅行已建立');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen header={
      <TopBar title={isEdit ? '旅程資訊' : '建立新旅行'}
        left={<Button variant="text" onClick={close}>取消</Button>}
        right={<Button variant="text" className="strong" onClick={() => save()} busy={busy}>儲存</Button>} />
    }>
      <form className="pad stack" onSubmit={save} noValidate>
        <Field label="旅行名稱" error={errors.title}>
          <input className="input" value={form.title} placeholder="例如：東京家族旅行" onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="目的地">
          <input className="input" value={form.destination} placeholder="例如：東京" onChange={(e) => set('destination', e.target.value)} />
        </Field>
        <div className="grid-2">
          <Field label="開始日期" error={errors.start_date}>
            <input className="input" type="date" value={form.start_date} onChange={(e) => {
              const v = e.target.value;
              setForm((f) => ({ ...f, start_date: v, end_date: !f.end_date || f.end_date < v ? addDays(v, Math.max(0, f.end_date && f.start_date ? daysBetween(f.start_date, f.end_date) : 4)) : f.end_date }));
            }} />
          </Field>
          <Field label="結束日期" error={errors.end_date}>
            <input className="input" type="date" value={form.end_date} min={form.start_date || undefined} onChange={(e) => set('end_date', e.target.value)} />
          </Field>
        </div>
        {form.start_date && form.end_date && !errors.end_date && form.end_date >= form.start_date ? (
          <p className="muted small">共 {dayCount(form.start_date, form.end_date)} 天，每天會自動產生一個日期分頁。</p>
        ) : null}
        <Field label="當地時區" hint="用來判斷「今天」是旅行的第幾天">
          <select className="input" value={form.timezone} onChange={(e) => set('timezone', e.target.value)}>
            {TIMEZONES.some((z) => z.value === form.timezone) ? null : <option value={form.timezone}>{form.timezone}</option>}
            {TIMEZONES.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
          </select>
        </Field>
        <Field label="備註（可不填）">
          <TextArea value={form.notes} onChange={(v) => set('notes', v)} placeholder="住宿、航班、注意事項…" />
        </Field>

        {!isEdit ? (
          <div className="stack">
            <div className="section-head">
              <h2 className="section-title">同行者</h2>
              <span className="muted small">之後也可以再改</span>
            </div>
            {people.map((p, i) => (
              <div key={i} className="input-row">
                <span className="dot" style={{ background: TRAVELER_COLORS[i % TRAVELER_COLORS.length] }} />
                <input className="input" value={p} placeholder={i === 0 ? '例如：媽媽' : i === 1 ? '例如：大寶' : '名字'}
                  onChange={(e) => setPeople((ps) => ps.map((x, j) => (j === i ? e.target.value : x)))} />
                {people.length > 1 ? (
                  <button type="button" className="icon-btn" aria-label="移除" onClick={() => setPeople((ps) => ps.filter((_, j) => j !== i))}>
                    <Icon.close />
                  </button>
                ) : null}
              </div>
            ))}
            <Button variant="ghost" onClick={() => setPeople((ps) => [...ps, ''])}><Icon.plus /> 再加一位</Button>
          </div>
        ) : null}

        {isEdit ? null : (
          <Notice>新旅行是全新空白的，不會帶入任何舊的行程、票券或分組。</Notice>
        )}
        <Button type="submit" variant="primary" block busy={busy}>{isEdit ? '儲存' : '建立旅行'}</Button>
      </form>
    </Screen>
  );
}
