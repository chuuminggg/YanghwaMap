/**
 * 공중화장실정보 CSV -> src/data/seed-restrooms.json
 *
 * 원본: 공공데이터포털 '전국공중화장실표준데이터'
 *   안내  https://www.data.go.kr/data/15012892/standard.do
 *   배포  https://file.localdata.go.kr/file/download/public_restroom_info/info
 *
 * 주의: 이 표준데이터는 2025년 2월부로 WGS84 위도/경도 제공이 중단되어 좌표 컬럼이 없다.
 *       좌표는 다음 단계인 scripts/restroom-geocode.mjs 가 주소로 채운다.
 *
 * 외부 의존성 없이 CP949 CSV를 직접 파싱한다. 결과 JSON은 커밋되므로 앱 실행에는 필요하지 않다.
 *
 *   node scripts/restroom-csv-to-seed.mjs --download     전국 CSV를 새로 받아 변환
 *   node scripts/restroom-csv-to-seed.mjs                이미 받아 둔 CSV로 변환
 *   node scripts/restroom-csv-to-seed.mjs --region 부산광역시
 *   node scripts/restroom-csv-to-seed.mjs --all          시도 필터 없이 전국
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/* ---------- 인자 ---------- */
const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback
}

const CSV = resolve(root, opt('in', 'list_template/공중화장실정보.csv'))
const OUT = resolve(root, opt('out', 'src/data/seed-restrooms.json'))
const REGION = flag('all') ? null : opt('region', '서울특별시')
const SOURCE_URL = 'https://file.localdata.go.kr/file/download/public_restroom_info/info'

/* ---------- 다운로드 ---------- */
/** 이 서버는 User-Agent 없는 요청을 403으로 막는다. */
async function download(to) {
  console.log(`내려받는 중… ${SOURCE_URL}`)
  const response = await fetch(SOURCE_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      Referer: 'https://file.localdata.go.kr/file/public_restroom_info/info',
    },
  })
  if (!response.ok) throw new Error(`다운로드 실패 (HTTP ${response.status})`)
  const buf = Buffer.from(await response.arrayBuffer())
  mkdirSync(dirname(to), { recursive: true })
  writeFileSync(to, buf)
  console.log(`저장: ${to} (${(buf.length / 1024 / 1024).toFixed(1)}MB)`)
  return buf
}

/* ---------- 인코딩 ---------- */
/** 배포 파일은 CP949지만 언젠가 UTF-8로 바뀔 수 있어, 헤더가 읽히는 쪽을 고른다. */
function decode(buf) {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(buf.subarray(3))
  }
  const cp949 = new TextDecoder('euc-kr').decode(buf)
  if (cp949.slice(0, 500).includes('화장실명')) return cp949
  const utf8 = new TextDecoder('utf-8').decode(buf)
  if (utf8.slice(0, 500).includes('화장실명')) return utf8
  throw new Error('CSV 인코딩을 판별하지 못했습니다 (헤더에 화장실명이 없음).')
}

/* ---------- CSV 파서 ---------- */
/** 따옴표 안의 쉼표·줄바꿈·이스케이프("")를 처리하는 최소 구현. */
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]

    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
      continue
    }

    if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
      field = ''
    } else field += c
  }

  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/* ---------- 값 정규화 ---------- */
const text = (v) => (v ?? '').trim()

/** 'Y'/'있음'/'유' -> true, 'N'/'없음'/'무' -> false, 그 밖(빈 값·오타)은 undefined. */
const yn = (v) => {
  const s = text(v).toUpperCase()
  if (s === 'Y' || s === '있음' || s === '유' || s === 'O') return true
  if (s === 'N' || s === '없음' || s === '무' || s === 'X') return false
  return undefined
}

const num = (v) => {
  const n = Number(text(v))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/* ---------- 자치구 추출 ---------- */
/**
 * 주소 문자열만으로는 부족하다. '용산구녹사평대로11길'처럼 붙여 쓴 주소가 있고,
 * 비탐욕 정규식(\S*?[구군])은 '압구정로'를 '압구'로 잘라 낸다.
 * 그래서 알려진 구 이름 목록을 부분문자열로 찾고, 못 찾으면 개방자치단체코드로 채운다.
 */
const SEOUL_GU = [
  '강남구', '강동구', '강북구', '강서구', '관악구', '광진구', '구로구', '금천구', '노원구',
  '도봉구', '동대문구', '동작구', '마포구', '서대문구', '서초구', '성동구', '성북구', '송파구',
  '양천구', '영등포구', '용산구', '은평구', '종로구', '중구', '중랑구',
]
// '중구'가 '중랑구'에 걸리지 않도록 긴 이름부터 확인한다
const GU_BY_LENGTH = [...SEOUL_GU].sort((a, b) => b.length - a.length)

const findGu = (value) => {
  if (!value) return null
  for (const gu of GU_BY_LENGTH) if (value.includes(gu)) return gu
  return null
}

/** 코드→구 매핑을 하드코딩하지 않고, 주소로 이미 풀린 행들에서 만든다. */
function buildOrgCodeMap(records) {
  const tally = new Map()
  for (const { orgCode, district } of records) {
    if (!orgCode || !district) continue
    if (!tally.has(orgCode)) tally.set(orgCode, new Map())
    const counts = tally.get(orgCode)
    counts.set(district, (counts.get(district) ?? 0) + 1)
  }

  const map = new Map()
  for (const [orgCode, counts] of tally) {
    const total = [...counts.values()].reduce((a, b) => a + b, 0)
    const [top, hits] = [...counts].sort((a, b) => b[1] - a[1])[0]
    // 한 코드가 여러 구에 걸쳐 있으면 추측하지 않는다 (시설을 이웃 구청이 관리하는 경우가 있다)
    if (hits / total >= 0.95) map.set(orgCode, top)
  }
  return map
}

/* ---------- 실행 ---------- */
if (flag('download') || !existsSync(CSV)) {
  if (!flag('download')) console.log(`${CSV} 가 없어 새로 내려받습니다.`)
  await download(CSV)
}

const rows = parseCsv(decode(readFileSync(CSV)))
const header = rows[0].map((h) => h.trim())
console.log(`CSV ${rows.length - 1}행 / ${header.length}컬럼`)

const col = (...names) => {
  for (const name of names) {
    const i = header.indexOf(name)
    if (i >= 0) return i
  }
  return -1
}

const IDX = {
  orgCode: col('개방자치단체코드'),
  code: col('관리번호'),
  type: col('구분명', '구분'),
  name: col('화장실명'),
  roadAddress: col('소재지도로명주소'),
  jibunAddress: col('소재지지번주소'),
  manager: col('관리기관명'),
  phone: col('전화번호'),
  openTime: col('개방시간'),
  openTimeDetail: col('개방시간상세'),
  menSeat: col('남성용-대변기수'),
  menUrinal: col('남성용-소변기수'),
  menAccessible: col('남성용-장애인용대변기수'),
  womenSeat: col('여성용-대변기수'),
  womenAccessible: col('여성용-장애인용대변기수'),
  emergencyBell: col('비상벨설치여부'),
  cctv: col('화장실입구CCTV설치유무'),
  diaperTable: col('기저귀교환대유무'),
  dataDate: col('데이터기준일자'),
}

const unmapped = Object.entries(IDX)
  .filter(([, i]) => i < 0)
  .map(([k]) => k)
if (unmapped.length) console.warn(`⚠ 매핑 실패 컬럼(빈 값으로 채움): ${unmapped.join(', ')}`)
if (IDX.name < 0) throw new Error('화장실명 컬럼을 찾지 못했습니다. CSV 형식이 바뀐 것 같습니다.')

const at = (cells, key) => (IDX[key] >= 0 ? cells[IDX[key]] : '')

const seen = new Set()
const items = []
let skippedRegion = 0
let skippedNoName = 0
let skippedDuplicate = 0
let skippedShort = 0

for (let i = 1; i < rows.length; i++) {
  const cells = rows[i]
  // 따옴표가 깨진 행은 컬럼 수가 모자란다 — 주소가 밀려 들어오므로 버린다
  if (cells.length < header.length - 2) {
    skippedShort++
    continue
  }

  const name = text(at(cells, 'name'))
  if (!name) {
    skippedNoName++
    continue
  }

  const roadAddress = text(at(cells, 'roadAddress'))
  const jibunAddress = text(at(cells, 'jibunAddress'))
  if (REGION && !roadAddress.startsWith(REGION) && !jibunAddress.startsWith(REGION)) {
    skippedRegion++
    continue
  }

  // 관리번호가 비어 있는 행이 있어 이름+주소로 보조 키를 만든다
  const key = text(at(cells, 'code')) || `${name}|${roadAddress}|${jibunAddress}`
  if (seen.has(key)) {
    skippedDuplicate++
    continue
  }
  seen.add(key)

  const manager = text(at(cells, 'manager'))

  items.push({
    code: text(at(cells, 'code')),
    orgCode: text(at(cells, 'orgCode')),
    name,
    type: text(at(cells, 'type')),
    // 주소로 먼저 풀고, 실패분은 아래에서 개방자치단체코드로 채운다
    district: findGu(roadAddress) ?? findGu(jibunAddress) ?? findGu(manager) ?? '',
    roadAddress,
    jibunAddress,
    manager,
    phone: text(at(cells, 'phone')),
    openTime: text(at(cells, 'openTime')),
    openTimeDetail: text(at(cells, 'openTimeDetail')),
    menToilets: num(at(cells, 'menSeat')) + num(at(cells, 'menUrinal')),
    womenToilets: num(at(cells, 'womenSeat')),
    accessible: num(at(cells, 'menAccessible')) + num(at(cells, 'womenAccessible')) > 0,
    diaperTable: yn(at(cells, 'diaperTable')),
    emergencyBell: yn(at(cells, 'emergencyBell')),
    cctv: yn(at(cells, 'cctv')),
    dataDate: text(at(cells, 'dataDate')),
    // 좌표는 restroom-geocode.mjs 가 채운다
    lat: null,
    lng: null,
  })
}

// 주소로 구를 못 찾은 행을, 같은 자치단체코드를 쓰는 행들의 구로 채운다
const orgCodeMap = buildOrgCodeMap(items)
let rescued = 0
for (const item of items) {
  if (item.district) continue
  const guess = orgCodeMap.get(item.orgCode)
  if (guess) {
    item.district = guess
    rescued++
  }
}
const unresolved = items.filter((it) => !it.district).length

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, `${JSON.stringify(items, null, 2)}\n`, 'utf8')

const districts = new Set(items.map((it) => it.district).filter(Boolean))

console.log(`
대상 지역   ${REGION ?? '전국'}
변환 완료   ${items.length}건 -> ${OUT}
제외        지역 밖 ${skippedRegion} / 이름 없음 ${skippedNoName} / 중복 ${skippedDuplicate} / 깨진 행 ${skippedShort}
자치구      ${districts.size}개 (주소로 ${items.length - rescued - unresolved}건, 자치단체코드로 ${rescued}건, 미분류 ${unresolved}건)

다음 단계: npm run db:setup && npm run db:seed:restrooms   (지역구별 목록은 좌표 없이 동작)
           npm run restrooms:geocode                        (카카오 REST 키로 좌표 채우기)`)
