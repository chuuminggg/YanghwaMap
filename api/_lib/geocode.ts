import { db, InvalidInputError } from './db.js'

/**
 * 공중화장실 표준데이터에는 좌표가 없어(2025-02 제공 중단) 주소로 채워야 한다.
 * 브라우저는 카카오 REST API를 직접 부를 수 없으므로(CORS·키 노출) 서버가 대신 호출한다.
 *
 * scripts/restroom-geocode.mjs 와 같은 규칙을 쓰되, 서버리스 실행 시간에 맞춰
 * 한 번에 BATCH_SIZE 건만 처리하고 나머지는 다음 호출로 넘긴다.
 */

/** 서버리스 실행 시간(Hobby 기본 10초) 안에 끝나도록 한 번에 처리할 양 */
export const BATCH_SIZE = 60
const CONCURRENCY = 6

export class MissingKakaoKeyError extends Error {
  constructor() {
    super(
      'KAKAO_REST_API_KEY가 설정되지 않았습니다. 카카오 개발자센터 > 내 애플리케이션 > 앱 키 > ' +
        'REST API 키를 .env.local(로컬) 또는 Vercel 환경 변수(배포)에 넣어 주세요.',
    )
    this.name = 'MissingKakaoKeyError'
  }
}

/** 대한민국 본토 + 도서 범위. 카카오가 엉뚱한 곳을 집어 주는 경우를 거른다. */
const inKorea = (lat: number, lng: number) => lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132

/**
 * '서울특별시 마포구 방울내로 19, 공중화장실 (망원동)' -> '서울특별시 마포구 방울내로 19'
 * 쉼표 뒤 상세주소와 괄호 안 법정동은 카카오 주소검색에서 오히려 매칭을 방해한다.
 */
const cleanAddress = (raw: string) =>
  raw.split(',')[0].replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type Hit = { lat: number; lng: number; source: 'road' | 'jibun' | 'keyword' }

async function ask(key: string, path: string, query: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://dapi.kakao.com/v2/local/${path}?query=${encodeURIComponent(query)}&size=1`

  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } })

    if (response.status === 429) {
      await sleep(300 * (attempt + 1)) // 초당 제한 — 물러섰다 재시도
      continue
    }
    if (response.status === 401 || response.status === 403) {
      throw new InvalidInputError(
        `카카오 인증에 실패했습니다 (HTTP ${response.status}). REST API 키가 맞는지, ` +
          '카카오 개발자센터에서 카카오맵/로컬 API 사용 설정이 켜져 있는지 확인해 주세요.',
      )
    }
    if (!response.ok) return null

    const body = (await response.json()) as { documents?: { x: string; y: string }[] }
    const doc = body.documents?.[0]
    if (!doc) return null

    const lat = Number(doc.y)
    const lng = Number(doc.x)
    return inKorea(lat, lng) ? { lat, lng } : null
  }
  return null
}

type Target = { id: string; name: string; road_address: string; jibun_address: string; district: string }

/** 도로명주소 -> 지번주소 -> '구 + 화장실명' 키워드 순으로 시도한다. */
async function geocodeOne(key: string, row: Target): Promise<Hit | null> {
  const road = cleanAddress(row.road_address)
  if (road) {
    const hit = await ask(key, 'search/address.json', road)
    if (hit) return { ...hit, source: 'road' }
  }

  const jibun = cleanAddress(row.jibun_address)
  if (jibun && jibun !== road) {
    const hit = await ask(key, 'search/address.json', jibun)
    if (hit) return { ...hit, source: 'jibun' }
  }

  if (row.district && row.name) {
    const hit = await ask(key, 'search/keyword.json', `${row.district} ${row.name}`)
    if (hit) return { ...hit, source: 'keyword' }
  }

  return null
}

export type GeocodeResult = {
  processed: number
  located: number
  failed: number
  /** 이 구에 아직 좌표가 없는 나머지 — 0이 될 때까지 클라이언트가 다시 부른다 */
  remaining: number
}

/**
 * 한 자치구에서 좌표가 비어 있는 행을 BATCH_SIZE 만큼 채운다.
 *
 * 실패한 행은 좌표가 없는 채로 남아 다음 호출에 다시 잡힌다. 그래서 매번 같은 행만
 * 재시도하다 끝나지 않는 걸 막으려고, 실패는 geocode_failed_at 에 표시해 건너뛴다.
 */
export async function geocodeDistrict(district: string, retry = false): Promise<GeocodeResult> {
  const key = process.env.KAKAO_REST_API_KEY
  if (!key) throw new MissingKakaoKeyError()

  const sql = db()

  // 실패한 행을 다시 시도한다 (주소 규칙을 고쳤거나 카카오 색인이 갱신된 경우)
  if (retry) {
    await sql.query(
      'update restrooms set geocode_failed_at = null where district = $1 and lat is null',
      [district],
    )
  }

  const rows = (await sql.query(
    `select id, name, road_address, jibun_address, district
       from restrooms
      where district = $1 and lat is null and geocode_failed_at is null
      order by name, id
      limit $2`,
    [district, BATCH_SIZE],
  )) as Target[]

  let located = 0
  let failed = 0
  let cursor = 0

  const worker = async () => {
    while (cursor < rows.length) {
      const row = rows[cursor++]
      const hit = await geocodeOne(key, row)
      if (hit) {
        await sql.query('update restrooms set lat = $2, lng = $3 where id = $1', [row.id, hit.lat, hit.lng])
        located++
      } else {
        // 다음 배치에서 같은 행을 또 붙잡지 않도록 표시한다
        await sql.query('update restrooms set geocode_failed_at = now() where id = $1', [row.id])
        failed++
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  const [{ remaining }] = (await sql.query(
    `select count(*)::int as remaining
       from restrooms
      where district = $1 and lat is null and geocode_failed_at is null`,
    [district],
  )) as { remaining: number }[]

  return { processed: rows.length, located, failed, remaining }
}
