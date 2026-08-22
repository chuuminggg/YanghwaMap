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
// 카카오 초당 제한에 덜 부딪히도록 낮게 잡는다. 제한에 걸린 행을 실패로 굳히면
// geocode_failed_at 이 박혀 다음 배치가 건너뛰므로, 여기서는 보수적인 편이 낫다.
const CONCURRENCY = 3

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

/**
 * 시도 이름만 남은 주소('서울특별시')로는 검색하면 안 된다.
 * 카카오가 아무 점이나 돌려줘서 엉뚱한 좌표가 박힌다.
 */
const searchable = (address: string) =>
  address.replace(/^\S+(?:특별시|광역시|특별자치시|특별자치도|도)\s*/, '').length > 0

/**
 * '효창운동장화장실' -> '효창운동장'
 * 공원·운동장 안 화장실은 정식 건물번호가 없어 주소검색이 통하지 않는다. 시설을 먼저 찾되,
 * 얻은 좌표는 화장실이 아니라 시설 대표 지점이라 오차가 크다 - source 로 구분한다.
 */
const venueName = (name: string) =>
  name.replace(/\([^)]*\)/g, ' ').replace(/(공중|개방|간이|이동)?화장실/g, ' ').replace(/\s+/g, ' ').trim()

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type Hit = { lat: number; lng: number; source: 'road' | 'jibun' | 'keyword' | 'venue' }

/** 초당 제한을 다 쓰고도 못 받았을 때. '결과 없음'과 구분해야 영구 실패로 오기록하지 않는다. */
const RATE_LIMITED = Symbol('rate-limited')
type Answer = { lat: number; lng: number } | null | typeof RATE_LIMITED

async function ask(key: string, path: string, query: string): Promise<Answer> {
  const url = `https://dapi.kakao.com/v2/local/${path}?query=${encodeURIComponent(query)}&size=1`

  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } })

    if (response.status === 429) {
      await sleep(300 * 2 ** attempt) // 지수 백오프: 0.3s, 0.6s, 1.2s, 2.4s, 4.8s
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
  return RATE_LIMITED
}

type Target = { id: string; name: string; road_address: string; jibun_address: string; district: string }

/** 도로명주소 -> 지번주소 -> '구 + 화장실명' 키워드 순으로 시도한다. */
async function geocodeOne(key: string, row: Target): Promise<Hit | null | typeof RATE_LIMITED> {
  let throttled = false
  const attempt = async (path: string, query: string, source: Hit['source']) => {
    const hit = await ask(key, path, query)
    if (hit === RATE_LIMITED) {
      throttled = true
      return null
    }
    return hit ? { ...hit, source } : null
  }

  const road = cleanAddress(row.road_address)
  if (road && searchable(road)) {
    const hit = await attempt('search/address.json', road, 'road')
    if (hit) return hit
  }

  const jibun = cleanAddress(row.jibun_address)
  if (jibun && jibun !== road && searchable(jibun)) {
    const hit = await attempt('search/address.json', jibun, 'jibun')
    if (hit) return hit
  }

  if (row.district && row.name) {
    const hit = await attempt('search/keyword.json', `${row.district} ${row.name}`, 'keyword')
    if (hit) return hit

    // 마지막 수단: 시설명만으로 찾는다
    const venue = venueName(row.name)
    if (venue.length >= 2 && venue !== row.name) {
      const byVenue = await attempt('search/keyword.json', `${row.district} ${venue}`, 'venue')
      if (byVenue) return byVenue
    }
  }

  // 제한에 걸려 못 받은 것뿐이면 실패로 굳히지 않는다 — 다음 배치가 다시 집는다
  return throttled ? RATE_LIMITED : null
}

export type GeocodeResult = {
  processed: number
  located: number
  failed: number
  /** 초당 제한에 걸려 이번엔 건너뛴 수. 실패가 아니라 다음 배치에서 다시 시도된다. */
  throttled: number
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
  let throttled = 0
  let cursor = 0

  const worker = async () => {
    while (cursor < rows.length) {
      const row = rows[cursor++]
      const hit = await geocodeOne(key, row)
      if (hit === RATE_LIMITED) {
        // 좌표도 실패 표시도 남기지 않는다 — 다음 배치가 이 행을 다시 집는다
        throttled++
      } else if (hit) {
        await sql.query('update restrooms set lat = $2, lng = $3, coord_source = $4 where id = $1', [
          row.id,
          hit.lat,
          hit.lng,
          hit.source,
        ])
        located++
      } else {
        // 주소로 정말 못 찾은 행. 다음 배치가 또 붙잡지 않도록 표시한다.
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

  return { processed: rows.length, located, failed, throttled, remaining }
}
