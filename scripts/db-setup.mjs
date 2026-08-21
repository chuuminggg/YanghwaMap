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

// 공중화장실 — 공공데이터라 읽기 전용이다. 좌표 없는 행은 거리 정렬에 못 쓰므로 not null.
await sql`
  create table if not exists restrooms (
    id               uuid primary key default gen_random_uuid(),
    code             text not null default '',
    name             text not null,
    type             text not null default '',
    road_address     text not null default '',
    jibun_address    text not null default '',
    lat              double precision not null,
    lng              double precision not null,
    manager          text not null default '',
    phone            text not null default '',
    open_time        text not null default '',
    open_time_detail text not null default '',
    men_toilets      smallint not null default 0,
    women_toilets    smallint not null default 0,
    accessible       boolean not null default false,
    diaper_table     boolean,
    emergency_bell   boolean,
    cctv             boolean,
    data_date        text not null default ''
  )
`
// 근처 조회는 bbox로 먼저 자르므로 (lat, lng) 인덱스가 그대로 쓰인다
await sql`create index if not exists restrooms_coord_idx on restrooms (lat, lng)`
// 관리번호가 비어 있는 행이 있어 부분 인덱스로 건다
await sql`create unique index if not exists restrooms_code_idx on restrooms (code) where code <> ''`

const [{ count }] = await sql`select count(*)::int as count from restaurants`
const [{ restrooms }] = await sql`select count(*)::int as restrooms from restrooms`
console.log(`restaurants 테이블 준비 완료 (현재 ${count}건)`)
console.log(`restrooms 테이블 준비 완료 (현재 ${restrooms}건)`)
