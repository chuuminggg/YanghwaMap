// 테이블/인덱스를 만든다. 여러 번 실행해도 안전하다.
//   npm run db:setup
import { neon } from '@neondatabase/serverless'

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
if (!url) {
  console.error('DATABASE_URL이 없습니다. .env.local 을 확인하거나 `vercel env pull .env.local` 하세요.')
  process.exit(1)
}

const sql = neon(url)

await sql`
  create table if not exists restaurants (
    id              uuid primary key default gen_random_uuid(),
    name            text not null,
    menu            text not null default '',
    district        text not null default '',
    dong            text not null default '',
    area_raw        text not null default '',
    address         text not null default '',
    lat             double precision,
    lng             double precision,
    kakao_place_url text,
    memo            text not null default '',
    reference       text not null default '',
    visited         boolean not null default true,
    rating          smallint check (rating between 1 and 5),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
  )
`
await sql`create index if not exists restaurants_area_idx on restaurants (district, dong)`

const [{ count }] = await sql`select count(*)::int as count from restaurants`
console.log(`restaurants 테이블 준비 완료 (현재 ${count}건)`)
