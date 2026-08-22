/**
 * 좌표가 없는 맛집을 메모의 랜드마크로 추정해 채운다.
 *
 *   npm run restaurants:geocode              실제로 DB에 쓴다
 *   npm run restaurants:geocode -- --dry     조회만 하고 결과를 출력한다
 *
 * 엑셀 원본에는 주소가 없고 '뱅뱅사거리', '성내도서관옆' 같은 위치 메모만 있다.
 * 메모가 가리키는 지점을 카카오에서 찾으면 맛집이 그 옆이므로 오차가 100m 안쪽이다.
 * 다만 정확한 상호 좌표는 아니므로 coord_source='landmark' 로 표시해 화면에서 구분한다.
 *
 * 사용자가 '주소 찾기'로 직접 고른 좌표(lat이 이미 있는 행)는 절대 덮어쓰지 않는다.
 */
import { neon } from '@neondatabase/serverless'

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
const KEY = process.env.KAKAO_REST_API_KEY

if (!url) {
  console.error('DATABASE_URL이 없습니다. .env.local 을 확인하세요.')
  process.exit(1)
}
if (!KEY) {
  console.error('KAKAO_REST_API_KEY 가 없습니다. .env.local 을 확인하세요.')
  process.exit(1)
}

const dry = process.argv.includes('--dry')
const sql = neon(url)

/** 대한민국 범위 밖이면 버린다 */
const inKorea = (lat, lng) => lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132

/**
 * '성내도서관옆' -> '성내도서관', 'CU역삼사랑점 옆' -> 'CU역삼사랑점'
 * 메모 끝의 방향어를 떼야 랜드마크 자체가 검색어가 된다.
 */
const landmark = (value) =>
  (value ?? '')
    .replace(/\s*(옆|앞|뒤|뒤쪽|건너편|맞은편|쪽|근처|주변|대각선|골목|옆골목|내|구내|길건너편)\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function search(query) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=1`,
      { headers: { Authorization: `KakaoAK ${KEY}` } },
    )
    if (response.status === 429) {
      await sleep(400 * 2 ** attempt)
      continue
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(`카카오 인증 실패 (HTTP ${response.status}). REST API 키를 확인하세요.`)
    }
    if (!response.ok) return null

    const doc = (await response.json()).documents?.[0]
    if (!doc) return null
    const lat = Number(doc.y)
    const lng = Number(doc.x)
    if (!inKorea(lat, lng)) return null
    return { lat, lng, place: doc.place_name, address: doc.road_address_name || doc.address_name }
  }
  return null
}

/** 메모 -> 상호 순으로, 각각 '구 동'과 '구'만 붙인 두 형태를 시도한다. */
async function locate(row) {
  const area = [row.district, row.dong].filter(Boolean).join(' ')
  const memo = landmark(row.memo)
  const name = landmark(row.name)

  const queries = []
  if (memo) {
    if (area) queries.push(`${area} ${memo}`)
    if (row.district && area !== row.district) queries.push(`${row.district} ${memo}`)
  }
  if (name && name !== memo && area) queries.push(`${area} ${name}`)

  for (const query of queries) {
    const hit = await search(query)
    if (hit) return { ...hit, query }
    await sleep(120)
  }
  return null
}

const rows = await sql`
  select id, name, district, dong, memo from restaurants
   where lat is null and (memo <> '' or name <> '')
   order by district, name
`

console.log(`좌표 없는 맛집 ${rows.length}건${dry ? ' (조회만)' : ''}\n`)

let located = 0
const failed = []

for (const row of rows) {
  const hit = await locate(row)
  if (hit) {
    located++
    console.log(`OK  ${row.district} ${row.name}`)
    console.log(`      "${hit.query}" -> ${hit.place} | ${hit.address}`)
    if (!dry) {
      await sql`
        update restaurants
           set lat = ${hit.lat}, lng = ${hit.lng}, coord_source = 'landmark', updated_at = now()
         where id = ${row.id} and lat is null
      `
    }
  } else {
    failed.push(row)
    console.log(`--  ${row.district} ${row.name} | 메모="${row.memo}"`)
  }
  await sleep(120)
}

console.log(`
좌표 확보  ${located}/${rows.length}
실패      ${failed.length}${failed.length ? ` (${failed.map((r) => r.name).join(', ')})` : ''}

랜드마크 기준이라 상호의 정확한 좌표는 아니다. 목록/지도에 '위치 대략' 으로 표시되며,
상세 화면의 '주소 찾기' 로 고르면 정확한 좌표로 덮어쓰인다.`)
