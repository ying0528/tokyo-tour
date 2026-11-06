// 線條圖示（不依賴外部字型或圖庫）
import type { ReactNode } from 'react';

function Svg({ children, size = 22 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export const Icon = {
  plan: () => <Svg><rect x="3.5" y="4.5" width="17" height="16" rx="3" /><path d="M3.5 9.5h17M8 3v3M16 3v3M7.5 13.5h4M7.5 17h7" /></Svg>,
  place: () => <Svg><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21Z" /><circle cx="12" cy="10" r="2.4" /></Svg>,
  ticket: () => <Svg><path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4Z" /><path d="M14 6.5v11" strokeDasharray="1.6 2.2" /></Svg>,
  settings: () => <Svg><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></Svg>,
  plus: () => <Svg><path d="M12 5v14M5 12h14" /></Svg>,
  back: () => <Svg><path d="M15 5l-7 7 7 7" /></Svg>,
  close: () => <Svg><path d="M6 6l12 12M18 6L6 18" /></Svg>,
  chevron: () => <Svg size={18}><path d="M9 6l6 6-6 6" /></Svg>,
  down: () => <Svg size={18}><path d="M6 9l6 6 6-6" /></Svg>,
  check: () => <Svg><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>,
  share: () => <Svg><path d="M12 15V3.5M7.5 8 12 3.5 16.5 8" /><path d="M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12" /></Svg>,
  copy: () => <Svg><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" /></Svg>,
  trash: () => <Svg><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4.5h6V7" /></Svg>,
  user: () => <Svg><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></Svg>,
  users: () => <Svg><circle cx="9" cy="8.5" r="3.2" /><path d="M3 19.5a6 6 0 0 1 12 0M16 5.5a3 3 0 0 1 0 6M18 19.5a6 6 0 0 0-2.5-4.9" /></Svg>,
  cloud: () => <Svg size={16}><path d="M7 18.5h10.5a4 4 0 0 0 .4-8 6 6 0 0 0-11.6 1.5A3.3 3.3 0 0 0 7 18.5Z" /></Svg>,
  refresh: () => <Svg><path d="M20 11a8 8 0 0 0-14.7-4.3L4 8.5M4 4v4.5h4.5M4 13a8 8 0 0 0 14.7 4.3l1.3-1.8M20 20v-4.5h-4.5" /></Svg>,
  archive: () => <Svg><rect x="3.5" y="4" width="17" height="4.5" rx="1" /><path d="M5 8.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5M10 12.5h4" /></Svg>,
  link: () => <Svg><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" /></Svg>,
  logout: () => <Svg><path d="M14 4.5h4A1.5 1.5 0 0 1 19.5 6v12a1.5 1.5 0 0 1-1.5 1.5h-4M10 16l-4-4 4-4M6 12h10" /></Svg>,
  swap: () => <Svg size={18}><path d="M7 4 4 7l3 3M4 7h12M17 14l3 3-3 3M20 17H8" /></Svg>,
  camera: () => <Svg><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></Svg>,
  clock: () => <Svg><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>,
  note: () => <Svg><path d="M5 4h11l3 3v13H5z" /><path d="M8 10h8M8 14h6" /></Svg>,
  edit: () => <Svg><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M14 6l4 4" /></Svg>,
  up: () => <Svg size={18}><path d="M6 15l6-6 6 6" /></Svg>,
  train: () => <Svg><rect x="5" y="3" width="14" height="14" rx="4" /><path d="M5 11h14M8.5 21 10 17M15.5 21 14 17" /></Svg>,
  bus: () => <Svg><rect x="4" y="4" width="16" height="13" rx="3" /><path d="M4 11h16M7 20v-3M17 20v-3" /></Svg>,
  walk: () => <Svg><circle cx="13" cy="4" r="2" /><path d="M10 21l2-6 3 3v3M9 12l2-4 3 1 2 3M11 8l-2 5" /></Svg>,
  car: () => <Svg><path d="M4 16v-4l2-5h12l2 5v4z" /><circle cx="8" cy="16" r="2" /><circle cx="16" cy="16" r="2" /></Svg>,
  people: () => <Svg><circle cx="9" cy="9" r="3" /><path d="M3 19a6 6 0 0 1 12 0M16 7a3 3 0 0 1 0 6M18 19a6 6 0 0 0-2-4.5" /></Svg>,
  search: () => <Svg size={20}><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></Svg>,
  download: () => <Svg size={16}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></Svg>,
  money: () => <Svg><circle cx="12" cy="12" r="9" /><path d="M9 9l3 4 3-4M12 13v5M9 14h6" /></Svg>,
  home: () => <Svg><path d="M4 11l8-7 8 7v9H4z" /><path d="M10 20v-6h4v6" /></Svg>,
  pin: ({ on }: { on?: boolean }) => (
    <svg width={22} height={22} viewBox="0 0 24 24" fill={on ? '#e0303a' : 'none'} stroke={on ? '#8e1a20' : 'currentColor'} strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M9 3h6l-1 6 3 3H7l3-3-1-6Z" /><path d="M12 12v9" fill="none" />
    </svg>
  ),
  sparkle: () => <Svg size={40}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /></Svg>,
};
