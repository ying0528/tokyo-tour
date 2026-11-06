// 飯糰吉祥物：happy 開心、wink 眨眼、sleepy 想睡（離線時）、wow 驚訝
export type Mood = 'happy' | 'wink' | 'sleepy' | 'wow';

export function Mascot({ size = 56, mood = 'happy', label = '飯糰吉祥物' }: { size?: number; mood?: Mood; label?: string }) {
  return (
    <svg width={size} height={size * 0.96} viewBox="0 0 58 56" role="img" aria-label={label} style={{ flex: '0 0 auto' }}>
      <path d="M29 4c5 0 8 3 11 8l13 22c4 8-1 18-11 18H16C6 52 1 42 5 34L18 12c3-5 6-8 11-8Z" fill="#ffffff" stroke="#2b2433" strokeWidth="3" />
      <rect x="17" y="36" width="24" height="16" rx="3" fill="#2b2433" />
      {mood === 'sleepy' ? (
        <>
          <path d="M19 27h6M33 27h6" stroke="#2b2433" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M44 10h5l-5 5h5" fill="none" stroke="#2b2433" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : mood === 'wink' ? (
        <>
          <circle cx="22" cy="27" r="2.6" fill="#2b2433" />
          <path d="M33.5 27c1-2 4-2 5 0" fill="none" stroke="#2b2433" strokeWidth="2.4" strokeLinecap="round" />
        </>
      ) : mood === 'wow' ? (
        <>
          <circle cx="22" cy="26" r="3" fill="#2b2433" />
          <circle cx="36" cy="26" r="3" fill="#2b2433" />
        </>
      ) : (
        <>
          <circle cx="22" cy="27" r="2.6" fill="#2b2433" />
          <circle cx="36" cy="27" r="2.6" fill="#2b2433" />
        </>
      )}
      {mood === 'wow' ? (
        <ellipse cx="29" cy="32" rx="2.4" ry="2.8" fill="#2b2433" />
      ) : (
        <path d="M26 31c1.6 1.8 4.4 1.8 6 0" fill="none" stroke="#2b2433" strokeWidth="2.2" strokeLinecap="round" />
      )}
      <circle cx="17" cy="31" r="3" fill="#ffb3c1" />
      <circle cx="41" cy="31" r="3" fill="#ffb3c1" />
    </svg>
  );
}
