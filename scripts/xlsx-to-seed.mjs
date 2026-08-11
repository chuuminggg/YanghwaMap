/**
 * list_template/식당.xlsx -> src/data/seed-restaurants.json
 *
 * 외부 의존성 없이 xlsx(=zip)를 직접 풀어 파싱한다. 일회성 변환용 스크립트이며,
 * 결과 JSON은 커밋되므로 앱 실행에는 필요하지 않다. (재생성: npm run seed)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const XLSX = resolve(root, 'list_template/식당.xlsx')
const OUT = resolve(root, 'src/data/seed-restaurants.json')

/* ---------- 최소 ZIP 리더 (central directory 기준) ---------- */
function unzip(buf) {
  const eocd = (() => {
    for (let i = buf.length - 22; i >= 0; i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) return i
    }
    throw new Error('EOCD not found')
  })()
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const files = new Map()

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central header')
    const method = buf.readUInt16LE(p + 10)
    const compSize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOff = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)

    const lNameLen = buf.readUInt16LE(localOff + 26)
    const lExtraLen = buf.readUInt16LE(localOff + 28)
    const start = localOff + 30 + lNameLen + lExtraLen
    const raw = buf.subarray(start, start + compSize)
    files.set(name, method === 0 ? raw : inflateRawSync(raw))

    p += 46 + nameLen + extraLen + commentLen
  }
  return files
}

/* ---------- 최소 XML 헬퍼 ---------- */
const decode = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&amp;/g, '&')

/** <si> 안의 모든 <t> 텍스트를 이어붙여 sharedStrings 배열을 만든다. */
function parseSharedStrings(xml) {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(([, si]) =>
    [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join(''),
  )
}

/** sheet1.xml -> { [행번호]: { A: '값', B: '값', ... } } */
function parseSheet(xml, shared) {
  const rows = []
  for (const [, rowAttrs, body] of xml.matchAll(/<row([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowNum = Number(/r="(\d+)"/.exec(rowAttrs)?.[1])
    const cells = {}
    // 속성부는 반드시 lazy — greedy면 self-closing(<c r="A2"/>)에서 다음 셀까지 삼킨다
    for (const [, cellAttrs, inner] of body.matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /r="([A-Z]+)\d+"/.exec(cellAttrs)?.[1]
      if (!ref) continue
      const type = /t="([^"]+)"/.exec(cellAttrs)?.[1]
      const content = inner ?? ''
      let value = ''
      if (type === 's') {
        const idx = /<v>([\s\S]*?)<\/v>/.exec(content)?.[1]
        value = idx != null ? (shared[Number(idx)] ?? '') : ''
      } else if (type === 'inlineStr') {
        value = [...content.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join('')
      } else {
        value = decode(/<v>([\s\S]*?)<\/v>/.exec(content)?.[1] ?? '')
      }
      cells[ref] = value.trim()
    }
    rows.push({ rowNum, cells })
  }
  return rows
}

/* ---------- 정규화 ---------- */

/** 서울 25개 자치구 — '강서구청사거리'처럼 뒤에 글자가 붙어도 구를 집어내기 위해 사용 */
const SEOUL_GU = [
  '종로구', '중구', '용산구', '성동구', '광진구', '동대문구', '중랑구', '성북구',
  '강북구', '도봉구', '노원구', '은평구', '서대문구', '마포구', '양천구', '강서구',
  '구로구', '금천구', '영등포구', '동작구', '관악구', '서초구', '강남구', '송파구',
  '강동구',
].sort((a, b) => b.length - a.length) // 긴 이름 우선 (서대문구 > 중구)

/** 구 이름을 특정할 수 없는 행은 추정하지 않고 원문을 그대로 둔다. */
const GU_RE = /([가-힣]+구)(?![가-힣])/
const DONG_RE = /([가-힣]{1,4}[0-9]?동)(?![가-힣])/

/** 상호가 아니라 업종/메뉴로 봐야 하는 단어들 (엑셀 실데이터 기준) */
const GENERIC = new Set([
  '식당가', '기사식당', '구내식당', '한식부페', '한식뷔페', '부페', '뷔페',
  '백반집', '분식', '한식', '중식', '순대국', '순대국밥', '콩나물국밥',
  '콩나물해장', '닭곰탕', '부대찌게', '부대찌개', '소머리국밥', '만두국',
])

const isGeneric = (s) => GENERIC.has(s.replace(/\s|다수/g, ''))

/** '상호 및 메뉴' 열을 상호/메뉴로 분리한다. 애매하면 상호는 비우고 호출부가 랜드마크로 대체. */
function splitNameMenu(rawInput) {
  const raw = rawInput.trim()
  if (!raw) return { name: '', menu: '' }

  // '장수국수(만두국외)', '(서울밥상)' 처럼 괄호가 붙은 형태
  const paren = /^([^()]*)\(([^)]*)\)$/.exec(raw)
  if (paren) {
    const head = paren[1].trim()
    const inside = paren[2].trim().replace(/외$/, ' 외').trim()
    if (!head) return { name: inside.replace(/\s*외$/, ''), menu: '' }
    return { name: head, menu: inside }
  }

  // 'A외 B' -> 상호 A / 메뉴 B
  const parts = raw.split(/외\s*/).map((s) => s.trim()).filter(Boolean)
  let name = parts[0] ?? ''
  let menu = parts.slice(1).join(', ')

  // '봄봄 한식부페', '뚝다리 기사식당' -> 뒤쪽 업종어를 메뉴로 분리
  const spaced = name.split(/\s+/)
  if (spaced.length > 1 && isGeneric(spaced.at(-1))) {
    menu = [spaced.at(-1), menu].filter(Boolean).join(', ')
    name = spaced.slice(0, -1).join(' ')
  }

  if (!name || isGeneric(name)) {
    menu = [name, menu].filter(Boolean).join(', ')
    name = ''
  }
  return { name, menu: menu.trim() }
}

function normalizeArea(areaRaw, locationRaw) {
  const area = areaRaw.trim()
  const gu = SEOUL_GU.find((g) => area.includes(g)) ?? GU_RE.exec(area)?.[1] ?? ''
  const district = gu || area // 구를 못 찾으면 원문 유지 (예: 천호사거리, 양재동, 경기도)
  const rest = gu ? area.replace(gu, '') : ''
  const dong = DONG_RE.exec(rest)?.[1] ?? DONG_RE.exec(locationRaw)?.[1] ?? ''
  return { district, dong, areaRaw: area }
}

/* ---------- 실행 ---------- */
const files = unzip(readFileSync(XLSX))
const shared = parseSharedStrings(files.get('xl/sharedStrings.xml').toString('utf8'))
const rows = parseSheet(files.get('xl/worksheets/sheet1.xml').toString('utf8'), shared)

// 1행은 헤더(구역별(동) / 위치 / 상호 및 메뉴 / 참 조)
const seed = []
for (const { rowNum, cells } of rows) {
  if (rowNum === 1) continue
  const areaRaw = cells.B ?? ''
  const location = cells.C ?? ''
  const nameMenu = cells.D ?? ''
  const reference = cells.E ?? ''
  if (!areaRaw && !location && !nameMenu) continue

  const { district, dong, areaRaw: areaKept } = normalizeArea(areaRaw, location)
  const split = splitNameMenu(nameMenu)

  seed.push({
    name: split.name || location || areaKept,
    menu: split.menu,
    district,
    dong,
    areaRaw: areaKept,
    address: '',
    memo: location,
    reference,
    visited: true,
  })
}

writeFileSync(OUT, `${JSON.stringify(seed, null, 2)}\n`, 'utf8')
console.log(`seed rows: ${seed.length} -> ${OUT}`)
console.log(
  '구 미확정(원문 유지):',
  [...new Set(seed.filter((r) => !/구$/.test(r.district)).map((r) => r.district))].join(', ') || '없음',
)
