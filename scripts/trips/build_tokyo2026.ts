// 2026 東京銀杏奢華之旅：由行前說明會 PDF 整理成行程檔（App「旅伴・設定 → 匯入行程檔」）
// 用法：node scripts/trips/build_tokyo2026.ts <圖片資料夾> <輸出檔>
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { codeAt, lineById, lineCode, ridePath } from '../../src/lib/rail.ts';
import type { RailData } from '../../src/lib/rail.ts';
import type { ImportFile } from '../../src/data/importer.ts';
import type { LegPlan, LegStep } from '../../src/data/types.ts';

const [imgDir, outFile] = process.argv.slice(2);
const R = JSON.parse(readFileSync(new URL('../../public/data/rail-tokyo.json', import.meta.url), 'utf8')) as RailData;

let n = 0;
const sid = () => `s${++n}`;
function station(lineId: string, ja: string): string {
  const l = lineById(R, lineId);
  if (!l) throw new Error(`沒有這條線 ${lineId}`);
  const id = l.stations.find((s) => R.stations[s].ja === ja) ?? l.stations.find((s) => R.stations[s].ja.startsWith(ja));
  if (!id) throw new Error(`${lineId} 沒有 ${ja}`);
  return id;
}
function ride(lineId: string, a: string, b: string, note = ''): LegStep {
  const line = lineById(R, lineId)!;
  const fa = station(lineId, a);
  const fb = station(lineId, b);
  const p = ridePath(R, line, fa, fb);
  if (!p) throw new Error(`${lineId} ${a}→${b} 算不出來`);
  return {
    id: sid(), mode: 'rail', line_id: lineId, line: line.name, color: line.color, code: lineCode(line),
    from: R.stations[fa].n, to: R.stations[fb].n, from_station: fa, to_station: fb,
    from_code: codeAt(line, fa), to_code: codeAt(line, fb), direction: p.direction, stops: p.stops, note,
  };
}
const walk = (note = '', from = '', to = ''): LegStep => ({ id: sid(), mode: 'walk', line: '', from, to, direction: '', note });
const plan = (label: string, steps: LegStep[]): LegPlan => ({ id: sid(), label, steps });
const img = (name: string) => `data:image/jpeg;base64,${readFileSync(path.join(imgDir, `${name}.jpg`)).toString('base64')}`;

const HOTEL = '飯店';
const TODAY_BUY = { kind: 'sight' as const, title: '超市、便利商店買隔天早餐', notes: '超市 21:00 關' };

const data: ImportFile = {
  format: 'family-trip-import',
  version: 1,
  id: 'tokyo-ginkgo-2026-v2',
  // 匯入過第一版的話，先把第一版的行程移到回收桶再放入新版
  replaces: JSON.parse(readFileSync(new URL('./tokyo2026-v1-signature.json', import.meta.url), 'utf8')),
  title: '2026 東京銀杏奢華之旅',
  start_date: '2026-11-21',
  end_date: '2026-11-27',
  groups: {
    '2026-11-22': { names: { A: '晚上跑步組', B: '晚上逛街組' }, members: { A: ['phil'], B: ['大酷', '阿慧', 'fisher'] } },
    '2026-11-25': { names: { A: '迪士尼組', B: '河口湖組' }, members: { A: ['大酷', 'fisher'], B: ['phil', '阿慧'] } },
    '2026-11-26': { names: { A: '迪士尼組', B: '東大橫濱組' }, members: { A: ['大酷', 'fisher'], B: ['phil', '阿慧'] } },
  },
  activities: [
    // Day 1
    { key: 'd1a', date: '2026-11-21', time: '09:00', kind: 'other', title: '華航 CI220 松山機場出發', notes: '松山 → 羽田' },
    { key: 'd1b', date: '2026-11-21', time: '12:50', kind: 'other', title: '抵達羽田機場', notes: '羽田機場第 3 航廈\n到飯店的轉乘有兩個方案（路線頁可以切換），下圖是查到的班次', images: ['d1_routes'] },
    { key: 'd1c', date: '2026-11-21', time: '15:00', kind: 'lodging', title: HOTEL,
      notes: 'JR東日本 HOTEL METS 大森\nJR 大森站中央檢票口步行 1 分鐘\n飯店樓下有 7-11（3 分鐘）、Lawson（5 分鐘）\n早餐兌換券三選一：\n・STARBUCKS（Atre 大森 5 樓）\n・Grandeal（Atre 大森 3 樓）\n・TULLY\'S COFFEE（Atre 大森 1 樓）' },
    { key: 'd1d', date: '2026-11-21', time: '16:00', kind: 'food', title: '六本木 藍瓶咖啡' },
    { key: 'd1e', date: '2026-11-21', time: null, after: 'd1d', kind: 'food', title: '六本木 烏龍麵 TsuruTonTan' },
    { key: 'd1f', date: '2026-11-21', time: '18:30', kind: 'sight', title: '六本木之丘聖誕點燈・聖誕市集',
      notes: '主要點燈街道：六本木けやき坂通\n二樓天橋有街燈拍照點\n往東京鐵塔方向可以拍到鐵塔', images: ['roppongi_map', 'roppongi_hills_map'] },
    { key: 'd1g', date: '2026-11-21', time: '21:00', kind: 'sight', title: '唐吉訶德 六本木店' },
    // Day 2
    { key: 'd2a', date: '2026-11-22', time: '08:30', kind: 'sight', title: '小網神社',
      notes: '人形町站 A2 出口\n\n洗錢（種錢）四步驟：\n1. 領取竹簍：建議在社務所開放時間（09:00～17:00）前往，竹簍多在這段時間提供。在弁財天像旁的「洗錢池」取用竹編小簍，用完請歸還原位\n2. 放入錢幣：把想洗淨的硬幣或紙鈔放進簍中，紙鈔可以折起來放\n3. 舀水淋洗：用木瓢舀水輕淋錢財，象徵去除穢氣，轉化為「種錢」\n4. 擦乾收好：用面紙把水吸乾收好，建議當錢母保存，不直接使用' },
    { key: 'd2b', date: '2026-11-22', time: '11:00', kind: 'food', title: '上野 壽喜燒或炸牛排', notes: '兩家再決定' },
    { key: 'd2c', date: '2026-11-22', time: '13:00', kind: 'sight', title: '上野東照宮' },
    { key: 'd2d', date: '2026-11-22', time: null, after: 'd2c', kind: 'sight', title: '上野動物園' },
    { key: 'd2e', date: '2026-11-22', time: '16:30', kind: 'sight', title: '東京車站 行幸通拍照' },
    { key: 'd2f', date: '2026-11-22', time: '17:00', kind: 'food', title: '利久牛舌' },
    { key: 'd2g', date: '2026-11-22', time: '19:00', kind: 'sight', title: '皇居跑步', group: 'A' },
    { key: 'd2h', date: '2026-11-22', time: '19:00', kind: 'sight', title: '東京車站一番街＋大丸百貨', group: 'B',
      notes: '東京車站一番街（開到 20:30）、大丸百貨（開到 20:00）' },
    // Day 3
    { key: 'd3a', date: '2026-11-23', time: '08:30', kind: 'sight', title: '新宿御苑', notes: '和明治神宮外苑隔一條街，但從神宮外苑去澀谷比較快' },
    { key: 'd3b', date: '2026-11-23', time: null, after: 'd3a', kind: 'sight', title: '明治神宮外苑' },
    { key: 'd3c', date: '2026-11-23', time: '11:00', kind: 'food', title: '神宮外苑或澀谷 SHAKE SHACK', notes: '11:00 開，很容易排隊' },
    { key: 'd3d', date: '2026-11-23', time: '13:00', kind: 'sight', title: '澀谷 PARCO・公園通逛街',
      notes: '逛店順序：\n1. GU\n2. montbell\n3. PARCO\n4. Onitsuka Tiger 澀谷店\n5. 無印良品\n6. DISNEY STORE', images: ['shibuya_map'] },
    { key: 'd3e', date: '2026-11-23', time: '18:00', kind: 'food', title: '一蘭拉麵 澀谷店' },
    { key: 'd3f', date: '2026-11-23', time: null, after: 'd3e', kind: 'sight', title: '澀谷站前 西武・109 逛街',
      notes: '逛店順序：\n1. HOKA\n2. 西武百貨\n3. UNIQLO\n4. 澀谷 109（扭蛋）', images: ['shibuya_map'] },
    { key: 'd3g', date: '2026-11-23', time: '22:00', kind: 'sight', title: '東口大國藥妝' },
    // Day 4
    { key: 'd4a', date: '2026-11-24', time: '08:30', kind: 'sight', title: '鶴岡八幡宮', images: ['kamakura_map'] },
    { key: 'd4b', date: '2026-11-24', time: '09:30', kind: 'sight', title: '小町通商店街' },
    { key: 'd4c', date: '2026-11-24', time: '11:30', kind: 'food', title: '鎌倉釜飯 kamakama honten' },
    { key: 'd4d', date: '2026-11-24', time: '13:00', kind: 'sight', title: '長谷寺、鎌倉大佛', notes: '從鎌倉站搭江之電到長谷站', images: ['enoden_map'] },
    { key: 'd4e', date: '2026-11-24', time: '15:00', kind: 'sight', title: '鎌倉高校前平交道夕陽、江之島星空點燈' },
    { key: 'd4f', date: '2026-11-24', time: null, after: 'd4e', kind: 'food', title: 'atre 大森 吃牛舌或燒肉吃到飽',
      notes: '一館 5F 仙台牛たん 青葉（仙台牛舌燒肉）\n二館 4F 焼肉きんぐ（燒肉、啤酒喝到飽）\n一館 3F 麥當勞\n\natre 大森營業 10:00–21:00，一館 B1 有超市\n購物：一館 2F UNIQLO、星巴克、3coins、ABC-MART；4F 無印良品；二館 1F 藥妝店', images: ['atre_floor'] },
    { key: 'd4g', date: '2026-11-24', time: null, after: 'd4f', kind: 'sight', title: 'UNIQLO、超市、便利商店買隔天早餐', notes: '超市 21:00 關' },
    // Day 5
    { key: 'd5a', date: '2026-11-25', time: '08:30', kind: 'sight', title: '迪士尼海洋', group: 'A' },
    { key: 'd5b', date: '2026-11-25', time: '08:30', kind: 'sight', title: '河口湖一日遊', group: 'B' },
    { key: 'd5c', date: '2026-11-25', time: null, ...TODAY_BUY },
    // Day 6
    { key: 'd6a', date: '2026-11-26', time: '08:30', kind: 'sight', title: '迪士尼陸地', group: 'A' },
    { key: 'd6b', date: '2026-11-26', time: '09:30', kind: 'sight', title: '東京大學', group: 'B' },
    { key: 'd6c', date: '2026-11-26', time: '13:00', kind: 'sight', title: '橫濱', group: 'B' },
    { key: 'd6d', date: '2026-11-26', time: null, ...TODAY_BUY },
    // Day 7
    { key: 'd7a', date: '2026-11-27', time: '09:30', kind: 'sight', title: '到羽田機場', notes: '羽田機場第 3 航廈', images: ['d7_routes'] },
    { key: 'd7b', date: '2026-11-27', time: null, after: 'd7a', kind: 'sight', title: '退稅' },
    { key: 'd7c', date: '2026-11-27', time: '11:30', kind: 'food', title: '機場內吃午餐、逛免稅店' },
    { key: 'd7d', date: '2026-11-27', time: '14:15', kind: 'other', title: '華航 CI221 羽田 → 松山',
      notes: '羽田機場第 3 航廈出發，17:15 抵達松山機場第 1 航廈\n經濟艙，飛行約 4 小時，託運 2 件／人', images: ['flight_ci221'] },
  ],
  legs: [
    { date: '2026-11-21', from: 'd1b', to: 'd1c', plans: [
      plan('京急到品川', [ride('Keikyu.AirportShinagawa', '羽田空港第3ターミナル', '品川', '坐往品川的電車，中間不用下車'), ride('JR-East.KeihinTohokuNegishi', '品川', '大森'), walk('中央檢票口出站，步行 1 分鐘')]),
      plan('單軌到濱松町', [ride('TokyoMonorail.HanedaAirport', '羽田空港第3ターミナル', 'モノレール浜松町'), walk('走到 JR 濱松町站'), ride('JR-East.KeihinTohokuNegishi', '浜松町', '大森'), walk('中央檢票口出站，步行 1 分鐘')]),
    ] },
    { date: '2026-11-21', from: 'd1c', to: 'd1d', plans: [
      plan('濱松町轉大江戶線', [walk('', '', '大森站'), ride('JR-East.KeihinTohokuNegishi', '大森', '浜松町'), walk('走到都營大門站'), ride('Toei.Oedo', '大門', '六本木'), walk()]),
      plan('品川、惠比壽轉日比谷線', [walk('', '', '大森站'), ride('JR-East.KeihinTohokuNegishi', '大森', '品川'), ride('JR-East.Yamanote', '品川', '恵比寿'), ride('TokyoMetro.Hibiya', '恵比寿', '六本木'), walk()]),
    ] },
    { date: '2026-11-21', from: 'd1g', to: null, to_name: HOTEL, plans: [
      plan('大門轉京濱東北線', [walk('走到六本木站'), ride('Toei.Oedo', '六本木', '大門'), walk('走到 JR 濱松町站'), ride('JR-East.KeihinTohokuNegishi', '浜松町', '大森'), walk('中央檢票口出站，步行 1 分鐘')]),
      plan('惠比壽、品川轉京濱東北線', [walk('走到六本木站'), ride('TokyoMetro.Hibiya', '六本木', '恵比寿'), ride('JR-East.Yamanote', '恵比寿', '品川'), ride('JR-East.KeihinTohokuNegishi', '品川', '大森'), walk('中央檢票口出站，步行 1 分鐘')]),
    ] },
    { date: '2026-11-22', from: null, from_name: HOTEL, to: 'd2a', plans: [
      plan('新橋轉淺草線', [walk('', '', '大森站'), ride('JR-East.KeihinTohokuNegishi', '大森', '新橋'), ride('Toei.Asakusa', '新橋', '人形町', 'A2 出口出站'), walk()]),
    ] },
    { date: '2026-11-24', from: null, from_name: HOTEL, to: 'd4a', plans: [
      plan('橫濱轉橫須賀線', [walk('', '', '大森站'), ride('JR-East.KeihinTohokuNegishi', '大森', '横浜'), ride('JR-East.Yokosuka', '横浜', '鎌倉'), walk('從鎌倉站東口沿若宮大路走過去')]),
    ] },
    { date: '2026-11-24', from: 'd4c', to: 'd4d', plans: [
      plan('江之電', [walk('走到鎌倉站（江之電月台）'), ride('Enoden.Enoden', '鎌倉', '長谷'), walk()]),
    ] },
    { date: '2026-11-24', from: 'd4e', to: 'd4f', start_time: '17:30', plans: [], notes: '17:30 回大森，怎麼坐之後再補' },
    { date: '2026-11-27', from: null, from_name: HOTEL, to: 'd7a', start_time: '08:30', plans: [
      plan('濱松町轉東京單軌電車', [walk('', '', '大森站'), ride('JR-East.KeihinTohokuNegishi', '大森', '浜松町'), walk('轉乘東京單軌電車'), ride('TokyoMonorail.HanedaAirport', 'モノレール浜松町', '羽田空港第3ターミナル')]),
    ] },
  ],
  maps: [{ label: '東京地鐵路線圖（Metro・都營）', image: 'metro_map' }],
  images: {},
};

const used = new Set([...data.activities.flatMap((a) => a.images ?? []), ...(data.maps ?? []).map((m) => m.image)]);
for (const k of used) data.images![k] = img(k);
writeFileSync(outFile, JSON.stringify(data));
console.log(`行程 ${data.activities.length}、路線 ${data.legs!.length}、圖片 ${used.size}，${Math.round(readFileSync(outFile).length / 1024)} KB`);
for (const l of data.legs!) for (const p of l.plans) console.log(l.date, p.label, p.steps.filter((s) => s.mode === 'rail').map((s) => `${s.code}${s.from_code ? ' ' : ''}${s.from}(${s.from_code})→${s.to}(${s.to_code}) ${s.direction} ${s.stops}站`).join(' | '));
