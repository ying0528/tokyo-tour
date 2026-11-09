// 從下方滑出的面板（新增路線、沿途路線圖、清單編輯…）
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { Icon } from './icons.tsx';

export function Sheet({ title, subtitle, onClose, children, tall, footer, action }: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** 幾乎滿版（例如路線圖） */
  tall?: boolean;
  footer?: ReactNode;
  /** 標題右邊的主要按鈕（例如「儲存」），鍵盤打開時也按得到 */
  action?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // 放在最外層（不放在可以捲動的內容裡）：iPhone 上才不會被底部分頁列蓋住
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div ref={ref} tabIndex={-1} className={`sheet${tall ? ' tall' : ''}`} role="dialog" aria-modal="true" aria-label={title}
        onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div className="sheet-titles">
            <h2 className="sheet-title">{title}</h2>
            {subtitle ? <span className="sheet-sub">{subtitle}</span> : null}
          </div>
          <div className="row-wrap" style={{ flexWrap: 'nowrap' }}>
            {action}
            <button type="button" className="icon-btn" aria-label="關閉" onClick={onClose}><Icon.close /></button>
          </div>
        </div>
        <div className="sheet-body">{children}</div>
        {footer ? <div className="sheet-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
