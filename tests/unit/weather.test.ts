import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coordsFromUrl, fetchForecast, spotForDay, weatherIcon } from '../../src/lib/weather.ts';

test('從地圖連結讀座標；台灣的座標不算（例如松山機場）', () => {
  assert.deepEqual(coordsFromUrl('https://www.google.com/maps/place/x/@35.6329,139.8804,17z'), { lat: 35.6329, lon: 139.8804 });
  assert.deepEqual(coordsFromUrl('https://www.google.com/maps/search/?api=1&query=35.5,138.76'), { lat: 35.5, lon: 138.76 });
  assert.equal(coordsFromUrl('https://www.google.com/maps/@25.0697,121.5519,15z'), null);
  assert.equal(coordsFromUrl('https://maps.app.goo.gl/abc'), null);
});

test('這天看哪裡的天氣：用行程裡最常出現的地點', () => {
  const day1 = [{ title: '華航 CI220 松山機場出發' }, { title: '抵達羽田機場' }, { title: '飯店' }, { title: '六本木 藍瓶咖啡' }];
  assert.equal(spotForDay(day1, '東京').name, '東京');
  assert.equal(spotForDay([{ title: '迪士尼海洋' }, { title: '晚餐' }], '東京').name, '舞濱');
  assert.equal(spotForDay([{ title: '新宿出發 河口湖巴士' }, { title: '河口湖 大石公園' }, { title: '富士山景觀餐廳' }], '東京').name, '河口湖');
  assert.equal(spotForDay([{ title: '午餐' }], '大阪').name, '大阪', '判斷不出來就用目的地');
  assert.equal(spotForDay([{ title: '午餐' }], '').name, '東京', '都沒有就用東京');
  assert.equal(spotForDay([{ title: '某餐廳', map_url: 'https://www.google.com/maps/@35.4437,139.6380,17z' }], '東京').name, '橫濱', '地圖座標在橫濱附近');
});

test('讀天氣預報（最低、最高溫、天氣、降雨機率）', async () => {
  let url = '';
  const fake = (async (u: string) => {
    url = u;
    return new Response(JSON.stringify({ daily: { time: ['2026-11-21', '2026-11-22'], weather_code: [1, 61], temperature_2m_max: [16.6, 14.2], temperature_2m_min: [8.4, 9.5], precipitation_probability_max: [10, 70] } }));
  }) as typeof fetch;
  const f = await fetchForecast({ key: 'tokyo', name: '東京', lat: 35.68, lon: 139.76 }, 'Asia/Tokyo', fake);
  assert.ok(url.startsWith('https://api.open-meteo.com/v1/forecast?') && url.includes('precipitation_probability_max') && url.includes('Asia%2FTokyo'));
  assert.deepEqual(f.days['2026-11-21'], { min: 8, max: 17, code: 1, pop: 10 });
  assert.deepEqual(f.days['2026-11-22'], { min: 10, max: 14, code: 61, pop: 70 });
  assert.equal(weatherIcon(61).icon, '🌧️');
});
