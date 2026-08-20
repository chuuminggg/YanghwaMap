// 엑셀에서 뽑은 시드 데이터를 DB에 넣는다.
//   npm run db:seed          비어 있을 때만 삽입
//   npm run db:seed -- --force   기존 데이터를 모두 지우고 다시 삽입
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
if (!url) {
  console.error('DATABASE_URL이 없습니다. .env.local 을 확인하거나 `vercel env pull .env.local` 하세요.')
  process.exit(1)
}

const seedPath = fileURLToPath(new URL('../src/data/seed-restaurants.json', import.meta.url))
const rows = JSON.parse(readFileSync(seedPath, 'utf8'))
const force = process.argv.includes('--force')

const sql = neon(url)

const [{ count }] = await sql`select count(*)::int as count from restaurants`
if (count > 0 && !force) {
  console.log(`이미 ${count}건이 있어 건너뜁니다. 새로 채우려면: npm run db:seed -- --force`)
  process.exit(0)
}

if (force && count > 0) {
  await sql`truncate table restaurants`
  console.log(`기존 ${count}건 삭제`)
}

// 목록은 created_at 내림차순이다. 엑셀 순서를 그대로 보여 주려면 앞 행이 더 '최신'이어야 한다.
// 기준 시각을 과거로 두어, 앞으로 추가되는 맛집은 항상 시드보다 위에 오게 한다.
const BASE = new Date('2024-01-01T00:00:00Z').getTime()

for (const [index, row] of rows.entries()) {
  const createdAt = new Date(BASE - index * 1000).toISOString()
  await sql`
    insert into restaurants (name, menu, district, dong, area_raw, address, memo, reference, visited, created_at, updated_at)
    values (${row.name}, ${row.menu}, ${row.district}, ${row.dong}, ${row.areaRaw},
            ${row.address}, ${row.memo}, ${row.reference}, ${row.visited}, ${createdAt}, ${createdAt})
  `
}

console.log(`시드 ${rows.length}건 삽입 완료`)
