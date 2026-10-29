// 顯示多行文字，網址自動變成可點的連結（新視窗開啟）
import { splitLinks } from '../lib/links.ts';

export function RichText({ text, className = '' }: { text: string; className?: string }) {
  if (!text) return null;
  return (
    <p className={`rich-text ${className}`}>
      {splitLinks(text).map((p, i) =>
        p.type === 'link' ? (
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer">{p.text}</a>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </p>
  );
}
