// 這天設定：主題、全員一起或分組、組別名稱、每位旅伴跟哪一組
import { useState } from 'react';
import { store, useData, useSession } from '../app/services.ts';
import { goBack } from '../app/router.ts';
import { tripCtx } from '../app/tripContext.ts';
import { dayPlanOf, saveDayPlan } from '../data/actions.ts';
import { dayLabel, daysBetween } from '../lib/dates.ts';
import { Button, Empty, Screen, TopBar } from '../ui/kit.tsx';
import { Icon } from '../ui/icons.tsx';
import { Mascot } from '../ui/Mascot.tsx';
import { confirmDialog, toast } from '../ui/dialog.tsx';

const KEYS = ['A', 'B', 'C', 'D'];
const GROUP_BG = ['var(--mint)', 'var(--aqua)', 'var(--peach)', 'var(--lilac)'];

export function DayPage({ tripId, date }: { tripId: string; date: string }) {
  useData();
  const { user } = useSession();
  const trip = store.get('trips', tripId);
  const plan = trip ? dayPlanOf(store, tripId, date) : undefined;
  const [mode, setMode] = useState<'together' | 'split'>(plan?.mode ?? 'together');
  const [groups, setGroups] = useState<string[]>(plan?.groups?.length ? plan.groups : ['A', 'B']);
  const [names, setNames] = useState<Record<string, string>>(plan?.group_names ?? {});
  const [assign, setAssign] = useState<Record<string, string>>(plan?.assignments ?? {});
  const [busy, setBusy] = useState(false);
  const close = () => goBack(`/t/${tripId}/plan/${date}`);

  if (!trip) return <Screen header={<TopBar title="這天設定" left={<Button variant="text" onClick={close}>返回</Button>} />}><Empty title="找不到這趟旅行" /></Screen>;
  const ctx = tripCtx(trip, user);
  if (!ctx.editable) return <Screen header={<TopBar title="這天設定" left={<Button variant="text" onClick={close}>返回</Button>} />}><Empty title="只有管理者可以設定">分組和這天的設定由管理者負責。</Empty></Screen>;

  const dayN = daysBetween(trip.start_date, date) + 1;
  const used = (g: string) => store.byTrip('activities', tripId).filter((a) => a.date === date && a.audience_groups.includes(g)).length;

  function addGroup() {
    const next = KEYS.find((k) => !groups.includes(k));
    if (next) setGroups([...groups, next]);
  }

  async function removeGroup(g: string) {
    const n = used(g);
    if (n) {
      const ok = await confirmDialog({
        title: `移除「${names[g] || `${g} 組`}」？`,
        message: `這天有 ${n} 筆行程只給這組看。移除後，這些行程只有在「全部」裡看得到，你可以再改它們的「誰會看到」。`,
        confirmText: '移除',
        danger: true,
      });
      if (!ok) return;
    }
    setGroups(groups.filter((x) => x !== g));
    setAssign(Object.fromEntries(Object.entries(assign).filter(([, v]) => v !== g)));
  }

  async function save() {
    const unassigned = ctx.travelers.filter((t) => !assign[t.id] || !groups.includes(assign[t.id]));
    if (mode === 'split' && unassigned.length) {
      const ok = await confirmDialog({
        title: '還有人沒分組',
        message: `${unassigned.map((t) => t.name).join('、')} 還沒選組，他們這天只會看到「所有人」的共同活動。`,
        confirmText: '仍要儲存',
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const cleanNames = Object.fromEntries(groups.map((g) => [g, (names[g] ?? '').trim()]).filter(([, v]) => v));
      const cleanAssign = Object.fromEntries(Object.entries(assign).filter(([t, g]) => groups.includes(g) && ctx.travelers.some((x) => x.id === t)));
      await saveDayPlan(store, tripId, date, { mode, groups, group_names: cleanNames, assignments: cleanAssign });
      toast('已儲存');
      close();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen header={
      <TopBar title="這天設定" subtitle={`Day ${dayN}・${dayLabel(date)}`}
        left={<Button variant="text" onClick={close}>取消</Button>}
        right={<Button variant="primary" busy={busy} onClick={save} style={{ minHeight: 44 }}>儲存</Button>} />
    }>
      <div className="pad stack-lg">
        <div className="field">
          <span className="field-label">這一天</span>
          <div className="grid-2" role="radiogroup" aria-label="這一天要不要分組">
            <button type="button" role="radio" aria-checked={mode === 'together'} className="kind-btn"
              style={mode === 'together' ? { background: 'var(--pink)', boxShadow: 'var(--pop)', minHeight: 64 } : { minHeight: 64, borderStyle: 'dashed', color: 'var(--ink-2)' }}
              onClick={() => setMode('together')}>全員一起</button>
            <button type="button" role="radio" aria-checked={mode === 'split'} className="kind-btn"
              style={mode === 'split' ? { background: 'var(--pink)', boxShadow: 'var(--pop)', minHeight: 64 } : { minHeight: 64, borderStyle: 'dashed', color: 'var(--ink-2)' }}
              onClick={() => setMode('split')}>分組行動</button>
          </div>
        </div>

        {mode === 'split' ? (
          <>
            <div className="field">
              <span className="field-label">組別名稱</span>
              <div className="stack-sm">
                {groups.map((g, i) => (
                  <div key={g} className="input-row">
                    <span className="avatar" style={{ background: GROUP_BG[i % GROUP_BG.length] }}><span className="num">{g}</span></span>
                    <input className="input" aria-label={`${g} 組名稱`} value={names[g] ?? ''} placeholder={`${g} 組（例如：逛街組）`}
                      onChange={(e) => setNames({ ...names, [g]: e.target.value })} />
                    {groups.length > 2 ? (
                      <button type="button" className="icon-btn plain" aria-label={`移除 ${g} 組`} onClick={() => removeGroup(g)}><Icon.close /></button>
                    ) : null}
                  </div>
                ))}
                {groups.length < KEYS.length ? (
                  <Button variant="secondary" onClick={addGroup} style={{ borderStyle: 'dashed' }}><Icon.plus /> 加一組</Button>
                ) : null}
              </div>
            </div>

            <div className="field">
              <span className="field-label">誰跟哪一組</span>
              {ctx.travelers.length ? (
                <div className="stack-sm">
                  {ctx.travelers.map((t) => (
                    <div key={t.id} className="card" style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span className="avatar sm" style={{ background: t.color || 'var(--surface)' }}>{t.name.slice(0, 1)}</span>
                      <span style={{ fontSize: 18 }}>{t.name}</span>
                      <span className="spacer" />
                      <div className="chips">
                        {groups.map((g, i) => (
                          <button key={g} type="button" aria-pressed={assign[t.id] === g}
                            className={`chip${assign[t.id] === g ? ' is-on' : ''}`} style={assign[t.id] === g ? { background: GROUP_BG[i % GROUP_BG.length], minHeight: 40 } : { minHeight: 40 }}
                            onClick={() => setAssign({ ...assign, [t.id]: g })}>
                            {names[g]?.trim() || `${g} 組`}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="notice small">還沒有旅伴，先到「旅伴・設定」新增。</p>}
            </div>

            <div className="mascot-row">
              <Mascot size={52} mood="wink" />
              <div className="bubble small">大家一起吃的晚餐，新增時選「所有人」就好，只要輸入一次，每一組都看得到喔！</div>
            </div>
          </>
        ) : (
          <p className="muted small">這天所有人看到同一份行程。之後想分開行動，再切到「分組行動」。</p>
        )}
      </div>
    </Screen>
  );
}
