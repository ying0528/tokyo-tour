// 確認視窗與短暫提示
import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

interface ConfirmReq {
  id: number;
  title: string;
  message?: ReactNode;
  confirmText: string;
  cancelText: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
  choices?: { label: string; primary?: boolean; pick: () => void }[];
}

interface State {
  confirm: ConfirmReq | null;
  toasts: { id: number; text: string; tone: 'ok' | 'error'; action?: { label: string; run: () => void } }[];
}

let state: State = { confirm: null, toasts: [] };
let nextId = 1;
const listeners = new Set<() => void>();
function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}

export function confirmDialog(opts: { title: string; message?: ReactNode; confirmText?: string; cancelText?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    state.confirm?.resolve(false);
    set({
      confirm: {
        id: nextId++, title: opts.title, message: opts.message, confirmText: opts.confirmText ?? '確定',
        cancelText: opts.cancelText ?? '取消', danger: opts.danger ?? false, resolve,
      },
    });
  });
}

export function toast(text: string, tone: 'ok' | 'error' = 'ok', action?: { label: string; run: () => void }) {
  const id = nextId++;
  set({ toasts: [...state.toasts, { id, text, tone, action }].slice(-2) });
  setTimeout(() => set({ toasts: state.toasts.filter((t) => t.id !== id) }), action ? 6000 : tone === 'error' ? 4500 : 2400);
}

/** 三個選項的詢問（例如改名：全部一起改／只改這一筆／取消） */
export function chooseDialog<T extends string>(opts: { title: string; message?: ReactNode; choices: { value: T; label: string; primary?: boolean }[] }): Promise<T | null> {
  return new Promise((resolve) => {
    state.confirm?.resolve(false);
    set({
      confirm: {
        id: nextId++, title: opts.title, message: opts.message, confirmText: '', cancelText: '取消', danger: false,
        resolve: () => resolve(null), choices: opts.choices.map((c) => ({ ...c, pick: () => { state.confirm = null; set({ confirm: null }); resolve(c.value); } })),
      },
    });
  });
}

export function DialogHost() {
  const s = useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => state);
  const okRef = useRef<HTMLButtonElement>(null);
  const c = s.confirm;

  useEffect(() => {
    if (!c) return;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [c?.id]);

  function close(ok: boolean) {
    if (!state.confirm) return;
    state.confirm.resolve(ok);
    set({ confirm: null });
  }

  return (
    <>
      {c ? (
        <div className="modal-backdrop" onClick={() => close(false)}>
          <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="dlg-title" className="modal-title">{c.title}</h2>
            {c.message ? <div className="modal-text">{c.message}</div> : null}
            {c.choices ? (
              <div className="modal-actions stacked">
                {c.choices.map((ch, i) => (
                  <button key={i} type="button" ref={i === 0 ? okRef : undefined} className={`btn ${ch.primary ? 'btn-primary' : 'btn-secondary'}`} onClick={ch.pick}>{ch.label}</button>
                ))}
                <button type="button" className="btn btn-text" onClick={() => close(false)}>{c.cancelText}</button>
              </div>
            ) : (
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => close(false)}>{c.cancelText}</button>
                <button type="button" ref={okRef} className={`btn ${c.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)}>
                  {c.confirmText}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
      <div className="toasts" aria-live="polite">
        {s.toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            <span>{t.text}</span>
            {t.action ? (
              <button type="button" onClick={() => { t.action!.run(); set({ toasts: state.toasts.filter((x) => x.id !== t.id) }); }}>{t.action.label}</button>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}
