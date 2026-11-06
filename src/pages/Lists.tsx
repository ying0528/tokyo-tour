// 清單：每個人自己的清單（想買的、想吃的…），可以分享給大家看；打勾只有自己看得到
import { useState } from 'react';
import { store, useData, useSession } from '../app/services.ts';
import { goBack, navigate } from '../app/router.ts';
import type { TripCtx } from '../app/tripContext.ts';
import {
  checkedItems, createList, deleteListItem, isPinned, listsOf, moveListItem, saveListItem, toggleListCheck, togglePin, updateList, validateListItem,
} from '../data/actions.ts';
import type { ListItem, TripList } from '../data/types.ts';
import { safeUrl } from '../lib/links.ts';
import { prepareUpload } from '../lib/image.ts';
import { useFileUrl } from '../ui/useFile.ts';
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
  const { mine, shared: sharedAll } = listsOf(store, ctx.trip.id, user?.id);
  // 釘選的排最上面
  const shared = [...sharedAll.filter((l) => isPinned(store, l.id, user?.id)), ...sharedAll.filter((l) => !isPinned(store, l.id, user?.id))];
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
        const pinned = isPinned(store, l.id, user?.id);
        return (
          <div key={l.id} className="list-card other">
            <button type="button" className="list-card-open" onClick={() => open(l)}>
              <span className="list-ic" style={{ background: iconBg(l) }} aria-hidden="true">{l.icon || '📝'}</span>
              <span className="list-card-main">
                <span className="list-card-title">{l.title}</span>
                <span className="list-card-sub">{l.items.length} 項</span>
              </span>
              <span className="who"><Dot color={o.color} />{o.name}分享</span>
            </button>
            <button type="button" className={`pin-btn${pinned ? ' on' : ''}`} aria-pressed={pinned} aria-label={pinned ? `取消釘選「${l.title}」` : `釘選「${l.title}」`}
              onClick={() => { if (user) void togglePin(store, ctx.trip.id, l.id, user.id).then(() => toast(pinned ? '已取消釘選' : '已釘選，會排在最上面')); }}>
              <Icon.pin on={pinned} />
            </button>
          </div>
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
    <Sheet title={title} onClose={onClose}
      action={<Button variant="primary" onClick={save} style={{ minHeight: 44, padding: '0 16px' }}>儲存</Button>}>
      <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <Field label="清單名稱" error={error}>
          <input className="input" value={name} enterKeyHint="done" placeholder="例如：想買的藥妝" onChange={(e) => { setName(e.target.value); setError(null); }} />
        </Field>
      </form>
      <div className="field">
        <span className="field-label">圖示</span>
        <div className="emoji-grid" role="radiogroup" aria-label="圖示">
          {ICONS.map((x) => (
            <button key={x} type="button" role="radio" aria-checked={icon === x} className={`emoji-btn${icon === x ? ' is-on' : ''}`} onClick={() => setIcon(x)}>{x}</button>
          ))}
        </div>
      </div>
      <Button variant="primary" block onClick={save}>儲存</Button>
    </Sheet>
  );
}

/** 清單裡的小圖 */
function Thumb({ path, alt }: { path?: string; alt: string }) {
  const f = useFileUrl(path);
  const [tall, setTall] = useState(false);
  return f.url ? <img className={`li-thumb${tall ? ' tall' : ''}`} src={f.url} alt={alt}
    onLoad={(e) => { const im = e.currentTarget; setTall(im.naturalHeight > im.naturalWidth * 1.1); }} /> : <span className="li-thumb empty" aria-hidden="true">{f.state === 'loading' ? '…' : '🖼'}</span>;
}

export function ListImagePage({ tripId, listId, itemId }: { tripId: string; listId: string; itemId: string }) {
  useData();
  const item = store.get('lists', listId)?.items.find((x) => x.id === itemId);
  const f = useFileUrl(item?.path);
  const [zoom, setZoom] = useState(false);
  const close = () => goBack(`/t/${tripId}/l/${listId}`);
  return (
    <Screen header={<TopBar title={item?.text || '圖片'} left={<BackButton onClick={close} />} />}>
      {f.url ? (
        <div className={`ticket-view${zoom ? ' zoom' : ''}`} style={{ overflow: 'auto', height: '100%' }}>
          <button type="button" onClick={() => setZoom(!zoom)} aria-label={zoom ? '縮小' : '放大'}
            style={{ border: 0, padding: 0, background: 'none', cursor: zoom ? 'zoom-out' : 'zoom-in', display: 'block', width: zoom ? 'auto' : '100%' }}>
            <img src={f.url} alt={item?.text || '清單圖片'} />
          </button>
        </div>
      ) : <Empty title={!item ? '找不到這張圖片' : f.state === 'offline' ? '沒有網路，這張圖還沒下載到手機' : f.state === 'loading' ? '載入中…' : '圖片還在上傳中或找不到'} />}
    </Screen>
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
            <h1 className="detail-title" style={{ fontSize: 26, textAlign: 'left' }}>{list.title}</h1>
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
            <div key={item.id} className={`li${on ? ' done' : ''}${item.kind === 'image' ? ' image' : ''}`}>
              {url ? (
                <a className="li-main" href={url} target="_blank" rel="noopener noreferrer"><Icon.link /><span>{item.text}</span><span className="li-ext" aria-hidden="true">↗</span></a>
              ) : item.kind === 'image' ? (
                <button type="button" className="li-main" onClick={() => navigate(`/t/${tripId}/l/${list.id}/img/${item.id}`)}>
                  <Thumb path={item.path} alt={item.text || '圖片'} />{item.text ? <span>{item.text}</span> : <span className="muted">圖片</span>}
                </button>
              ) : (
                <span className="li-main">{item.text}</span>
              )}
              <button type="button" className={`cb${on ? ' on' : ''}`} role="checkbox" aria-checked={on} aria-label={`${item.text || '圖片'} 買到了`} onClick={() => toggle(item)}>
                {on ? <Icon.check /> : null}
              </button>
            </div>
          );
        }) : (
          <Empty title="這個清單還沒有項目">{mine ? '按右上角「編輯」→「新增一項」。' : null}</Empty>
        )}

        {list.items.length ? (
          <p className="muted tiny center" style={{ marginTop: 4 }}>
            {mine ? '有 🔗 的是連結、有小圖的點一下看大圖；右邊的框框打勾＝買到了' : `在這裡打勾只有你自己看得到，不會改到${owner.name}的清單`}
          </p>
        ) : null}
      </div>

      {menu ? (
        <Sheet title="要編輯哪一項？" onClose={() => setMenu(false)}
          action={<Button variant="primary" onClick={() => { setMenu(false); navigate(`/t/${tripId}/l/${list.id}/i/new`); }} style={{ minHeight: 44, padding: '0 14px' }}><Icon.plus /> 新增一項</Button>}>
          <button type="button" className="row-btn li" style={{ background: '#fff3dc' }} onClick={() => { setMenu(false); setRenaming(true); }}>
            <span className="li-main">清單名稱和圖示：{list.icon} {list.title}</span><Icon.edit />
          </button>
          {list.items.map((item, i) => (
            <div key={item.id} className="li">
              <button type="button" className="li-main" onClick={() => { setMenu(false); navigate(`/t/${tripId}/l/${list.id}/i/${item.id}`); }}>
                {item.kind === 'link' ? <Icon.link /> : item.kind === 'image' ? <Icon.camera /> : null}<span>{item.text || '圖片'}</span>
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
  const [file, setFile] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = useFileUrl(kind === 'image' && !file ? existing?.path : null);
  const close = () => goBack(`/t/${tripId}/l/${listId}`);

  if (!list || list.owner_id !== user?.id || (itemId && !existing)) {
    return <Screen header={<TopBar title="編輯一項" left={<BackButton onClick={close} />} />}><Empty title="只能編輯自己的清單" /></Screen>;
  }

  async function pick(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith('image/')) return setError('請選擇圖片');
    setProcessing(true);
    try {
      const blob = await prepareUpload(f);
      if (blob.size > 10 * 1024 * 1024) return setError('圖片太大，壓縮後仍超過 10 MB');
      setFile(blob);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(blob));
      setError(null);
    } finally {
      setProcessing(false);
    }
  }

  async function save() {
    let path = kind === 'image' ? existing?.path : undefined;
    if (kind === 'image' && file) path = `${tripId}/list-${listId.slice(0, 8)}-${Date.now().toString(36)}.${file.type === 'image/png' ? 'png' : 'jpg'}`;
    const err = validateListItem({ kind, text, url, path });
    if (err) return setError(err);
    setBusy(true);
    try {
      if (kind === 'image' && file && path) await store.saveFile(path, file, true);
      await saveListItem(store, listId, existing?.id ?? null, { kind, text, url, path });
      toast(kind === 'image' && file && !navigator.onLine ? '已存在手機，連上網路後自動上傳' : '已儲存');
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;
    await deleteListItem(store, listId, existing.id);
    toast('已刪除');
    close();
  }

  const img = preview ?? current.url;
  return (
    <Screen header={<TopBar title={existing ? '編輯一項' : '新增一項'} left={<Button variant="text" onClick={close}>取消</Button>}
      right={<Button variant="primary" busy={busy} onClick={save} style={{ minHeight: 44 }}>儲存</Button>} />}>
      <form className="pad stack" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <Segmented label="這一項是" value={kind} onChange={(v) => { setKind(v); setError(null); }}
          options={[{ value: 'text', label: '文字' }, { value: 'link', label: '🔗 連結' }, { value: 'image', label: '🖼 圖片' }]} />
        {kind === 'text' ? (
          <Field label="文字" error={error}>
            <input className="input" value={text} enterKeyHint="done" placeholder="例如：面膜 2 盒" onChange={(e) => { setText(e.target.value); setError(null); }} />
          </Field>
        ) : kind === 'link' ? (
          <>
            <Field label="顯示的名字" error={error && !text.trim() ? error : null}>
              <input className="input" value={text} placeholder="例如：藥妝店優惠券" onChange={(e) => { setText(e.target.value); setError(null); }} />
            </Field>
            <Field label="網址" error={error && text.trim() ? error : null}>
              <input className="input" inputMode="url" value={url} enterKeyHint="done" placeholder="貼上網址 https://…" onChange={(e) => { setUrl(e.target.value); setError(null); }} />
            </Field>
            <div className="stack-sm">
              <span className="field-label">清單裡會長這樣：</span>
              <div className="li"><span className="li-main"><Icon.link /><span>{text.trim() || '連結名稱'}</span><span className="li-ext">↗</span></span><span className="cb" aria-hidden="true" /></div>
            </div>
          </>
        ) : (
          <>
            <div className="card stack-sm center" style={{ background: '#fff8df' }}>
              {img ? <img src={img} alt="圖片預覽" style={{ maxHeight: 260, maxWidth: '100%', objectFit: 'contain', borderRadius: 12, border: '2px solid var(--ink)', alignSelf: 'center' }} />
                : <span className="muted small">還沒有圖片</span>}
              <label className="btn btn-ghost" style={{ alignSelf: 'center', position: 'relative' }}>
                {processing ? <span className="spinner" aria-hidden="true" /> : <Icon.camera />}
                {img ? '換一張' : '拍照或選擇圖片'}
                <input type="file" accept="image/*" aria-label="選擇圖片" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }}
                  style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />
              </label>
              <span className="tiny muted">例如商品照片、包裝的樣子。照片會自動縮小。</span>
              {error ? <span className="field-error">{error}</span> : null}
            </div>
            <Field label="說明（可不填）">
              <input className="input" value={text} enterKeyHint="done" placeholder="例如：藍色包裝那款" onChange={(e) => setText(e.target.value)} />
            </Field>
          </>
        )}
        <Button variant="primary" block busy={busy} onClick={save}>儲存</Button>
        {existing ? <Button variant="text" className="danger" onClick={remove}>刪除這一項</Button> : null}
      </form>
    </Screen>
  );
}
