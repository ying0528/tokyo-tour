// 複製成新旅行（當範本）或從備份檔還原
import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { store, useData, useSession } from '../app/services.ts';
import { goBack, navigate } from '../app/router.ts';
import { copyTrip, exportTrip, parseBackup } from '../data/actions.ts';
import type { Backup } from '../data/actions.ts';
import { addDays, dayCount, daysBetween, rangeLabel } from '../lib/dates.ts';
import { Button, Field, Notice, Screen, TopBar } from '../ui/kit.tsx';
import { Mascot } from '../ui/Mascot.tsx';
import { toast } from '../ui/dialog.tsx';

export function CopyTripPage({ tripId }: { tripId?: string }) {
  useData();
  const { user } = useSession();
  const source = tripId ? store.get('trips', tripId) : undefined;
  const [backup, setBackup] = useState<Backup | null>(() => (tripId && source ? exportTrip(store, tripId) : null));
  const [title, setTitle] = useState(source ? `${source.title}（複製）` : '');
  const [start, setStart] = useState(source?.start_date ?? '');
  const [itinerary, setItinerary] = useState(true);
  const [groups, setGroups] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => goBack(tripId ? `/t/${tripId}/settings` : '/');

  async function pickFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const b = parseBackup(await f.text());
      setBackup(b);
      setTitle(b.trip.title);
      setStart(b.trip.start_date);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function save() {
    if (!backup || !user) return;
    if (!start) return setError('請選擇開始日期');
    setBusy(true);
    try {
      const id = await copyTrip(store, user.id, backup, { title, start_date: start, itinerary, groups });
      await store.setMeta('active_trip', id);
      toast(tripId ? '已複製成新旅行' : '已還原');
      navigate(`/t/${id}/plan`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const length = backup ? daysBetween(backup.trip.start_date, backup.trip.end_date) : 0;
  const counts = backup ? {
    acts: backup.activities.filter((a) => !a.deleted_at).length,
    places: backup.places.filter((p) => !p.deleted_at).length,
    people: backup.travelers.filter((t) => !t.deleted_at).length,
    tickets: backup.tickets.filter((t) => !t.deleted_at).length,
  } : null;

  return (
    <Screen header={<TopBar title={tripId ? '複製成新旅行' : '從備份還原'} left={<Button variant="text" onClick={close}>取消</Button>} />}>
      <div className="pad stack">
        {!tripId ? (
          <div className="card stack-sm">
            <p>選擇之前在「旅伴・設定 → 匯出備份」存下的檔案（.json）。</p>
            <label className="btn btn-ghost" style={{ alignSelf: 'flex-start', position: 'relative' }}>
              選擇備份檔
              <input type="file" accept="application/json,.json" onChange={pickFile} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />
            </label>
          </div>
        ) : null}

        {backup && counts ? (
          <>
            <div className="mascot-row">
              <Mascot size={52} mood="happy" />
              <div className="bubble small">
                「{backup.trip.title}」{rangeLabel(backup.trip.start_date, backup.trip.end_date)}：{counts.people} 位旅伴、{counts.acts} 筆行程、{counts.places} 個景點
              </div>
            </div>
            <Field label="新旅行的名稱">
              <input id="copy-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="新的開始日期" hint={start ? `會到 ${addDays(start, length)}，共 ${dayCount(start, addDays(start, length))} 天，行程日期會跟著平移` : undefined}>
              <input id="copy-start" className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <label className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 14 }}>
              <input type="checkbox" checked={itinerary} onChange={(e) => setItinerary(e.target.checked)} style={{ width: 22, height: 22 }} />
              <span>帶入行程、景點和交通步驟</span>
            </label>
            <label className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 14 }}>
              <input type="checkbox" checked={groups} onChange={(e) => setGroups(e.target.checked)} style={{ width: 22, height: 22 }} />
              <span>也帶入分組設定（一般不需要，下一趟重新安排即可）</span>
            </label>
            {counts.tickets ? <Notice>票券不會複製（每趟旅行的票都不一樣）。</Notice> : null}
            {error ? <Notice tone="danger">{error}</Notice> : null}
            <Button variant="primary" block busy={busy} onClick={save}>{tripId ? '建立新旅行' : '還原成新旅行'}</Button>
          </>
        ) : error ? <Notice tone="danger">{error}</Notice> : null}
      </div>
    </Screen>
  );
}

/** 把整趟旅行存成檔案下載到手機 */
export function downloadBackup(tripId: string) {
  const data = exportTrip(store, tripId);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safe = (data.trip.title || 'trip').replace(/[\\/:*?"<>|]/g, '').slice(0, 40);
  a.href = url;
  a.download = `${safe}-備份-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
