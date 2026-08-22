// 공중화장실 시드 데이터를 DB에 넣는다. 좌표가 없는 행은 건너뛴다.
//   npm run db:seed:restrooms              비어 있을 때만 삽입
//   npm run db:seed:restrooms -- --force   기존 데이터를 모두 지우고 다시 삽입
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
if (!url) {
  console.error('DATABASE_URL이 없습니다. .env.local 을 확인하거나 `vercel env pull .env.local` 하세요.')
  process.exit(1)
}

const seedPath = fileURLToPath(new URL('../src/data/seed-restrooms.json', import.meta.url))
const rows = JSON.parse(readFileSync(seedPath, 'utf8'))
const force = process.argv.includes('--force')

// 좌표는 지오코딩 전이라 비어 있을 수 있다. 지역구별 목록은 좌표 없이도 동작하므로 전부 넣는다.
const withoutCoords = rows.filter((r) => typeof r.lat !== 'number' || typeof r.lng !== 'number').length

if (rows.length === 0) {
  console.error('시드 데이터가 비어 있습니다. 먼저 실행하세요: npm run restrooms:fetch')
  process.exit(1)
}

const sql = neon(url)

const [{ count }] = await sql`select count(*)::int as count from restrooms`
if (count > 0 && !force) {
  console.log(`이미 ${count}건이 있어 건너뜁니다. 새로 채우려면: npm run db:seed:restrooms -- --force`)
  process.exit(0)
}

if (force && count > 0) {
  await sql`truncate table restrooms`
  console.log(`기존 ${count}건 삭제`)
}

const COLUMNS = [
  'code', 'name', 'type', 'district', 'road_address', 'jibun_address', 'lat', 'lng',
  'manager', 'phone', 'open_time', 'open_time_detail',
  'men_toilets', 'women_toilets', 'accessible', 'diaper_table', 'emergency_bell', 'cctv', 'data_date',
  'coord_source',
]

const toValues = (r) => [
  r.code ?? '', r.name, r.type ?? '', r.district ?? '', r.roadAddress ?? '', r.jibunAddress ?? '',
  typeof r.lat === 'number' ? r.lat : null, typeof r.lng === 'number' ? r.lng : null,
  r.manager ?? '', r.phone ?? '', r.openTime ?? '', r.openTimeDetail ?? '',
  r.menToilets ?? 0, r.womenToilets ?? 0, r.accessible ?? false,
  r.diaperTable ?? null, r.emergencyBell ?? null, r.cctv ?? null, r.dataDate ?? '',
  r.geocodedFrom === 'failed' ? '' : (r.geocodedFrom ?? ''),
]

// 수천 건이라 행 단위 왕복 대신 배치로 넣는다 (Neon HTTP 드라이버는 요청당 왕복 1회)
const BATCH = 200
let inserted = 0

for (let start = 0; start < rows.length; start += BATCH) {
  const chunk = rows.slice(start, start + BATCH)
  const values = chunk.flatMap(toValues)
  const placeholders = chunk
    .map((_, i) => `(${COLUMNS.map((_, c) => `$${i * COLUMNS.length + c + 1}`).join(', ')})`)
    .join(', ')

  const result = await sql.query(
    `insert into restrooms (${COLUMNS.join(', ')}) values ${placeholders}
     on conflict do nothing returning id`,
    values,
  )
  inserted += result.length
  process.stdout.write(`\r삽입 ${Math.min(start + BATCH, rows.length)}/${rows.length}   `)
}

const located = rows.length - withoutCoords
console.log(`
시드 ${inserted}건 삽입 완료 (좌표 있음 ${located} / 없음 ${withoutCoords})`)
if (withoutCoords > 0) {
  console.log('좌표 없는 항목은 지역구별 목록에만 보인다. 채우려면: npm run restrooms:geocode')
}
