// 共用畫面元件
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon } from './icons.tsx';

/**
 * 每個畫面的固定結構：上方標題列固定不動、中間內容可捲動、下方（可選）固定。
 * 整個網頁本身不捲動，所以 iPhone 滑到底也不會把關閉鍵擠走。
 */
export function Screen({ header, footer, children, className = '' }: {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`screen ${className}`}>
      {header}
      <main className="screen-body">{children}</main>
      {footer}
    </div>
  );
}

export function TopBar({ title, subtitle, left, right, onTitleClick }: {
  title: ReactNode;
  subtitle?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  onTitleClick?: () => void;
}) {
  const inner = (
    <>
      <span className="topbar-title">{title}</span>
      {subtitle ? <span className="topbar-sub">{subtitle}</span> : null}
    </>
  );
  return (
    <header className="topbar">
      <div className="topbar-side">{left}</div>
      {onTitleClick ? (
        <button type="button" className="topbar-center topbar-center-btn" onClick={onTitleClick}>{inner}</button>
      ) : (
        <div className="topbar-center">{inner}</div>
      )}
      <div className="topbar-side topbar-right">{right}</div>
    </header>
  );
}

export function BackButton({ onClick, label = '返回' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="icon-btn" onClick={onClick} aria-label={label}>
      <Icon.back />
    </button>
  );
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="icon-btn" onClick={onClick} aria-label="關閉">
      <Icon.close />
    </button>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'text';
  block?: boolean;
  busy?: boolean;
};

export function Button({ variant = 'secondary', block, busy, className = '', children, disabled, ...rest }: BtnProps) {
  return (
    <button type="button" {...rest} disabled={disabled || busy}
      className={`btn btn-${variant}${block ? ' btn-block' : ''}${busy ? ' is-busy' : ''} ${className}`}>
      {busy ? <span className="spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className={`field${error ? ' has-error' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

/** 多行文字：隨內容自動長高 */
export function TextArea({ value, onChange, placeholder, minRows = 3 }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minRows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea ref={ref} className="input" rows={minRows} value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)} />
  );
}

export function Section({ title, action, children }: { title?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      {title || action ? (
        <div className="section-head">
          {title ? <h2 className="section-title">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function List({ children }: { children: ReactNode }) {
  return <div className="list">{children}</div>;
}

export function Row({ title, detail, leading, trailing, onClick, danger }: {
  title: ReactNode;
  detail?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
}) {
  const content = (
    <>
      {leading ? <span className="row-lead">{leading}</span> : null}
      <span className="row-main">
        <span className={`row-title${danger ? ' danger' : ''}`}>{title}</span>
        {detail ? <span className="row-detail">{detail}</span> : null}
      </span>
      {trailing !== undefined ? <span className="row-trail">{trailing}</span> : onClick ? <span className="row-trail muted"><Icon.chevron /></span> : null}
    </>
  );
  return onClick ? (
    <button type="button" className="row row-btn" onClick={onClick}>{content}</button>
  ) : (
    <div className="row">{content}</div>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon ? <div className="empty-icon">{icon}</div> : null}
      <p className="empty-title">{title}</p>
      {children ? <div className="empty-text">{children}</div> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value}
          className={o.value === value ? 'is-on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Dot({ color }: { color: string }) {
  return <span className="dot" style={{ background: color || 'var(--muted)' }} />;
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'warn' | 'danger' | 'ok' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' | 'danger' }) {
  return <div className={`notice notice-${tone}`}>{children}</div>;
}

/** 頁面載入時把焦點放到標題（讀屏軟體友善） */
export function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return ref;
}
