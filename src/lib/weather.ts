// 天氣：用 Open-Meteo（免費、不用金鑰）抓每天最低／最高溫、天氣狀況、降雨機率
// 地點：從當天（這組）的行程名稱或地圖連結判斷；判斷不出來就用旅行的目的地，預設東京

export interface Spot { key: string; name: string; lat: number; lon: number }
export interface DayWeather { min: number; max: number; code: number; pop: number | null }
export interface Forecast { at: number; days: Record<string, DayWeather> }

/** 常去的地方（關鍵字 → 座標） */
export const SPOTS: (Spot & { words: string[] })[] = [
  { key: 'kawaguchiko', name: '河口湖', lat: 35.50, lon: 138.76, words: ['河口湖', '富士山', '富士急', '忍野', '大石公園', '新倉山', '山中湖'] },
  { key: 'maihama', name: '舞濱', lat: 35.63, lon: 139.88, words: ['迪士尼', '迪士尼', 'ディズニー', 'disney', '舞濱', '舞浜'] },
  { key: 'yokosuka', name: '橫須賀', lat: 35.28, lon: 139.67, words: ['橫須賀', '横須賀', '猿島', '觀音崎', '観音崎'] },
  { key: 'yokohama', name: '橫濱', lat: 35.45, lon: 139.63, words: ['橫濱', '横濱', '橫浜', '横浜', 'yokohama', '港未來', '港未来', 'みなとみらい', '紅磚倉庫', '中華街', '山下公園'] },
  { key: 'kamakura', name: '鎌倉', lat: 35.32, lon: 139.55, words: ['鎌倉', '江之島', '江ノ島', '江の島'] },
  { key: 'hakone', name: '箱根', lat: 35.23, lon: 139.11, words: ['箱根'] },
  { key: 'nikko', name: '日光', lat: 36.75, lon: 139.60, words: ['日光'] },
  { key: 'karuizawa', name: '輕井澤', lat: 36.35, lon: 138.60, words: ['輕井澤', '軽井沢'] },
  { key: 'narita', name: '成田', lat: 35.78, lon: 140.32, words: ['成田'] },
  { key: 'osaka', name: '大阪', lat: 34.69, lon: 135.50, words: ['大阪', '難波', '梅田', '心齋橋', '心斎橋', '環球影城'] },
  { key: 'kyoto', name: '京都', lat: 35.01, lon: 135.77, words: ['京都', '嵐山', '清水寺', '伏見稻荷', '伏見稲荷', '祇園'] },
  { key: 'nara', name: '奈良', lat: 34.68, lon: 135.83, words: ['奈良'] },
  { key: 'sapporo', name: '札幌', lat: 43.06, lon: 141.35, words: ['札幌'] },
  { key: 'fukuoka', name: '福岡', lat: 33.59, lon: 130.40, words: ['福岡', '博多', '天神'] },
  { key: 'okinawa', name: '沖繩', lat: 26.21, lon: 127.68, words: ['沖繩', '沖縄', '那霸', '那覇'] },
  { key: 'tokyo', name: '東京', lat: 35.68, lon: 139.76, words: ['東京', '新宿', '澀谷', '渋谷', '銀座', '上野', '淺草', '浅草', '六本木', '羽田', '品川', '池袋', '台場', '秋葉原', '原宿', '表參道', '表参道'] },
];

const TOKYO = SPOTS.find((s) => s.key === 'tokyo')!;

function inJapan(lat: number, lon: number) {
  return lat > 24 && lat < 46 && lon > 122.5 && lon < 146;
}

/** 地圖連結裡的座標（Google 地圖 @lat,lng 或 q=lat,lng） */
export function coordsFromUrl(url: string | null | undefined): { lat: number; lon: number } | null {
  if (!url) return null;
  let u = url;
  try { u = decodeURIComponent(url); } catch { /* 保持原樣 */ }
  const m = /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/.exec(u) ?? /[?&](?:q|query|ll|destination|center)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/.exec(u);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  return inJapan(lat, lon) ? { lat, lon } : null;
}

function dist(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const dx = (a.lon - b.lon) * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180) * 111;
  const dy = (a.lat - b.lat) * 111;
  return Math.hypot(dx, dy);
}

/** 用關鍵字找地點 */
export function spotFromText(text: string): Spot | null {
  const t = text.toLowerCase();
  for (const s of SPOTS) if (s.words.some((w) => t.includes(w.toLowerCase()))) return s;
  return null;
}

/** 座標換成附近的常去地點；太遠的就用座標本身（取到小數一位，附近的共用同一份預報） */
function spotFromCoords(c: { lat: number; lon: number }): Spot {
  let best: Spot | null = null;
  let bestD = Infinity;
  for (const s of SPOTS) {
    const d = dist(s, c);
    if (d < bestD) { best = s; bestD = d; }
  }
  if (best && bestD < 25) return best;
  const lat = Math.round(c.lat * 10) / 10;
  const lon = Math.round(c.lon * 10) / 10;
  return { key: `${lat},${lon}`, name: '', lat, lon };
}

/** 這一天（這組）的天氣要看哪裡：行程裡出現最多次的地點；都判斷不出來就用目的地 */
export function spotForDay(activities: { title: string; map_url?: string | null }[], destination?: string | null): Spot {
  const count = new Map<string, { spot: Spot; n: number; first: number }>();
  activities.forEach((a, i) => {
    const c = coordsFromUrl(a.map_url);
    const s = c ? spotFromCoords(c) : spotFromText(a.title);
    if (!s) return;
    const e = count.get(s.key) ?? { spot: s, n: 0, first: i };
    e.n++;
    count.set(s.key, e);
  });
  const best = [...count.values()].sort((a, b) => b.n - a.n || a.first - b.first)[0];
  if (best) return best.spot;
  return (destination && spotFromText(destination)) || TOKYO;
}

/** WMO 天氣代碼 → 小圖示和說明 */
export function weatherIcon(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: '☀️', label: '晴' };
  if (code === 1) return { icon: '🌤️', label: '晴時多雲' };
  if (code === 2) return { icon: '⛅', label: '多雲' };
  if (code === 3) return { icon: '☁️', label: '陰' };
  if (code === 45 || code === 48) return { icon: '🌫️', label: '霧' };
  if (code >= 51 && code <= 57) return { icon: '🌦️', label: '毛毛雨' };
  if (code >= 61 && code <= 67) return { icon: '🌧️', label: '雨' };
  if (code >= 71 && code <= 77) return { icon: '🌨️', label: '雪' };
  if (code >= 80 && code <= 82) return { icon: '🌦️', label: '陣雨' };
  if (code === 85 || code === 86) return { icon: '🌨️', label: '陣雪' };
  if (code >= 95) return { icon: '⛈️', label: '雷雨' };
  return { icon: '🌡️', label: '' };
}

/** 抓 16 天預報 */
export async function fetchForecast(spot: Spot, timezone: string, fetcher: typeof fetch = fetch): Promise<Forecast> {
  const q = new URLSearchParams({
    latitude: String(spot.lat),
    longitude: String(spot.lon),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: timezone || 'Asia/Tokyo',
    forecast_days: '16',
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetcher(`https://api.open-meteo.com/v1/forecast?${q}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`天氣資料讀不到（${res.status}）`);
    const j = await res.json() as { daily?: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max?: (number | null)[] } };
    const d = j.daily;
    if (!d?.time) throw new Error('天氣資料格式不對');
    const days: Record<string, DayWeather> = {};
    d.time.forEach((t, i) => {
      const max = d.temperature_2m_max[i];
      const min = d.temperature_2m_min[i];
      if (max == null || min == null) return;
      days[t] = { min: Math.round(min), max: Math.round(max), code: d.weather_code[i] ?? -1, pop: d.precipitation_probability_max?.[i] ?? null };
    });
    return { at: Date.now(), days };
  } finally {
    clearTimeout(timer);
  }
}
