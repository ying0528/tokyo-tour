// 路線：每天相鄰兩個行程之間怎麼走（地鐵／電車、公車、步行）
// 旅程時區是「日本（東京）」時，可以直接選東京的路線與車站，自動算方向、站數，並畫出沿途路線圖。
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { store, useData, useSession } from '../app/services.ts';
import { goBack, navigate } from '../app/router.ts';
import { canEditGroup, dayView, setViewGroup, tripCtx, useViewVersion } from '../app/tripContext.ts';
import type { TripCtx } from '../app/tripContext.ts';
import {
  addCustomLeg, convertMoves, dayPlanOf, dismissLeg, ensureLeg, legacyMoves, removeLeg, restoreLeg, saveLegSteps,
} from '../data/actions.ts';
import type { LegMode, LegStep, RouteLeg, Trip } from '../data/types.ts';
import { tripDays } from '../lib/dates.ts';
import { dayLegs, directionsUrl, searchUrl, stepSummary } from '../lib/legs.ts';
import type { LegView } from '../lib/legs.ts';
import { activityName, groupName, hhmm } from '../lib/plan.ts';
import {
  codeAt, lineById, lineCode, loadRail, POPULAR_LINES, railNow, ridePath, sameStation, searchLines, stationMapUrl, transfersAt, uniqueStations,
} from '../lib/rail.ts';
import type { RailData, RailLine } from '../lib/rail.ts';
import { safeUrl } from '../lib/links.ts';
import { prepareUpload } from '../lib/image.ts';
import { BackButton, Button, Empty, Field, Notice, Screen, TextArea, TopBar } from '../ui/kit.tsx';
import { Icon } from '../ui/icons.tsx';
import { Sheet } from '../ui/Sheet.tsx';
import { DayStrip, phoneNow } from '../ui/DayStrip.tsx';
import { confirmDialog, toast } from '../ui/dialog.tsx';
import { useFileUrl } from '../ui/useFile.ts';

/** 旅程時區選日本（東京）時，使用日本版路線 */
export function isJapan(trip: Trip): boolean {
  return trip.timezone === 'Asia/Tokyo';
}

/** 需要時載入東京的路線資料 */
export function useRail(enabled: boolean): RailData | null {
  const [d, setD] = useState<RailData | null>(() => (enabled ? railNow() : null));
  useEffect(() => {
    if (!enabled || d) return;
    let alive = true;
    loadRail().then((x) => { if (alive) setD(x); }).catch(() => undefined);
    return () => { alive = false; };
  }, [enabled]);
  return enabled ? d : null;
}

/** 底色上要用白字還是深色字 */
function textOn(hex: string | undefined): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return 'var(--ink)';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? '#2b2433' : '#ffffff';
}

/** 「東京Metro 銀座線」→「銀座線」 */
export function shortLine(name: string): string {
  return name.replace(/^(東京Metro|都營|JR) /, '');
}

function LineBadge({ code, color, size }: { code?: string; color?: string; size?: 'lg' }) {
  if (!code) return null;
  const sq = code.length > 1 && !size;
  return <span className={`line-badge${sq ? ' sq' : ''}${size ? ` ${size}` : ''}`} style={{ ['--c' as string]: color ?? '#888' }}>{code}</span>;
}

/** 卡片上的步驟小標籤 */
export function StepChips({ steps }: { steps: LegStep[] }) {
  return (
    <span className="leg-chips">
      {steps.map((s, i) => (
        <span key={s.id} style={{ display: 'contents' }}>
          {i ? <span aria-hidden="true">›</span> : null}
          {s.mode === 'walk' ? (
            <span className="step-chip walk"><Icon.walk />步行</span>
          ) : s.mode === 'rail' ? (
            <span className="step-chip" style={s.color ? { borderColor: s.color } : undefined}>
              <LineBadge code={s.code} color={s.color} />{shortLine(stepSummary(s))}
            </span>
          ) : (
            <span className={`step-chip${s.mode === 'bus' ? ' bus' : ''}`}>{s.mode === 'bus' ? <Icon.bus /> : null}{stepSummary(s)}</span>
          )}
        </span>
      ))}
    </span>
  );
}

/** 行程頁裡插在兩個行程之間的路線（字小、框扁） */
export function FlatLeg({ v, onClick }: { v: LegView; onClick: () => void }) {
  return (
    <button type="button" className="flat-leg" onClick={onClick} aria-label={`路線：${v.fromName} 到 ${v.toName}`}>
      <Icon.train />
      <StepChips steps={v.leg?.steps ?? []} />
    </button>
  );
}

// ---------- 路線分頁 ----------

export function RoutesTab({ ctx, date }: { ctx: TripCtx; date?: string }) {
  useViewVersion();
  const { trip } = ctx;
  const days = tripDays(trip.start_date, trip.end_date);
  const now = phoneNow();
  const selected = date && days.includes(date) ? date : days.includes(now.date) ? now.date : days[0];
  const view = dayView(ctx, selected);
  const group = view.split ? view.group ?? '' : '';
  const can = canEditGroup(ctx, selected, view.split ? group : null);
  const { legs, dismissed, activities } = dayLegs(trip.id, selected, group, view.plan,
    store.byTrip('activities', trip.id), store.byTrip('route_legs', trip.id, { includeDeleted: true }));
  const [adding, setAdding] = useState(false);
  const [maps, setMaps] = useState(false);
  const moves = ctx.editable ? legacyMoves(store, trip.id) : [];
  const japan = isJapan(trip);

  async function setUp(v: LegView) {
    const id = await ensureLeg(store, trip.id, selected, group, v);
    navigate(`/t/${trip.id}/leg/${id}/edit`);
  }

  async function dismiss(v: LegView) {
    await dismissLeg(store, trip.id, selected, group, v);
    toast('已刪除這段', 'ok', { label: '復原', run: () => { void restoreLeg(store, v.id); } });
  }

  async function convert() {
    const ok = await confirmDialog({
      title: `把 ${moves.length} 個「移動」行程轉成路線？`,
      message: '交通步驟會放到前後兩個行程之間的那一段，原本的移動行程會移到回收桶。',
      confirmText: '轉換',
    });
    if (!ok) return;
    const n = await convertMoves(store, trip.id);
    toast(`已轉換 ${n} 個`);
  }

  return (
    <div className="plan">
      <DayStrip days={days} selected={selected} today={now.date} onPick={(d) => navigate(`/t/${trip.id}/routes/${d}`, { replace: true })} />
      <div className="pad stack">
        <div className="section-head">
          <h2 className="section-title">{view.split ? `${groupName(view.plan, group)}的路線` : '這天的路線'}</h2>
          {can ? <Button variant="ghost" onClick={() => setAdding(true)}><Icon.plus /> 新增路線</Button> : null}
        </div>

        {moves.length ? (
          <Notice tone="warn">
            <p>行程頁有 {moves.length} 個舊的「移動」行程。</p>
            <Button variant="secondary" onClick={convert} style={{ marginTop: 8, minHeight: 42 }}>轉成路線</Button>
          </Notice>
        ) : null}

        {view.split && view.canSwitch ? (
          <div className="segmented" role="radiogroup" aria-label="查看哪一組">
            {view.plan!.groups.map((g) => (
              <button key={g} type="button" role="radio" aria-checked={view.group === g} className={view.group === g ? 'is-on' : ''}
                onClick={() => setViewGroup(trip.id, selected, g)}>
                {groupName(view.plan, g)}{view.myGroup === g ? '（我）' : ''}
              </button>
            ))}
          </div>
        ) : null}

        {legs.length ? legs.map((v) => {
          const set = Boolean(v.leg?.steps.length);
          const top = (
            <span className="leg-top">
              {v.time ? <span className="num">{v.time}</span> : null}
              <span>{v.fromName}</span>
              <span aria-hidden="true">→</span>
              <span>{v.toName}</span>
            </span>
          );
          if (set) {
            return (
              <div key={v.id} className="leg-card" role="button" tabIndex={0}
                onClick={() => navigate(`/t/${trip.id}/leg/${v.id}`)} onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/t/${trip.id}/leg/${v.id}`); }}>
                <span style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  {top}
                  {can ? <button type="button" className="link-btn inline tiny muted" style={{ marginLeft: 'auto', fontSize: 12 }}
                    onClick={(e) => { e.stopPropagation(); void dismiss(v); }}>不需要</button> : null}
                </span>
                <StepChips steps={v.leg!.steps} />
              </div>
            );
          }
          return (
            <div key={v.id} className="leg-card unset">
              {top}
              {can ? (
                <div className="grid-2">
                  <Button variant="secondary" onClick={() => setUp(v)} style={{ background: 'var(--butter)', minHeight: 42 }}>設定路線</Button>
                  <Button variant="secondary" onClick={() => dismiss(v)} style={{ minHeight: 42, borderWidth: 2, borderColor: 'var(--soft-line)', color: 'var(--ink-2)' }}>不需要（刪除）</Button>
                </div>
              ) : <span className="muted tiny">還沒設定路線</span>}
            </div>
          );
        }) : (
          <Empty title={activities.length < 2 ? '這天的行程少於兩個' : '這天沒有路線'}>
            {activities.length < 2 ? '在「行程」頁排好行程後，這裡會自動出現每一段點到點。' : can ? '按「新增路線」可以找回刪掉的段。' : null}
          </Empty>
        )}
        <p className="muted tiny center">依「行程」頁的時間自動產生每一段點到點{dismissed.length ? `・已刪除 ${dismissed.length} 段` : ''}</p>
      </div>

      <Button variant="secondary" className="maps-btn" onClick={() => setMaps(true)} style={{ background: 'var(--butter)', boxShadow: 'var(--pop)' }}>
        <Icon.place /> {japan ? '看完整地鐵圖' : '看完整路線圖'}
      </Button>

      {adding ? (
        <AddLegSheet trip={trip} date={selected} group={group} dismissed={dismissed}
          activities={activities.map((a) => ({ id: a.id, label: `${a.start_time ? `${hhmm(a.start_time)} ` : ''}${activityName(a, undefined)}` }))}
          onClose={() => setAdding(false)} />
      ) : null}
      {maps ? <MapsSheet ctx={ctx} onClose={() => setMaps(false)} /> : null}
    </div>
  );
}

function AddLegSheet({ trip, date, group, dismissed, activities, onClose }: {
  trip: Trip;
  date: string;
  group: string;
  dismissed: LegView[];
  activities: { id: string; label: string }[];
  onClose: () => void;
}) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(activities[0]?.id ?? '');
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const day = tripDays(trip.start_date, trip.end_date).indexOf(date) + 1;

  async function add() {
    try {
      const id = await addCustomLeg(store, trip.id, date, group,
        { activityId: from && from !== '_' ? from : null, name: fromText },
        { activityId: to && to !== '_' ? to : null, name: toText });
      onClose();
      navigate(`/t/${trip.id}/leg/${id}/edit`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const select = (value: string, set: (v: string) => void, label: string, text: string, setText: (v: string) => void) => (
    <div className="stack-sm" style={{ minWidth: 0 }}>
      <select className="input" aria-label={label} value={value} onChange={(e) => { set(e.target.value); setError(null); }}>
        <option value="" disabled>{label}</option>
        {activities.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        <option value="_">自己輸入地點…</option>
      </select>
      {value === '_' ? <input className="input" aria-label={`${label}（自己輸入）`} value={text} placeholder="例如：飯店" onChange={(e) => { setText(e.target.value); setError(null); }} /> : null}
    </div>
  );

  return (
    <Sheet title="新增路線" onClose={onClose}>
      {dismissed.length ? (
        <div className="stack-sm">
          <span className="section-title">之前按「不需要」刪掉的（Day {day}）</span>
          {dismissed.map((v) => (
            <div key={v.id} className="li">
              <span className="li-main" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 0 }}>
                <span>{v.fromName} → {v.toName}</span>
                {v.time ? <span className="muted tiny">{v.time}</span> : null}
              </span>
              <Button variant="secondary" onClick={() => { void restoreLeg(store, v.id); toast('已加回來'); }} style={{ minHeight: 40, background: 'var(--mint)', boxShadow: '0 3px 0 var(--ink)' }}>加回來</Button>
            </div>
          ))}
        </div>
      ) : <p className="muted small">沒有被刪掉的段。</p>}

      <div className="card stack-sm" style={{ borderStyle: 'dashed', borderColor: '#8b7f93' }}>
        <span>自己加一段</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', gap: 6, alignItems: 'start' }}>
          {select(from, setFrom, '從哪裡', fromText, setFromText)}
          <span style={{ paddingTop: 14 }} aria-hidden="true">→</span>
          {select(to, setTo, '到哪裡', toText, setToText)}
        </div>
        <span className="muted tiny">例如早上從飯店出發，第一段不在行程裡時</span>
        {error ? <span className="field-error">{error}</span> : null}
        <Button variant="ghost" block onClick={add}>加這一段</Button>
      </div>
    </Sheet>
  );
}

// ---------- 一段路線 ----------

function useLeg(tripId: string, legId: string) {
  useData();
  const { user } = useSession();
  const trip = store.get('trips', tripId);
  const leg = store.get('route_legs', legId);
  const ctx = trip ? tripCtx(trip, user) : null;
  return { trip, leg, ctx };
}

function endpoints(leg: RouteLeg) {
  const from = leg.from_activity_id ? store.get('activities', leg.from_activity_id) : undefined;
  const to = leg.to_activity_id ? store.get('activities', leg.to_activity_id) : undefined;
  return {
    from, to,
    fromName: from ? activityName(from, undefined) : leg.from_name || '出發地',
    toName: to ? activityName(to, undefined) : leg.to_name || '目的地',
  };
}

/** 步行或 Google 地圖用的地點文字：車站用日文站名，其他用名稱 */
function placeQuery(rail: RailData | null, stationId: string | undefined, name: string): string {
  const st = stationId && rail?.stations[stationId];
  if (st) return /駅$/.test(st.ja) ? st.ja : `${st.ja}駅`;
  return name;
}

/** 第 i 步步行的起點、終點：[給 Google 地圖用的, 顯示用的] */
function walkEnds(leg: RouteLeg, i: number, rail: RailData | null, fromName: string, toName: string) {
  const s = leg.steps[i];
  const prev = leg.steps[i - 1];
  const next = leg.steps[i + 1];
  const useFrom = !s.from.trim() || (prev && s.from.trim() === prev.to);
  const useTo = !s.to.trim() || (next && s.to.trim() === next.from);
  return {
    origin: useFrom ? (prev ? placeQuery(rail, prev.to_station, prev.to) : fromName) : s.from.trim(),
    dest: useTo ? (next ? placeQuery(rail, next.from_station, next.from) : toName) : s.to.trim(),
    fromLabel: useFrom ? (prev ? `${prev.to || '上一站'}${prev.mode === 'rail' && prev.to ? '站' : ''}` : fromName) : s.from.trim(),
    toLabel: useTo ? (next ? `${next.from || '下一站'}${next.mode === 'rail' && next.from ? '站' : ''}` : toName) : s.to.trim(),
  };
}

export function LegPage({ tripId, legId }: { tripId: string; legId: string }) {
  const { trip, leg, ctx } = useLeg(tripId, legId);
  const [diagram, setDiagram] = useState(false);
  const [maps, setMaps] = useState(false);
  const rail = useRail(Boolean(trip && isJapan(trip)));
  const close = () => goBack(leg ? `/t/${tripId}/routes/${leg.date}` : `/t/${tripId}/routes`);

  if (!trip || !leg || !ctx || leg.deleted_at) {
    return <Screen header={<TopBar title="路線" left={<BackButton onClick={close} />} />}><Empty title="找不到這段路線" /></Screen>;
  }
  const can = canEditGroup(ctx, leg.date, leg.group_key || null);
  const { from, to, fromName, toName } = endpoints(leg);
  const day = tripDays(trip.start_date, trip.end_date).indexOf(leg.date) + 1;
  const timeLine = [
    from?.start_time ? `${hhmm(from.start_time)} 出發` : '',
    to ? `下一個行程${to.start_time ? ` ${hhmm(to.start_time)}` : ''} ${activityName(to, undefined)}` : '',
  ].filter(Boolean).join('・');

  const blocks: ReactNode[] = [];
  leg.steps.forEach((s, i) => {
    const prev = leg.steps[i - 1];
    if (prev && prev.mode === 'rail' && s.mode === 'rail') {
      const same = rail && sameStation(rail, prev.to_station, s.from_station);
      blocks.push(<div key={`t-${s.id}`} className="transfer-note">{same || prev.to === s.from ? `在${s.from || prev.to}轉乘 ${shortLine(s.line)}` : '換車'}</div>);
    }
    if (s.mode === 'rail' || s.mode === 'bus') {
      const fg = s.mode === 'bus' ? 'var(--ink)' : textOn(s.color);
      const fromLink = s.mode === 'rail' && rail && s.from_station ? stationMapUrl(rail, s.from_station)
        : s.map_url && safeUrl(s.map_url) ? safeUrl(s.map_url)! : s.from ? searchUrl(`${s.from}${s.mode === 'bus' && isJapan(trip) ? ' バス停' : ''}`) : '';
      const toLink = s.mode === 'rail' && rail && s.to_station ? stationMapUrl(rail, s.to_station)
        : s.to ? searchUrl(`${s.to}${s.mode === 'bus' && isJapan(trip) ? ' バス停' : ''}`) : '';
      blocks.push(
        <div key={s.id} className="ride">
          <div className="ride-head" style={{ ['--c' as string]: s.mode === 'bus' ? 'var(--peach)' : s.color || 'var(--grey)', color: s.color || s.mode === 'bus' ? fg : 'var(--ink)' }}>
            {s.mode === 'bus' ? <Icon.bus /> : s.code ? <LineBadge code={s.code} color={s.color} size="lg" /> : <Icon.train />}
            <span className="ride-head-main">
              <b>{s.line || (s.mode === 'bus' ? '公車' : '電車')}</b>
              <span>{[s.direction, s.stops ? `${s.stops} 站` : ''].filter(Boolean).join('・')}</span>
            </span>
            {s.mode === 'rail' && s.line_id && rail ? (
              <button type="button" className="diagram-btn" onClick={() => setDiagram(true)}>看路線圖 ›</button>
            ) : <span className="diagram-btn" style={{ cursor: 'default' }}>{s.mode === 'bus' ? '公車' : '電車'}</span>}
          </div>
          <div className="ride-body">
            <div className="ride-end">
              <span className="lbl">上車</span>
              <span className="nm">{s.from_code ? <span className="st-code" style={{ ['--c' as string]: s.color }}>{s.from_code}</span> : null}<span>{s.from || '—'}</span></span>
              {fromLink ? <a href={fromLink} target="_blank" rel="noopener noreferrer">{s.mode === 'bus' ? '站牌位置' : '車站地圖'}</a> : null}
            </div>
            <span aria-hidden="true" style={{ color: s.color || 'var(--ink)', fontSize: 20 }}>→</span>
            <div className="ride-end">
              <span className="lbl">下車</span>
              <span className="nm">{s.to_code ? <span className="st-code" style={{ ['--c' as string]: s.color }}>{s.to_code}</span> : null}<span>{s.to || '—'}</span></span>
              {toLink ? <a href={toLink} target="_blank" rel="noopener noreferrer">{s.mode === 'bus' ? '站牌位置' : '車站地圖'}</a> : null}
            </div>
          </div>
          {s.note ? <div className="ride-note">{s.note}</div> : null}
        </div>,
      );
    } else if (s.mode === 'walk') {
      const w = walkEnds(leg, i, rail, fromName, toName);
      const url = s.map_url && safeUrl(s.map_url) ? safeUrl(s.map_url)! : directionsUrl(w.origin, w.dest, 'walking');
      blocks.push(
        <div key={s.id} className="walk-card">
          <Icon.walk />
          <div className="walk-card-main">
            <span style={{ fontSize: 16, color: 'var(--ink)' }}>步行</span>
            <span>{w.fromLabel} → {w.toLabel}</span>
            {s.note ? <span>{s.note}</span> : null}
          </div>
          <a className="pill-btn" href={url} target="_blank" rel="noopener noreferrer"><Icon.place />步行地圖</a>
        </div>,
      );
    } else {
      blocks.push(
        <div key={s.id} className="info-row"><Icon.car /><span className="stack-sm" style={{ gap: 2 }}><span>{s.line || '其他'}</span>{s.note ? <span className="muted small">{s.note}</span> : null}</span></div>,
      );
    }
  });

  return (
    <Screen header={<TopBar title={`Day ${day}`} subtitle={leg.group_key ? groupName(dayPlanOf(store, tripId, leg.date), leg.group_key) : undefined}
      left={<BackButton onClick={close} />}
      right={can ? <Button variant="ghost" onClick={() => navigate(`/t/${tripId}/leg/${leg.id}/edit`)}>編輯</Button> : null} />}>
      <div className="pad stack">
        <div className="card stack-sm" style={{ background: 'var(--grey)' }}>
          <div className="row-wrap" style={{ fontSize: 18 }}><span>{fromName}</span><span aria-hidden="true">→</span><span>{toName}</span></div>
          {timeLine ? <span className="small muted">{timeLine}</span> : null}
        </div>
        {leg.steps.length ? blocks : <Notice>還沒有設定怎麼走。{can ? '按右上角「編輯」。' : ''}</Notice>}
        <a className="btn btn-secondary btn-block" href={directionsUrl(from ? activityName(from, undefined) : fromName, to ? activityName(to, undefined) : toName, 'transit')}
          target="_blank" rel="noopener noreferrer"><Icon.search /> 用 Google 地圖查怎麼坐</a>
        {leg.notes ? <p className="note-text rich-text">{leg.notes}</p> : null}
        {can ? (
          <Button variant="text" className="danger" onClick={async () => {
            await removeLeg(store, leg);
            toast('已刪除這段', 'ok', { label: '復原', run: () => { void restoreLeg(store, leg.id); } });
            close();
          }}>刪除這段路線</Button>
        ) : null}
      </div>
      {diagram && rail ? <DiagramSheet leg={leg} rail={rail} fromName={fromName} toName={toName} onClose={() => setDiagram(false)} onMaps={() => { setDiagram(false); setMaps(true); }} /> : null}
      {maps ? <MapsSheet ctx={ctx} onClose={() => setMaps(false)} /> : null}
    </Screen>
  );
}

// ---------- 沿途路線圖 ----------

function DiagramSheet({ leg, rail, fromName, toName, onClose, onMaps }: {
  leg: RouteLeg; rail: RailData; fromName: string; toName: string; onClose: () => void; onMaps: () => void;
}) {
  const rides = leg.steps.filter((s) => s.mode === 'rail');
  const changes = Math.max(0, rides.length - 1);
  const parts: ReactNode[] = [];
  leg.steps.forEach((s, i) => {
    const line = s.mode === 'rail' ? lineById(rail, s.line_id) : undefined;
    const path = line && s.from_station && s.to_station ? ridePath(rail, line, s.from_station, s.to_station) : null;
    const next = leg.steps.slice(i + 1).find((x) => x.mode === 'rail');
    if (s.mode !== 'rail') {
      if (i > 0 && i < leg.steps.length - 1) {
        parts.push(<div key={s.id} className="dg-gap">{s.mode === 'walk' ? <Icon.walk /> : s.mode === 'bus' ? <Icon.bus /> : null}{stepSummary(s)}{s.to ? `到 ${s.to}` : ''}</div>);
      }
      return;
    }
    if (!line || !path) {
      parts.push(<div key={s.id} className="dg-gap">{shortLine(s.line) || '電車'}：{s.from} → {s.to}（沒有沿途資料）</div>);
      return;
    }
    parts.push(
      <div key={s.id} style={{ ['--c' as string]: line.color }}>
        <div className="dg-head">
          <LineBadge code={lineCode(line)} color={line.color} />
          <span>{shortLine(line.name)}・{s.direction || path.direction}・{path.stops} 站</span>
        </div>
        {path.stations.map((id, k) => {
          const first = k === 0;
          const last = k === path.stations.length - 1;
          const st = rail.stations[id];
          const xf = transfersAt(rail, id, line.id).filter((l) => lineCode(l)).slice(0, 5);
          const isChange = last && next && rides.length > 1;
          return (
            <div key={`${id}-${k}`} className={`dg-st${first || last ? ' big' : ''}${first ? ' first' : ''}${last ? ' last' : ''}`}>
              <span className="no">{codeAt(line, id)}</span>
              <span className="rail"><i /></span>
              <span className="dg-name">
                <span>{st?.n ?? id}</span>
                {first ? <span className="dg-tag" style={{ background: 'var(--pink)' }}>上車</span> : null}
                {last ? <span className="dg-tag" style={{ background: isChange ? 'var(--butter)' : 'var(--mint)' }}>{isChange ? '換車' : '下車'}</span> : null}
                {!first && !last && xf.length ? (
                  <span className="dg-xf" aria-label="可轉乘">{xf.map((l) => <span key={l.id} style={{ ['--c' as string]: l.color }}>{lineCode(l)}</span>)}</span>
                ) : null}
              </span>
            </div>
          );
        })}
        {next ? (
          <div className="dg-gap"><Icon.swap />在{s.to}換 {shortLine(next.line)}{sameStation(rail, s.to_station, next.from_station) ? '（站內走過去）' : ''}</div>
        ) : null}
      </div>,
    );
  });
  return (
    <Sheet title="沿途路線圖" subtitle={`${fromName} → ${toName}${changes ? `・換車 ${changes} 次` : ''}`} onClose={onClose} tall
      footer={<Button variant="ghost" block onClick={onMaps}>看完整路線圖</Button>}>
      <div className="diagram">{parts}</div>
      <p className="muted tiny">快速、急行等車種只停部分站，以月台顯示為準。路線資料：{rail.source}（{rail.updated}）</p>
    </Sheet>
  );
}

// ---------- 完整路線圖 ----------

const OFFICIAL_MAPS = [
  { label: '東京地鐵路線圖（Metro・都營）', detail: 'GO TOKYO 東京官方觀光網站・中文 PDF', url: 'https://www.gotokyo.org/tc/plan/getting-around/subways/documents/rotemap_ttg_lite_all_tc.pdf' },
  { label: 'JR 東日本路線圖', detail: 'JR 東日本官方網站・中文', url: 'https://www.jreast.co.jp/tc/routemaps/bystation.html' },
];

function MapsSheet({ ctx, onClose }: { ctx: TripCtx; onClose: () => void }) {
  const { trip } = ctx;
  const maps = trip.settings?.maps ?? [];
  const [busy, setBusy] = useState(false);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const blob = await prepareUpload(file);
      const id = crypto.randomUUID();
      const path = `${trip.id}/map-${id}.${blob.type === 'image/png' ? 'png' : 'jpg'}`;
      await store.saveFile(path, blob, true);
      const label = file.name.replace(/\.[^.]+$/, '') || '路線圖';
      await store.update('trips', trip.id, { settings: { ...trip.settings, maps: [...maps, { id, label, path }] } });
      toast('已加入，沒網路也能看');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const ok = await confirmDialog({ title: '刪除這張路線圖？', confirmText: '刪除', danger: true });
    if (!ok) return;
    await store.update('trips', trip.id, { settings: { ...trip.settings, maps: maps.filter((m) => m.id !== id) } });
  }

  return (
    <Sheet title="完整路線圖" onClose={onClose}>
      <span className="section-title">我們自己存的（沒網路也能看）</span>
      {maps.length ? maps.map((m) => (
        <div key={m.id} className="li">
          <button type="button" className="li-main" onClick={() => navigate(`/t/${trip.id}/map/${m.id}`)}><Icon.place /><span>{m.label}</span></button>
          {ctx.editable ? <button type="button" className="icon-btn plain" aria-label={`刪除 ${m.label}`} onClick={() => remove(m.id)}><Icon.trash /></button> : null}
        </div>
      )) : <p className="muted small">{ctx.editable ? '還沒有。可以上傳一張路線圖圖片（例如官方 PDF 的截圖）。' : '管理者上傳後會出現在這裡。'}</p>}
      {ctx.editable ? (
        <label className="btn btn-secondary btn-block" style={{ borderStyle: 'dashed' }}>
          {busy ? <span className="spinner" aria-hidden="true" /> : <Icon.plus />} 上傳一張路線圖
          <input type="file" accept="image/*" hidden onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      ) : null}
      {isJapan(trip) ? (
        <>
          <span className="section-title" style={{ marginTop: 6 }}>官方路線圖（需要網路，永遠是最新版）</span>
          {OFFICIAL_MAPS.map((m) => (
            <a key={m.url} className="li" href={m.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'var(--ink)' }}>
              <span className="li-main" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 0 }}><span>{m.label}</span><span className="muted tiny">{m.detail}</span></span>
              <Icon.chevron />
            </a>
          ))}
        </>
      ) : null}
    </Sheet>
  );
}

export function MapViewPage({ tripId, mapId }: { tripId: string; mapId: string }) {
  useData();
  const trip = store.get('trips', tripId);
  const m = trip?.settings?.maps?.find((x) => x.id === mapId);
  const file = useFileUrl(m?.path);
  const [zoom, setZoom] = useState(false);
  const close = () => goBack(`/t/${tripId}/routes`);
  return (
    <Screen header={<TopBar title={m?.label ?? '路線圖'} left={<BackButton onClick={close} />} />}>
      {!m ? <Empty title="找不到這張路線圖" /> : file.url ? (
        <div className={`ticket-view${zoom ? ' zoom' : ''}`} style={{ overflow: 'auto', height: '100%' }}>
          <button type="button" onClick={() => setZoom(!zoom)} aria-label={zoom ? '縮小' : '放大'}
            style={{ border: 0, padding: 0, background: 'none', cursor: zoom ? 'zoom-out' : 'zoom-in', display: 'block', width: zoom ? 'auto' : '100%' }}>
            <img src={file.url} alt={m.label} />
          </button>
        </div>
      ) : <Empty title={file.state === 'offline' ? '沒有網路，這張圖還沒下載到手機' : file.state === 'loading' ? '載入中…' : '找不到圖片'} />}
    </Screen>
  );
}

// ---------- 編輯一段路線 ----------

const MODES: { value: LegMode; label: string }[] = [
  { value: 'rail', label: '地鐵／電車' },
  { value: 'bus', label: '公車' },
  { value: 'walk', label: '步行' },
];

function newStep(mode: LegMode): LegStep {
  return { id: crypto.randomUUID(), mode, line: '', from: '', to: '', direction: '', note: '', stops: null };
}

export function LegForm({ tripId, legId }: { tripId: string; legId: string }) {
  const { trip, leg, ctx } = useLeg(tripId, legId);
  const rail = useRail(Boolean(trip && isJapan(trip)));
  const [steps, setSteps] = useState<LegStep[]>(() => leg?.steps.length ? structuredClone(leg.steps) : [newStep('walk'), newStep('rail'), newStep('walk')]);
  const [notes, setNotes] = useState(leg?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const close = () => goBack(`/t/${tripId}/leg/${legId}`);

  if (!trip || !leg || !ctx || leg.deleted_at) {
    return <Screen header={<TopBar title="路線" left={<BackButton onClick={close} />} />}><Empty title="找不到這段路線" /></Screen>;
  }
  if (!canEditGroup(ctx, leg.date, leg.group_key || null)) {
    return <Screen header={<TopBar title="路線" left={<BackButton onClick={close} />} />}><Empty title="只能看，不能改">使用者只能設定分組那天自己那一組的路線。</Empty></Screen>;
  }
  const { fromName, toName } = endpoints(leg);
  const japan = isJapan(trip);

  const set = (i: number, patch: Partial<LegStep>) => setSteps((xs) => xs.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, dir: -1 | 1) => setSteps((xs) => {
    const n = [...xs];
    const [s] = n.splice(i, 1);
    n.splice(i + dir, 0, s);
    return n;
  });

  async function save() {
    setBusy(true);
    try {
      const clean = steps.map((s) => ({ ...s, line: s.line.trim(), from: s.from.trim(), to: s.to.trim(), direction: s.direction.trim(), note: s.note.trim(),
        map_url: s.map_url?.trim() ? safeUrl(s.map_url) ?? '' : undefined }));
      await saveLegSteps(store, leg!.id, clean, notes);
      toast('已儲存');
      navigate(`/t/${tripId}/leg/${leg!.id}`, { replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen header={<TopBar title="編輯路線" subtitle={`${fromName} → ${toName}`} left={<Button variant="text" onClick={close}>取消</Button>}
      right={<Button variant="primary" busy={busy} onClick={save} style={{ minHeight: 44 }}>儲存</Button>} />}>
      <div className="pad stack">
        {steps.map((s, i) => (
          <div key={s.id} className="step-editor">
            <div className="step-editor-head">
              <span className="num" style={{ fontSize: 18 }}>第 {i + 1} 步</span>
              <span className="spacer" />
              <button type="button" className="icon-btn plain" aria-label="往上移" disabled={i === 0} onClick={() => move(i, -1)}><Icon.up /></button>
              <button type="button" className="icon-btn plain" aria-label="往下移" disabled={i === steps.length - 1} onClick={() => move(i, 1)}><Icon.down /></button>
              <button type="button" className="icon-btn plain" aria-label="刪除這一步" onClick={() => setSteps((xs) => xs.filter((_, j) => j !== i))}><Icon.trash /></button>
            </div>
            <div className="mode-grid" role="radiogroup" aria-label="交通方式">
              {MODES.map((m) => (
                <button key={m.value} type="button" role="radio" aria-checked={s.mode === m.value} className="kind-btn"
                  style={s.mode === m.value ? { background: 'var(--pink)', boxShadow: 'var(--pop)' } : undefined}
                  onClick={() => set(i, { mode: m.value, ...(m.value !== s.mode ? { line_id: undefined, color: undefined, code: undefined, from_station: undefined, to_station: undefined, from_code: undefined, to_code: undefined, stops: null } : {}) })}>
                  {m.label}
                </button>
              ))}
            </div>
            {s.mode === 'other' ? <p className="muted small">舊資料：{s.line || '其他'}（可以改成上面三種）</p> : null}
            {s.mode === 'rail' ? (
              japan && rail ? <RailPicker s={s} rail={rail} onChange={(p) => set(i, p)} /> : <ManualRail s={s} onChange={(p) => set(i, p)} />
            ) : s.mode === 'bus' ? (
              <>
                <div className="grid-2">
                  <Field label="公車路線"><input className="input" value={s.line} placeholder="例如：都01" onChange={(e) => set(i, { line: e.target.value })} /></Field>
                  <Field label="往哪個方向"><input className="input" value={s.direction} placeholder="例如：往新橋站" onChange={(e) => set(i, { direction: e.target.value })} /></Field>
                </div>
                <div className="grid-2">
                  <Field label="上車站牌"><input className="input" value={s.from} onChange={(e) => set(i, { from: e.target.value })} /></Field>
                  <Field label="下車站牌"><input className="input" value={s.to} onChange={(e) => set(i, { to: e.target.value })} /></Field>
                </div>
                <Field label="上車站牌位置連結（可不填）" hint="不填會用站牌名稱在 Google 地圖搜尋">
                  <input className="input" inputMode="url" value={s.map_url ?? ''} placeholder="https://maps.app.goo.gl/…" onChange={(e) => set(i, { map_url: e.target.value })} />
                </Field>
              </>
            ) : s.mode === 'walk' ? (
              <>
                <div className="grid-2">
                  <Field label="從（可不填）"><input className="input" value={s.from} placeholder={i === 0 ? fromName : '上一步的下車站'} onChange={(e) => set(i, { from: e.target.value })} /></Field>
                  <Field label="到（可不填）"><input className="input" value={s.to} placeholder={i === steps.length - 1 ? toName : '下一步的上車站'} onChange={(e) => set(i, { to: e.target.value })} /></Field>
                </div>
                <Field label="步行地圖連結（可不填）" hint="不填就自動用起點、終點開 Google 地圖步行導航">
                  <input className="input" inputMode="url" value={s.map_url ?? ''} placeholder="https://maps.app.goo.gl/…" onChange={(e) => set(i, { map_url: e.target.value })} />
                </Field>
              </>
            ) : null}
            <Field label={s.mode === 'rail' ? '出口、車廂、轉乘提醒（可不填）' : '提醒（可不填）'}>
              <input className="input" value={s.note} placeholder={s.mode === 'rail' ? '例如：坐前面車廂比較近出口' : ''} onChange={(e) => set(i, { note: e.target.value })} />
            </Field>
          </div>
        ))}
        <div className="field">
          <span className="field-label">再加一步</span>
          <div className="mode-grid">
            {MODES.map((m) => (
              <Button key={m.value} variant="secondary" onClick={() => setSteps((xs) => [...xs, newStep(m.value)])} style={{ borderStyle: 'dashed', minHeight: 46, padding: '0 6px' }}>
                <Icon.plus />{m.label}
              </Button>
            ))}
          </div>
        </div>
        <Field label="這段的補充（可不填）">
          <TextArea value={notes} onChange={setNotes} minRows={2} placeholder="例如：行李多可以搭計程車" />
        </Field>
        <a className="btn btn-secondary btn-block" href={directionsUrl(fromName, toName, 'transit')} target="_blank" rel="noopener noreferrer">
          <Icon.search /> 用 Google 地圖查怎麼坐
        </a>
        <Button variant="primary" block busy={busy} onClick={save}>儲存</Button>
      </div>
    </Screen>
  );
}

function ManualRail({ s, onChange, onBack }: { s: LegStep; onChange: (p: Partial<LegStep>) => void; onBack?: () => void }) {
  return (
    <>
      <div className="grid-2">
        <Field label="路線"><input className="input" value={s.line} placeholder="例如：銀座線" onChange={(e) => onChange({ line: e.target.value })} /></Field>
        <Field label="往哪個方向"><input className="input" value={s.direction} placeholder="例如：往澀谷方向" onChange={(e) => onChange({ direction: e.target.value })} /></Field>
      </div>
      <div className="grid-2">
        <Field label="上車站"><input className="input" value={s.from} onChange={(e) => onChange({ from: e.target.value })} /></Field>
        <Field label="下車站"><input className="input" value={s.to} onChange={(e) => onChange({ to: e.target.value })} /></Field>
      </div>
      {onBack ? <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={onBack}>改回從清單選路線</button> : null}
    </>
  );
}

function RailPicker({ s, rail, onChange }: { s: LegStep; rail: RailData; onChange: (p: Partial<LegStep>) => void }) {
  const [manual, setManual] = useState(() => !s.line_id && Boolean(s.line));
  const [picking, setPicking] = useState(false);
  const line = lineById(rail, s.line_id);
  if (manual) {
    return <ManualRail s={s} onChange={onChange} onBack={() => { setManual(false); onChange({ line: '', direction: '', from: '', to: '' }); }} />;
  }
  const stations = line ? uniqueStations(rail, line) : [];

  function pickLine(l: RailLine) {
    setPicking(false);
    onChange({ line_id: l.id, line: l.name, color: l.color, code: lineCode(l), from: '', to: '', from_station: undefined, to_station: undefined, from_code: '', to_code: '', direction: '', stops: null });
  }

  function pickStation(which: 'from' | 'to', id: string) {
    if (!line) return;
    const st = rail.stations[id];
    const fromId = which === 'from' ? id : s.from_station;
    const toId = which === 'to' ? id : s.to_station;
    const patch: Partial<LegStep> = which === 'from'
      ? { from_station: id, from: st?.n ?? '', from_code: codeAt(line, id) }
      : { to_station: id, to: st?.n ?? '', to_code: codeAt(line, id) };
    const path = fromId && toId ? ridePath(rail, line, fromId, toId) : null;
    onChange({ ...patch, direction: path?.direction ?? '', stops: path?.stops ?? null });
  }

  const path = line && s.from_station && s.to_station ? ridePath(rail, line, s.from_station, s.to_station) : null;
  return (
    <>
      <div className="field">
        <span className="field-label">搭哪一條線</span>
        <button type="button" className={`line-opt${line ? ' is-on' : ''}`} style={{ minHeight: 52 }} onClick={() => setPicking(true)}>
          {line ? <><LineBadge code={lineCode(line)} color={line.color} /><span>{line.name}</span></> : <><Icon.search /><span>選路線（可以搜尋站名）</span></>}
          <span style={{ marginLeft: 'auto' }}><Icon.chevron /></span>
        </button>
      </div>
      {line ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', gap: 8, alignItems: 'end' }}>
            <div className="field">
              <label className="field-label" htmlFor={`${s.id}-from`}>上車站</label>
              <select id={`${s.id}-from`} className="input" value={s.from_station ?? ''} onChange={(e) => pickStation('from', e.target.value)}>
                <option value="" disabled>選車站</option>
                {stations.map((id) => <option key={id} value={id}>{[codeAt(line, id), rail.stations[id]?.n].filter(Boolean).join(' ')}</option>)}
              </select>
            </div>
            <span aria-hidden="true" style={{ paddingBottom: 14, color: line.color, fontSize: 20 }}>→</span>
            <div className="field">
              <label className="field-label" htmlFor={`${s.id}-to`}>下車站</label>
              <select id={`${s.id}-to`} className="input" value={s.to_station ?? ''} onChange={(e) => pickStation('to', e.target.value)}>
                <option value="" disabled>選車站</option>
                {stations.map((id) => <option key={id} value={id}>{[codeAt(line, id), rail.stations[id]?.n].filter(Boolean).join(' ')}</option>)}
              </select>
            </div>
          </div>
          {path && path.stops > 0 ? (
            <div className="auto-note"><Icon.check />自動算好：{path.direction}・{path.stops} 站</div>
          ) : s.from_station && s.to_station ? <p className="field-error">上車站和下車站一樣</p> : null}
          <span className="field-hint">車站位置連結會自動帶入。</span>
        </>
      ) : null}
      <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => { setManual(true); onChange({ line_id: undefined, color: undefined, code: undefined, from_station: undefined, to_station: undefined, from_code: undefined, to_code: undefined }); }}>
        清單裡沒有這條線？自己輸入
      </button>
      {picking ? <LinePickerSheet rail={rail} current={s.line_id} onPick={pickLine} onClose={() => setPicking(false)} /> : null}
    </>
  );
}

function LinePickerSheet({ rail, current, onPick, onClose }: { rail: RailData; current?: string; onPick: (l: RailLine) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const popular = POPULAR_LINES.map((id) => lineById(rail, id)).filter((l): l is RailLine => Boolean(l));
  const list = q.trim() ? searchLines(rail, q) : [...popular, ...rail.lines.filter((l) => !popular.includes(l))];
  return (
    <Sheet title="搭哪一條線" onClose={onClose} tall>
      <label className="input-row input" style={{ borderRadius: 999, minHeight: 48, padding: '0 14px' }}>
        <Icon.search />
        <input type="search" value={q} autoFocus placeholder="搜尋路線或車站，例如：澀谷" aria-label="搜尋路線或車站"
          style={{ flex: '1 1 auto', minWidth: 0, border: 0, outline: 'none', background: 'transparent', fontSize: 16 }} onChange={(e) => setQ(e.target.value)} />
      </label>
      {!q.trim() ? <span className="section-title">常用路線在最前面</span> : null}
      <div className="line-grid">
        {list.map((l) => (
          <button key={l.id} type="button" className={`line-opt${l.id === current ? ' is-on' : ''}`} onClick={() => onPick(l)}>
            <LineBadge code={lineCode(l) || '•'} color={l.color} /><span>{shortLine(l.name)}</span>
          </button>
        ))}
      </div>
      {!list.length ? <p className="muted small">找不到。可以關掉後按「自己輸入」。</p> : null}
      <p className="muted tiny">路線資料：{rail.source}（{rail.updated} 更新）</p>
    </Sheet>
  );
}

