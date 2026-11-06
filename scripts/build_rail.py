"""產生 public/data/rail-tokyo.json（東京一帶的鐵路路線與車站）

資料來源：
  - 路線、車站順序、名稱（含繁體中文）、座標、轉乘站：Mini Tokyo 3D（MIT 授權）
    https://github.com/nagix/mini-tokyo-3d  data/railways.json, stations.json, station-groups.json
  - 車站編號：open-data-jp-railway-stations（以公共交通開放資料為基礎），再加上下方 CODE_FIX 的人工更新
    https://github.com/piuccio/open-data-jp-railway-stations

用法：python3 scripts/build_rail.py <mini-tokyo-3d 資料夾> <open-data-jp-railway-stations 資料夾>
"""
import json, re, sys, datetime, unicodedata

MT, OD = sys.argv[1], sys.argv[2]

# (Mini Tokyo 3D id, 編號字首, 從哪站, 到哪站, 官方顏色或 None, 顯示名稱或 None)
LINES = [
  ('TokyoMetro.Ginza','G',None,None,'#F39700','東京Metro 銀座線'),
  ('TokyoMetro.Marunouchi','M',None,None,'#E60012','東京Metro 丸之內線'),
  ('TokyoMetro.MarunouchiBranch','Mb',None,None,'#E60012','東京Metro 丸之內線（方南町支線）'),
  ('TokyoMetro.Hibiya','H',None,'北千住','#9CAEB7','東京Metro 日比谷線'),
  ('TokyoMetro.Tozai','T',None,None,'#00A7DB','東京Metro 東西線'),
  ('TokyoMetro.Chiyoda','C','代々木上原',None,'#009944','東京Metro 千代田線'),
  ('TokyoMetro.Yurakucho','Y',None,None,'#D7C447','東京Metro 有樂町線'),
  ('TokyoMetro.Hanzomon','Z',None,None,'#9B7CB6','東京Metro 半藏門線'),
  ('TokyoMetro.Namboku','N',None,None,'#00ADA9','東京Metro 南北線'),
  ('TokyoMetro.Fukutoshin','F',None,None,'#BB641D','東京Metro 副都心線'),
  ('Toei.Asakusa','A',None,None,'#E85298','都營 淺草線'),
  ('Toei.Mita','I',None,None,'#0079C2','都營 三田線'),
  ('Toei.Shinjuku','S',None,None,'#6CBB5A','都營 新宿線'),
  ('Toei.Oedo','E',None,None,'#B6007A','都營 大江戶線'),
  ('Toei.NipporiToneri','NT',None,None,None,'日暮里・舍人線'),
  ('Toei.Arakawa','SA',None,None,None,'都電荒川線（東京櫻花路面電車）'),
  ('JR-East.Yamanote','JY',None,None,None,'JR 山手線'),
  ('JR-East.ChuoRapid','JC',None,None,None,'JR 中央線快速'),
  ('JR-East.ChuoSobuLocal','JB',None,None,None,'JR 中央・總武線（各站停車）'),
  ('JR-East.KeihinTohokuNegishi','JK',None,None,None,'JR 京濱東北線・根岸線'),
  ('JR-East.SaikyoKawagoe','JA',None,None,None,'JR 埼京線'),
  ('JR-East.ShonanShinjuku','JS',None,None,None,'JR 湘南新宿線'),
  ('JR-East.SobuRapid','JO',None,None,None,'JR 總武快速線'),
  ('JR-East.Yokosuka','JO',None,None,None,'JR 橫須賀線'),
  ('JR-East.Tokaido','JT',None,None,None,'JR 東海道線'),
  ('JR-East.Keiyo','JE',None,None,None,'JR 京葉線'),
  ('JR-East.JobanRapid','JJ',None,None,None,'JR 常磐線快速'),
  ('JR-East.Utsunomiya','JU',None,None,None,'JR 宇都宮線'),
  ('JR-East.Takasaki','JU',None,None,None,'JR 高崎線'),
  ('JR-East.Nambu','JN',None,None,None,'JR 南武線'),
  ('JR-East.Musashino','JM',None,None,None,'JR 武藏野線'),
  ('JR-East.Yokohama','JH',None,None,None,'JR 橫濱線'),
  ('TWR.Rinkai','R',None,None,None,'臨海線'),
  ('Yurikamome.Yurikamome','U',None,None,None,'百合海鷗號'),
  ('TokyoMonorail.HanedaAirport','MO',None,None,None,'東京單軌電車'),
  ('Keikyu.Main','KK','品川',None,None,'京急本線'),
  ('Keikyu.Airport','KK',None,None,None,'京急機場線'),
  ('Keisei.Main','KS',None,None,None,'京成本線'),
  ('Keisei.Oshiage','KS',None,None,None,'京成押上線'),
  ('Keisei.NaritaSkyAccess','KS',None,None,None,'京成成田 Sky Access 線'),
  ('Tobu.TobuSkytree','TS',None,None,None,'東武晴空塔線'),
  ('Tobu.TobuSkytreeBranch','TS',None,None,None,'東武晴空塔線（押上支線）'),
  ('Tobu.Tojo','TJ',None,None,None,'東武東上線'),
  ('Seibu.Ikebukuro','SI',None,None,None,'西武池袋線'),
  ('Seibu.Shinjuku','SS',None,None,None,'西武新宿線'),
  ('Odakyu.Odawara','OH',None,None,None,'小田急小田原線'),
  ('Odakyu.Enoshima','OE',None,None,None,'小田急江之島線'),
  ('Odakyu.Tama','OT',None,None,None,'小田急多摩線'),
  ('OdakyuHakone.HakoneTozan','OH',None,None,None,'箱根登山電車'),
  ('Tokyu.Toyoko','TY',None,None,None,'東急東橫線'),
  ('Tokyu.DenEnToshi','DT',None,None,None,'東急田園都市線'),
  ('Tokyu.Meguro','MG',None,None,None,'東急目黑線'),
  ('Tokyu.Oimachi','OM',None,None,None,'東急大井町線'),
  ('Tokyu.Ikegami','IK',None,None,None,'東急池上線'),
  ('Tokyu.TokyuTamagawa','TM',None,None,None,'東急多摩川線'),
  ('Tokyu.Setagaya','SG',None,None,None,'東急世田谷線'),
  ('Keio.Keio','KO',None,None,None,'京王線'),
  ('Keio.KeioNew','KO',None,None,None,'京王新線'),
  ('Keio.Inokashira','IN',None,None,None,'京王井之頭線'),
  ('Keio.Takao','KO',None,None,None,'京王高尾線'),
  ('Keio.Sagamihara','KO',None,None,None,'京王相模原線'),
  ('Minatomirai.Minatomirai','MM',None,None,None,'港未來線'),
  ('Sotetsu.Main','SO',None,None,None,'相鐵本線'),
  ('YokohamaMunicipal.Blue','B',None,None,None,'橫濱市營地鐵 藍線'),
  ('YokohamaMunicipal.Green','G',None,None,None,'橫濱市營地鐵 綠線'),
  ('MIR.TsukubaExpress','TX',None,None,None,'筑波快線'),
  ('Enoden.Enoden','EN',None,None,None,'江之島電鐵'),
]

# 2018 年之後新增車站或重新編號的人工修正：(線, 站名) → 編號
CODE_FIX = {
  # 2020 年虎之門之丘站開業，日比谷線 H06 之後全部往後加一
  ('TokyoMetro.Hibiya','虎ノ門ヒルズ'):'H06',
  ('JR-East.Yamanote','高輪ゲートウェイ'):'JY26',
  ('JR-East.KeihinTohokuNegishi','高輪ゲートウェイ'):'JK21',
  ('TokyoMetro.MarunouchiBranch','中野坂上'):'M06',
}
RENUMBER_AFTER = {  # 這條線在某站（含）之後的編號全部加一
  'TokyoMetro.Hibiya': ('霞ケ関', 1),
}

def norm(n):
  n = re.sub(r'[〈<（(].*?[〉>）)]', '', n)
  n = unicodedata.normalize('NFKC', n)
  return n.replace('ヶ','ケ').replace('ヵ','カ').strip()

def fixcode(c):
  c = c.replace('-', '')
  m = re.match(r'^([A-Za-z]+)(\d+)$', c)
  if not m: return c
  return m.group(1) + m.group(2).zfill(2)

rails = {r['id']: r for r in json.load(open(f'{MT}/railways.json'))}
stations = {s['id']: s for s in json.load(open(f'{MT}/stations.json'))}
groups = json.load(open(f'{MT}/station-groups.json'))

odidx = {}
for grp in json.load(open(f'{OD}/stations.json')):
  for st in grp['stations']:
    c = st.get('short_code') or ''
    if c:
      odidx.setdefault(norm(st['name_kanji']), set()).add(fixcode(c))
ALIAS = {'羽田空港第3ターミナル': '羽田空港国際線ターミナル', '羽田空港第1・第2ターミナル': '羽田空港国内線ターミナル',
         '羽田空港第2ターミナル': '羽田空港第2ビル', '羽田空港第1ターミナル': '羽田空港第1ビル',
         '花月総持寺': '花月園前', '京急東神奈川': '仲木戸', '東京国際クルーズターミナル': '船の科学館',
         '東京ビッグサイト': '国際展示場正門', '麴町': '麹町', '獨協大学前': '松原団地'}
EXTRA_PREFIX = {'Odakyu.Enoshima': ['OH'], 'Odakyu.Tama': ['OH']}

out_lines, used = [], {}
report = []
for lid, prefix, frm, to, color, name in LINES:
  r = rails[lid]
  ids = list(r['stations'])
  ja = [norm(stations[i]['title']['ja']) for i in ids]
  if frm: ids = ids[ja.index(frm):]; ja = ja[ja.index(frm):]
  if to: ids = ids[:ja.index(to) + 1]; ja = ja[:ja.index(to) + 1]
  if lid == 'Keikyu.Airport':
    # Mini Tokyo 3D 把品川也放進機場線（直通車）。實際機場線是京急蒲田起。
    k = ja.index('京急蒲田'); ids = ids[k:]; ja = ja[k:]
  codes = []
  for i, n in zip(ids, ja):
    fix = CODE_FIX.get((lid, n))
    if fix: codes.append(fix); continue
    cand = [c for c in odidx.get(n, set()) | odidx.get(norm(ALIAS.get(n, n)), set())
            if any(re.match(r'^' + p + r'\d+$', c) for p in [prefix] + EXTRA_PREFIX.get(lid, []))]
    codes.append(cand[0] if len(cand) == 1 else (sorted(cand)[0] if cand else ''))
    if len(cand) > 1: report.append(f'{lid} {n} 多個編號 {cand}')
  if lid in RENUMBER_AFTER:
    at, d = RENUMBER_AFTER[lid]; k = ja.index(at)
    for j in range(k, len(codes)):
      if codes[j] and (lid, ja[j]) not in CODE_FIX:
        m = re.match(r'^([A-Za-z]+)(\d+)$', codes[j]); codes[j] = m.group(1) + str(int(m.group(2)) + d).zfill(2)
  # 只缺一站、而前後編號剛好差 2（例如 TS16、?、TS18）→ 補上中間的號碼
  for k in range(1, len(codes) - 1):
    a, b = codes[k - 1], codes[k + 1]
    if not codes[k] and a and b:
      ma, mb = re.match(r'^([A-Z]+)(\d+)$', a), re.match(r'^([A-Z]+)(\d+)$', b)
      if ma and mb and ma.group(1) == mb.group(1) and abs(int(ma.group(2)) - int(mb.group(2))) == 2:
        codes[k] = ma.group(1) + str((int(ma.group(2)) + int(mb.group(2))) // 2).zfill(2)
        report.append(f'{lid} {ja[k]} 推算編號 {codes[k]}')
  # 中間有新車站（沒有編號）時，之後的編號可能已經重新編過，為了不顯示錯的編號就不顯示
  for k in range(1, len(codes) - 1):
    if not codes[k] and any(codes[:k]) and any(codes[k + 1:]):
      num = lambda c: int(re.sub(r'\D', '', c))
      before = [num(c) for c in codes[:k] if c]; after = [num(c) for c in codes[k + 1:] if c]
      if after and before and after[0] > before[-1]:
        codes[k:] = [''] * (len(codes) - k)
      elif after and before:
        codes[:k] = [''] * k
      report.append(f'{lid} 在 {ja[k]} 有新車站，部分編號不顯示')
      break
  miss = [n for n, c in zip(ja, codes) if not c]
  if miss: report.append(f'{lid} 沒有編號：{miss}')
  # 檢查編號是否依序（單調）
  nums = [int(re.sub(r'\D', '', c)) for c in codes if c]
  if nums and not (nums == sorted(nums) or nums == sorted(nums, reverse=True)):
    report.append(f'{lid} 編號沒有依序：{list(zip(ja, codes))}')
  for i in ids: used[i] = True
  out_lines.append({
    'id': lid, 'name': name or r['title']['zh-Hant'], 'ja': r['title']['ja'],
    'color': color or r['color'], 'prefix': prefix,
    'loop': ids[0] == ids[-1] and len(ids) > 2,
    'stations': ids, 'codes': codes,
  })

# 直通運轉：實際上同一班車、不用下車的組合，做成一條線，方便選上下車站
COMPOSITE = [
  ('Keikyu.AirportShinagawa', '京急機場線（直通品川）', [('Keikyu.Main', '品川', '京急蒲田'), ('Keikyu.Airport', '京急蒲田', None)]),
]
by_id = {l['id']: l for l in out_lines}
for cid, cname, parts in COMPOSITE:
  ids, codes = [], []
  for lid, a, b in parts:
    l = by_id[lid]
    ja = [norm(stations[i]['title']['ja']) for i in l['stations']]
    i0 = ja.index(a) + (1 if ids else 0)
    i1 = ja.index(b) + 1 if b else len(ja)
    ids += l['stations'][i0:i1]; codes += l['codes'][i0:i1]
  base = by_id[parts[0][0]]
  out_lines.insert(out_lines.index(by_id[parts[-1][0]]) + 1, {
    'id': cid, 'name': cname, 'ja': '京急空港線（品川直通）', 'color': base['color'], 'prefix': base['prefix'],
    'loop': False, 'stations': ids, 'codes': codes,
  })

# 車站：名稱、日文名、座標
out_st = {}
for i in used:
  s = stations[i]
  out_st[i] = {'n': s['title'].get('zh-Hant') or s['title']['ja'], 'ja': norm(s['title']['ja']),
               'c': [round(x, 5) for x in s.get('coord', [0, 0])]}
# 轉乘群組：同一個車站（或站內相連）的不同路線
grp_out = []
for g in groups:
  flat = [i for part in g for i in part if i in used]
  if len(flat) > 1: grp_out.append(flat)

data = {'updated': datetime.date.today().isoformat(),
        'source': 'Mini Tokyo 3D（MIT）、公共交通開放資料',
        'lines': out_lines, 'stations': out_st, 'groups': grp_out}
json.dump(data, open('public/data/rail-tokyo.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print('\n'.join(report))
print(len(out_lines), 'lines', len(out_st), 'stations')
