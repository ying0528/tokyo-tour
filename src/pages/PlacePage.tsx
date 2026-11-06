// 景點資料：查看（簡介、地址、地圖、相關行程）與新增／編輯
import { useState } from 'react';
import { store, useData, useSession } from '../app/services.ts';
import { goBack, navigate } from '../app/router.ts';
import { tripCtx } from '../app/tripContext.ts';
import { dayPlanOf, deletePlace, placeUsage, savePlace } from '../data/actions.ts';
import type { PlaceDraft } from '../data/actions.ts';
import type { PlaceKind } from '../data/types.ts';
import { KINDS, mapLink, PLACE_KINDS, sortActivities } from '../lib/plan.ts';
import { safeUrl } from '../lib/links.ts';
import { daysBetween, dayLabel } from '../lib/dates.ts';
import { ActivityCard } from '../ui/ActivityCard.tsx';
import { BackButton, Button, Empty, Field, Screen, TextArea, TopBar } from '../ui/kit.tsx';
import { Icon } from '../ui/icons.tsx';
import { Mascot } from '../ui/Mascot.tsx';
import { RichText } from '../ui/RichText.tsx';
import { confirmDialog, toast } from '../ui/dialog.tsx';

export function PlacePage({ tripId, placeId }: { tripId: string; placeId: string }) {
  useData();
  const { user } = useSession();
  const trip = store.get('trips', tripId);
  const p = store.get('places', placeId);
  const back = () => goBack(`/t/${tripId}/places`);
  if (!trip || !p || p.deleted_at) {
    return <Screen header={<TopBar title="景點" left={<BackButton onClick={back} />} />}><Empty icon={<Mascot size={72} mood="wow" />} title="找不到這個景點" /></Screen>;
  }
  const ctx = tripCtx(trip, user);
  const uses = sortActivities(placeUsage(store, p.id));
  const map = mapLink(p);

  async function remove() {
    const ok = await confirmDialog({
      title: `刪除「${p!.name}」？`,
      message: uses.length ? `有 ${uses.length} 筆行程用到這個景點。行程會保留，名稱也不會消失，只是不再連到景點資料。` : '這個景點會被刪除。',
      confirmText: '刪除',
      danger: true,
    });
    if (!ok) return;
    await deletePlace(store, p!.id);
    toast('已刪除');
    navigate(`/t/${tripId}/places`, { replace: true });
  }

  return (
    <Screen header={
      <TopBar title="景點資料" left={<BackButton onClick={back} />}
        right={ctx.editable ? <Button variant="ghost" onClick={() => navigate(`/t/${tripId}/p/${p.id}/edit`)}>編輯</Button> : null} />
    }>
      <div className="pad stack">
        <div className="detail-hero" style={{ background: KINDS[p.kind].bg }}>
          <span className="badge">{KINDS[p.kind].label}</span>
          <h1 className="detail-title">{p.name}</h1>
        </div>
        {p.description.trim() ? <div className="info-row"><Icon.note /><RichText text={p.description} /></div> : null}
        {p.address.trim() ? (
          <div className="info-row"><Icon.place />
            <a href={mapLink({ map_url: '', name: '', address: p.address }) ?? '#'} target="_blank" rel="noopener noreferrer">{p.address}</a>
          </div>
        ) : null}
        {p.notes.trim() ? <div className="info-row"><Icon.edit /><RichText text={p.notes} className="muted" /></div> : null}
        {map ? (
          <a className="btn btn-block" style={{ background: 'var(--mint)', boxShadow: 'var(--pop)', minHeight: 56, fontSize: 18 }} href={map} target="_blank" rel="noopener noreferrer">
            <Icon.place /> {p.map_url && safeUrl(p.map_url) ? 'Naver Map 帶我去' : '在 Naver Map 搜尋'}
          </a>
        ) : null}

        <div className="stack-sm">
          <h2 className="section-title">排在這些行程</h2>
          {uses.length ? uses.map((a) => (
            <ActivityCard key={a.id} a={a} plan={dayPlanOf(store, tripId, a.date)} travelers={ctx.travelers}
              showDate={`Day ${daysBetween(trip.start_date, a.date) + 1} ${dayLabel(a.date)}`}
              onClick={() => navigate(`/t/${tripId}/a/${a.id}`)} />
          )) : <p className="muted small">還沒排進行程。</p>}
        </div>
        {ctx.editable ? <Button variant="danger" block onClick={remove}><Icon.trash /> 刪除這個景點</Button> : null}
      </div>
    </Screen>
  );
}

export function PlaceForm({ tripId, placeId }: { tripId: string; placeId?: string }) {
  useData();
  const existing = placeId ? store.get('places', placeId) : undefined;
  const [d, setD] = useState<PlaceDraft>(() => existing
    ? { name: existing.name, kind: existing.kind, address: existing.address, map_url: existing.map_url, description: existing.description, notes: existing.notes }
    : { name: '', kind: 'sight', address: '', map_url: '', description: '', notes: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => goBack(placeId ? `/t/${tripId}/p/${placeId}` : `/t/${tripId}/places`);
  const set = (patch: Partial<PlaceDraft>) => { setD((x) => ({ ...x, ...patch })); setError(null); };
  const uses = placeId ? placeUsage(store, placeId).length : 0;
  const mapOk = !d.map_url.trim() || safeUrl(d.map_url);

  async function save() {
    if (!mapOk) return setError('地圖連結要是 https:// 開頭的網址');
    setBusy(true);
    try {
      const id = await savePlace(store, tripId, placeId ?? null, d);
      toast('已儲存');
      if (placeId) close();
      else navigate(`/t/${tripId}/p/${id}`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen header={
      <TopBar title={placeId ? '編輯景點' : '新增景點'}
        left={<Button variant="text" onClick={close}>取消</Button>}
        right={<Button variant="primary" busy={busy} onClick={save} style={{ minHeight: 44 }}>儲存</Button>} />
    }>
      <div className="pad stack">
        <Field label="名稱" error={error} hint={uses > 1 ? `改名後，${uses} 筆行程都會一起更新` : undefined}>
          <input id="place-name" className="input" value={d.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <div className="field">
          <span className="field-label">類型</span>
          <div className="kind-grid" role="radiogroup" aria-label="類型">
            {PLACE_KINDS.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={d.kind === k} className="kind-btn"
                style={d.kind === k ? { background: KINDS[k].bg, boxShadow: 'var(--pop)' } : undefined}
                onClick={() => set({ kind: k as PlaceKind })}>{KINDS[k].label}</button>
            ))}
          </div>
        </div>
        <Field label="地址（可不填）">
          <input id="place-address" className="input" value={d.address} onChange={(e) => set({ address: e.target.value })} />
        </Field>
        <Field label="Naver Map 連結（可不填）" hint="在 Naver Map 按「分享」複製連結貼上。沒填的話會用名稱或地址搜尋。"
          error={mapOk ? null : '要是 https:// 開頭的網址'}>
          <input id="place-map" className="input" inputMode="url" value={d.map_url} placeholder="https://naver.me/…" onChange={(e) => set({ map_url: e.target.value })} />
        </Field>
        <Field label="簡介（可多行，網址可以直接貼）">
          <TextArea value={d.description} onChange={(v) => set({ description: v })} placeholder="營業時間、必點、官網…" />
        </Field>
        <Field label="備註（可不填）">
          <TextArea value={d.notes} onChange={(v) => set({ notes: v })} minRows={2} />
        </Field>
        <Button variant="primary" block busy={busy} onClick={save}>儲存</Button>
      </div>
    </Screen>
  );
}
