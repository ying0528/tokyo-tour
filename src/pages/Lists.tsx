// 清單：每個人自己的清單（想買的、想吃的…），可以分享給大家看；打勾只有自己看得到
import { useState } from 'react';
import { store, useData, useSession } from '../app/services.ts';
import { goBack, navigate } from '../app/router.ts';
import type { TripCtx } from '../app/tripContext.ts';
import {
  checkedItems, createList, deleteListItem, listsOf, moveListItem, saveListItem, toggleListCheck, updateList, validateListItem,
} from '../data/actions.ts';
import type { ListItem, TripList } from '../data/types.ts';
import { safeUrl } from '../lib/links.ts';
import { BackButton, Button, Dot, Empty, Field, Screen, Segmented, TopBar } from '../ui/kit.tsx';
import { Icon } from '../ui/icons.tsx';
import { Sheet } from '../ui/Sheet.tsx';
import { confirmDialog, toast } from '../ui/dialog.tsx';

const ICONS = ['📝', '🛍️', '💊', '🍰', '🍜', '🎁', '🧸', '🍶', '👗', '📷', '⭐', '❤️'];
const BGS = ['var(--pink)', 'var(--peach)', 'var(--mint)', 'var(--aqua)', 'var(--lilac)', 'var(--grey)'];

function iconBg(l: TripList) {
  const i = Math.max(0, ICONS.indexOf(l.icon));
  return BGS[i % BGS.length];
}

/** 清單擁有者：用他選的「我是誰」顯示名字和顏色 */
function ownerOf(tripId: string, userId: string) {
  const m = store.members(tripId).find((x) => x.user_id === userId);
  const t = m?.traveler_id ? store.get('travelers', m.traveler_id) : undefined;
  return { name: t?.name || m?.display_name || '旅伴', color: t?.color || 'var(--muted)' };
}

export function ListsTab({ ctx }: { ctx: TripCtx }) {
  useData();
  const { user } = useSession();
  const [adding, setAdding] = useState(false);
  const { mine, shared } = listsOf(store, ctx.trip.id, user?.id);
  const open = (l: TripList) => navigate(`/t/${ctx.trip.id}/l/${l.id}`);

  return (
    <div className="pad stack">
      <div className="section-head">
        <h2 className="section-title">我的清單</h2>
        <Button variant="primary" onClick={() => setAdding(true)} style={{ minHeight: 44 }}><Icon.plus /> 新增清單</Button>
      </div>
      {mine.length ? mine.map((l) => {
        const done = checkedItems(store, l.id, user?.id);
        const n = l.items.filter((i) => done.has(i.id)).length;
        return (
          <button key={l.id} type="button" className="list-card" onClick={() => open(l)}>
            <span className="list-ic" style={{ background: iconBg(l) }} aria-hidden="true">{l.icon || '📝'}</span>
            <span className="list-card-main">
              <span className="list-card-title">{l.title}</span>
              <span className="list-card-sub">{l.items.length} 項{n ? `・買到 ${n} 項` : ''}</span>
            </span>
            <span className={`chip-soft${l.shared ? ' ok' : ''}`}>{l.shared ? '已分享' : '只有我看得到'}</span>
          </button>
        );
      }) : (
        <Empty title="還沒有清單">想買的、想吃的、伴手禮…按「新增清單」開始記。</Empty>
      )}

      <div className="divider-dash" />
      <h2 className="section-title">看看別人分享的清單</h2>
      {shared.length ? shared.map((l) => {
        const o = ownerOf(ctx.trip.id, l.owner_id);
        return (
          <button key={l.id} type="button" className="list-card other" onClick={() => open(l)}>
            <span className="list-ic" style={{ background: iconBg(l) }} aria-hidden="true">{l.icon || '📝'}</span>
            <span className="list-card-main">
              <span className="list-card-title">{l.title}</span>
              <span className="list-card-sub">{l.items.length} 項</span>
            </span>
            <span className="who"><Dot color={o.color} />{o.name}分享</span>
          </button>
        );
      }) : <p className="muted small">家人分享清單後會出現在這裡。</p>}

      {adding && user ? <ListNameSheet title="新增清單" onClose={() => setAdding(false)} onSave={async (title, icon) => {
        const id = await createList(store, ctx.trip.id, user.id, title, icon);
        setAdding(false);
        navigate(`/t/${ctx.trip.id}/l/${id}`);
      }} /> : null}
    </div>
  );
}

function ListNameSheet({ title, initial, onClose, onSave }: {
  title: string;
  initial?: { title: string; icon: string };
  onClose: () => void;
  onSave: (title: string, icon: string) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.title ?? '');
  const [icon, setIcon] = useState(initial?.icon || ICONS[0]);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    try {
      await onSave(name, icon);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Sheet title={title} onClose={onClose} footer={<Button variant="primary" block onClick={save}>儲存</Button>}>
      <Field label="清單名稱" error={error}>
        <input className="input" value={name} autoFocus placeholder="例如：想買的藥妝" onChange={(e) => { setName(e.target.value); setError(null); }} />
      </Field>
      <div className="field">
        <span className="field-label">圖示</span>
        <div className="emoji-grid" role="radiogroup" aria-label="圖示">
          {ICONS.map((x) => (
            <button key={x} type="button" role="radio" aria-checked={icon === x} className={`emoji-btn${icon === x ? ' is-on' : ''}`} onClick={() => setIcon(x)}>{x}</button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

export function ListPage({ tripId, listId }: { tripId: string; listId: string }) {
  useData();
  const { user } = useSession();
  const trip = store.get('trips', tripId);
  const list = store.get('lists', listId);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const close = () => goBack(`/t/${tripId}/lists`);

  if (!trip || !list || list.deleted_at) {
    return <Screen header={<TopBar title="清單" left={<BackButton onClick={close} />} />}><Empty title="找不到這個清單">可能已被刪除或取消分享。</Empty></Screen>;
  }
  const mine = list.owner_id === user?.id;
  const done = checkedItems(store, list.id, user?.id);
  const owner = ownerOf(tripId, list.owner_id);

  async function toggle(item: ListItem) {
    if (!user) return;
    await toggleListCheck(store, tripId, list!.id, user.id, item.id);
  }

  async function removeList() {
    const ok = await confirmDialog({ title: `刪除「${list!.title}」？`, message: '清單裡的項目會一起刪除。', confirmText: '刪除', danger: true });
    if (!ok) return;
    await store.softDelete('lists', list!.id);
    toast('已刪除', 'ok', { label: '復原', run: () => { void store.restore('lists', list!.id); } });
    close();
  }

  const n = list.items.filter((i) => done.has(i.id)).length;
  return (
    <Screen header={<TopBar title="" left={<BackButton onClick={close} />}
      right={mine ? <Button variant="ghost" onClick={() => setMenu(true)}><Icon.edit /> 編輯</Button> : null} />}>
      <div className="pad stack-sm">
        <div className="row-wrap" style={{ gap: 12, marginBottom: 6, flexWrap: 'nowrap' }}>
          <span className="list-ic lg" style={{ background: iconBg(list) }} aria-hidden="true">{list.icon || '📝'}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <h1 className="detail-title" style={{ fontSize: 24, textAlign: 'left' }}>{list.title}</h1>
            {mine ? (
              <span className="muted tiny">{list.items.length} 項{n ? `・買到 ${n} 項` : ''}・{list.shared ? '已分享給大家' : '只有我看得到'}</span>
            ) : (
              <span className="who" style={{ alignSelf: 'flex-start' }}><Dot color={owner.color} />{owner.name}分享・只能看</span>
            )}
          </div>
        </div>

        {list.items.length ? list.items.map((item) => {
          const on = done.has(item.id);
          const url = item.kind === 'link' ? safeUrl(item.url ?? '') : null;
          return (
            <div key={item.id} className={`li${on ? ' done' : ''}`}>
              {url ? (
                <a className="li-main" href={url} target="_blank" rel="noopener noreferrer"><Icon.link /><span>{item.text}</span><span className="li-ext" aria-hidden="true">↗</span></a>
              ) : (
                <span className="li-main">{item.text}</span>
              )}
              <button type="button" className={`cb${on ? ' on' : ''}`} role="checkbox" aria-checked={on} aria-label={`${item.text} 買到了`} onClick={() => toggle(item)}>
                {on ? <Icon.check /> : null}
              </button>
            </div>
          );
        }) : (
          <Empty title="這個清單還沒有項目">{mine ? '按右上角「編輯」→「新增一項」。' : null}</Empty>
        )}

        {list.items.length ? (
          <p className="muted tiny center" style={{ marginTop: 4 }}>
            {mine ? '有 🔗 的是連結，點一下打開；右邊的框框打勾＝買到了' : `在這裡打勾只有你自己看得到，不會改到${owner.name}的清單`}
          </p>
        ) : null}
      </div>

      {menu ? (
        <Sheet title="要編輯哪一項？" onClose={() => setMenu(false)}
          footer={<Button variant="primary" block onClick={() => { setMenu(false); navigate(`/t/${tripId}/l/${list.id}/i/new`); }}><Icon.plus /> 新增一項</Button>}>
          <button type="button" className="row-btn li" style={{ background: '#fff3dc' }} onClick={() => { setMenu(false); setRenaming(true); }}>
            <span className="li-main">清單名稱和圖示：{list.icon} {list.title}</span><Icon.edit />
          </button>
          {list.items.map((item, i) => (
            <div key={item.id} className="li">
              <button type="button" className="li-main" onClick={() => { setMenu(false); navigate(`/t/${tripId}/l/${list.id}/i/${item.id}`); }}>
                {item.kind === 'link' ? <Icon.link /> : null}<span>{item.text}</span>
              </button>
              <button type="button" className="icon-btn plain" aria-label="往上移" disabled={i === 0} onClick={() => moveListItem(store, list.id, item.id, -1)}><Icon.up /></button>
              <button type="button" className="icon-btn plain" aria-label="編輯" onClick={() => { setMenu(false); navigate(`/t/${tripId}/l/${list.id}/i/${item.id}`); }}><Icon.edit /></button>
            </div>
          ))}
          <div className="li" style={{ justifyContent: 'space-between' }}>
            <span className="li-main">分享給大家</span>
            <button type="button" className={`switch${list.shared ? ' on' : ''}`} role="switch" aria-checked={list.shared} aria-label="分享給大家"
              onClick={() => updateList(store, list.id, { shared: !list.shared }).then(() => toast(list.shared ? '已取消分享' : '已分享給大家'))} />
          </div>
          <p className="muted tiny">開啟後，所有旅伴都能在「看看別人分享的清單」看到，會標示是你分享的。別人只能看、不能改。</p>
          <Button variant="text" className="danger" onClick={() => { setMenu(false); void removeList(); }}>刪除這個清單</Button>
        </Sheet>
      ) : null}

      {renaming ? (
        <ListNameSheet title="清單名稱和圖示" initial={{ title: list.title, icon: list.icon }} onClose={() => setRenaming(false)}
          onSave={async (title, icon) => { await updateList(store, list.id, { title, icon }); setRenaming(false); toast('已儲存'); }} />
      ) : null}
    </Screen>
  );
}

export function ListItemForm({ tripId, listId, itemId }: { tripId: string; listId: string; itemId?: string }) {
  useData();
  const { user } = useSession();
  const list = store.get('lists', listId);
  const existing = itemId ? list?.items.find((x) => x.id === itemId) : undefined;
  const [kind, setKind] = useState<ListItem['kind']>(existing?.kind ?? 'text');
  const [text, setText] = useState(existing?.text ?? '');
  const [url, setUrl] = useState(existing?.url ?? '');
  const [error, setError] = useState<string | null>(null);
  const close = () => goBack(`/t/${tripId}/l/${listId}`);

  if (!list || list.owner_id !== user?.id || (itemId && !existing)) {
    return <Screen header={<TopBar title="編輯一項" left={<BackButton onClick={close} />} />}><Empty title="只能編輯自己的清單" /></Screen>;
  }

  async function save() {
    const err = validateListItem({ kind, text, url });
    if (err) return setError(err);
    await saveListItem(store, listId, existing?.id ?? null, { kind, text, url });
    toast('已儲存');
    close();
  }

  async function remove() {
    if (!existing) return;
    await deleteListItem(store, listId, existing.id);
    toast('已刪除');
    close();
  }

  return (
    <Screen header={<TopBar title={existing ? '編輯一項' : '新增一項'} left={<Button variant="text" onClick={close}>取消</Button>}
      right={<Button variant="primary" onClick={save} style={{ minHeight: 44 }}>儲存</Button>} />}>
      <div className="pad stack">
        <Segmented label="這一項是" value={kind} onChange={(v) => { setKind(v); setError(null); }}
          options={[{ value: 'text', label: '文字' }, { value: 'link', label: '🔗 連結' }]} />
        {kind === 'text' ? (
          <Field label="文字" error={error}>
            <input className="input" value={text} autoFocus placeholder="例如：面膜 2 盒" onChange={(e) => { setText(e.target.value); setError(null); }} />
          </Field>
        ) : (
          <>
            <Field label="顯示的名字" error={error && !text.trim() ? error : null}>
              <input className="input" value={text} placeholder="例如：藥妝店優惠券" onChange={(e) => { setText(e.target.value); setError(null); }} />
            </Field>
            <Field label="網址" error={error && text.trim() ? error : null}>
              <input className="input" inputMode="url" value={url} placeholder="貼上網址 https://…" onChange={(e) => { setUrl(e.target.value); setError(null); }} />
            </Field>
            <div className="stack-sm">
              <span className="field-label">清單裡會長這樣：</span>
              <div className="li"><span className="li-main"><Icon.link /><span>{text.trim() || '連結名稱'}</span><span className="li-ext">↗</span></span><span className="cb" aria-hidden="true" /></div>
            </div>
          </>
        )}
        {existing ? <Button variant="text" className="danger" onClick={remove}>刪除這一項</Button> : null}
      </div>
    </Screen>
  );
}
