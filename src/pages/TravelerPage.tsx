// 新增／編輯同行者
import { useState } from 'react';
import { store, useData } from '../app/services.ts';
import { goBack } from '../app/router.ts';
import { newTraveler, TRAVELER_COLORS } from '../data/factories.ts';
import { Button, Field, Notice, Screen, TextArea, TopBar } from '../ui/kit.tsx';
import { confirmDialog, toast } from '../ui/dialog.tsx';

export function TravelerPage({ tripId, travelerId }: { tripId: string; travelerId: string | 'new' }) {
  useData();
  const isNew = travelerId === 'new';
  const existing = isNew ? undefined : store.get('travelers', travelerId);
  const others = store.byTrip('travelers', tripId);
  const [name, setName] = useState(existing?.name ?? '');
  const [color, setColor] = useState(existing?.color ?? TRAVELER_COLORS[others.length % TRAVELER_COLORS.length]);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const close = () => goBack(`/t/${tripId}/settings`);

  if (!isNew && !existing) {
    return <Screen header={<TopBar title="同行者" left={<Button variant="text" onClick={close}>返回</Button>} />}><div className="pad muted">找不到這位同行者。</div></Screen>;
  }

  async function save() {
    const n = name.trim();
    if (!n) return setError('請輸入名字');
    if (others.some((t) => t.id !== existing?.id && t.name.trim() === n)) return setError('已經有同名的同行者');
    if (existing) {
      await store.update('travelers', existing.id, { name: n, color, notes });
    } else {
      const maxOrder = Math.max(-1, ...others.map((t) => t.sort_order));
      await store.create('travelers', newTraveler(tripId, { name: n, color, notes, sort_order: maxOrder + 1 }));
    }
    toast('已儲存');
    close();
  }

  async function remove() {
    if (!existing) return;
    const linked = store.members(tripId).filter((m) => m.traveler_id === existing.id).length;
    const ok = await confirmDialog({
      title: `刪除「${existing.name}」？`,
      message: (
        <>
          <p>行程和票券不會被刪除，只是不再顯示屬於這位同行者。</p>
          {linked ? <p>有 {linked} 支手機設定「我是{existing.name}」，需要重新選擇。</p> : null}
          <p>之後可以在設定的「同行者」下方還原。</p>
        </>
      ),
      confirmText: '刪除',
      danger: true,
    });
    if (!ok) return;
    await store.softDelete('travelers', existing.id);
    toast('已刪除');
    close();
  }

  return (
    <Screen header={
      <TopBar title={isNew ? '新增同行者' : '編輯同行者'}
        left={<Button variant="text" onClick={close}>取消</Button>}
        right={<Button variant="text" className="strong" onClick={save}>儲存</Button>} />
    }>
      <div className="pad stack">
        <Field label="名字" error={error}>
          <input className="input" value={name} placeholder="例如：小寶" onChange={(e) => { setName(e.target.value); setError(null); }} />
        </Field>
        <div className="field">
          <span className="field-label">代表色</span>
          <div className="swatches" role="radiogroup" aria-label="代表色">
            {TRAVELER_COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={c === color} aria-label={c}
                className={`swatch${c === color ? ' is-on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />
            ))}
          </div>
        </div>
        <Field label="備註（可不填）">
          <TextArea value={notes} onChange={setNotes} placeholder="例如：護照號碼放在哪、過敏食物…" minRows={2} />
        </Field>
        <Notice>同行者的資料所有成員都看得到，請不要填密碼或證件號碼等敏感資料。</Notice>
        <Button variant="primary" block onClick={save}>儲存</Button>
        {existing ? <Button variant="danger" block onClick={remove}>刪除這位同行者</Button> : null}
      </div>
    </Screen>
  );
}
